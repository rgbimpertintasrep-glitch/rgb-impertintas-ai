import { isStockField } from "../src/catalog.js";

const exportUrl = process.env.ALTIS_EXPORT_URL || "";
const renderUrl = (process.env.RENDER_APP_URL || "").replace(/\/+$/, "");
const adminToken = process.env.SYNC_ADMIN_TOKEN || "";
const maxBytes = 40 * 1024 * 1024;

async function main(): Promise<void> {
  if (!exportUrl || !renderUrl || !adminToken) {
    throw new Error("Configure ALTIS_EXPORT_URL, RENDER_APP_URL e SYNC_ADMIN_TOKEN nos GitHub Actions Secrets.");
  }
  const sourceUrl = new URL(exportUrl);
  if (!["http:", "https:"].includes(sourceUrl.protocol) || sourceUrl.username || sourceUrl.password) {
    throw new Error("ALTIS_EXPORT_URL precisa ser HTTP(S) sem credenciais embutidas.");
  }
  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.ALTIS_EXPORT_TOKEN) headers.authorization = "Bearer " + process.env.ALTIS_EXPORT_TOKEN;

  const source = await fetch(sourceUrl, { headers, signal: AbortSignal.timeout(30000) });
  if (!source.ok) throw new Error("A exportação Altis respondeu HTTP " + source.status + ".");
  if (!(source.headers.get("content-type") || "").toLowerCase().includes("json")) {
    throw new Error("ALTIS_EXPORT_URL não respondeu JSON.");
  }
  const rawText = await source.text();
  if (Buffer.byteLength(rawText, "utf8") > maxBytes) throw new Error("O snapshot excede 40 MiB.");
  let payload: any;
  try { payload = JSON.parse(rawText); } catch { throw new Error("A resposta do Altis não é JSON válido."); }

  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.dados) ? payload.dados : Array.isArray(payload?.products) ? payload.products : null;
  if (!rows) throw new Error("JSON Altis inválido: esperado array, dados[] ou products[].");
  if (rows.length > 5000) throw new Error("O snapshot excede o limite de 5.000 produtos.");
  const stockField = process.env.ALTIS_STOCK_FIELD || "";
  if (stockField && !isStockField(stockField)) throw new Error("ALTIS_STOCK_FIELD não permitido.");

  const endpoint = renderUrl + "/api/altis/import";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-token": adminToken },
    body: JSON.stringify({
      payload,
      options: {
        stockField: stockField || null,
        fullSnapshot: process.env.ALTIS_EXPORT_IS_FULL_SNAPSHOT === "true"
      }
    }),
    signal: AbortSignal.timeout(120000)
  });
  const responseText = await response.text();
  let result: any;
  try { result = JSON.parse(responseText); } catch { result = { error: "O serviço RGB retornou uma resposta não JSON." }; }
  if (!response.ok || result?.ok !== true) {
    throw new Error("O serviço RGB recusou a sincronização (HTTP " + response.status + "): " + String(result?.error || "erro desconhecido").slice(0, 400));
  }
  console.log(JSON.stringify({ ok: true, exported: rows.length, result }));
}
main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: (error instanceof Error ? error.message : "Falha inesperada").slice(0, 600) }));
  process.exitCode = 1;
});
