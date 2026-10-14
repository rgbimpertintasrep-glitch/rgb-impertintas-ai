import type { SupabaseClient } from "@supabase/supabase-js";
import { extractProducts, normalizeProducts } from "./catalog.js";

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
export type SyncResult = { received: number; normalized: number; rawSaved: number; stockField: string | null; deactivated: number };

export async function syncAltisPayload(db: SupabaseClient, payload: unknown, options: { stockField?: string; maxProducts?: number; fullSnapshot?: boolean; source?: string } = {}): Promise<SyncResult> {
  const started = new Date().toISOString();
  const source = options.source ?? "manual_json";
  const received = extractProducts(payload, options.maxProducts ?? 5000);
  let runId: number | null = null;
  const { data: run, error: runError } = await db.from("altis_sync_runs").insert({
    status: "running", source, products_received: received.length, started_at: started,
    details: { stock_field: options.stockField || null, full_snapshot: options.fullSnapshot === true }
  }).select("id").single();
  if (!runError && run) runId = Number(run.id);
  try {
    const products = normalizeProducts(payload, { stockField: options.stockField, maxProducts: options.maxProducts ?? 5000 });
    let rawSaved = 0;
    for (const batch of chunks(products, 100)) {
      const publicRows = batch.map(({ _raw_payload: privatePayload, ...row }) => row);
      const { data: saved, error } = await db.from("product_catalog").upsert(publicRows, { onConflict: "erp_code" }).select("id,erp_code");
      if (error) throw new Error("Falha ao gravar catálogo: " + error.message);
      const ids = new Map<string, string>((saved ?? []).map((item: any) => [String(item.erp_code), String(item.id)]));
      const rawRows = batch.map((row) => ({
        erp_code: row.erp_code, product_id: ids.get(row.erp_code), source_payload: row._raw_payload,
        source_hash: row.source_hash, last_seen_at: row.last_seen_at
      })).filter((row) => Boolean(row.product_id));
      if (rawRows.length) {
        const { error: rawError } = await db.from("altis_product_raw").upsert(rawRows, { onConflict: "erp_code" });
        if (rawError) throw new Error("Falha ao salvar payload privado: " + rawError.message);
        rawSaved += rawRows.length;
      }
    }
    let deactivated = 0;
    if (options.fullSnapshot === true && products.length > 0) {
      const { data: stale, error: staleError } = await db.from("product_catalog")
        .update({ active: false, customer_visible: false, updated_at: new Date().toISOString() })
        .eq("source", "altis_sync").lt("last_seen_at", started).select("id");
      if (staleError) throw new Error("Falha ao inativar produtos ausentes: " + staleError.message);
      deactivated = stale?.length ?? 0;
    }
    if (runId !== null) await db.from("altis_sync_runs").update({
      status: "success", products_normalized: products.length, raw_saved: rawSaved,
      finished_at: new Date().toISOString(),
      details: { stock_field: options.stockField || null, full_snapshot: options.fullSnapshot === true, deactivated }
    }).eq("id", runId);
    return { received: received.length, normalized: products.length, rawSaved, stockField: options.stockField || null, deactivated };
  } catch (err) {
    if (runId !== null) await db.from("altis_sync_runs").update({
      status: "failed", finished_at: new Date().toISOString(),
      error_message: (err instanceof Error ? err.message : "Falha desconhecida").slice(0, 1000)
    }).eq("id", runId);
    throw err;
  }
}

export async function pullAltisJson(): Promise<unknown> {
  const rawUrl = process.env.ALTIS_EXPORT_URL || "";
  if (!rawUrl) throw new Error("ALTIS_EXPORT_URL não está configurada.");
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("ALTIS_EXPORT_URL inválida; use HTTP(S) sem credenciais na URL.");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.ALTIS_EXPORT_TOKEN) headers.Authorization = "Bearer " + process.env.ALTIS_EXPORT_TOKEN;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(Number(process.env.ALTIS_EXPORT_TIMEOUT_MS || 30000)) });
  if (!response.ok) throw new Error("Exportação Altis retornou HTTP " + response.status);
  if (!(response.headers.get("content-type") || "").toLowerCase().includes("json")) throw new Error("A URL configurada não retornou Content-Type JSON.");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > 40 * 1024 * 1024) throw new Error("Exportação maior que 40 MiB.");
  try { return JSON.parse(text); } catch { throw new Error("Resposta da exportação não é JSON válido."); }
}
