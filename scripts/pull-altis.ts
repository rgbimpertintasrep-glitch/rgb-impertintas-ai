import { createClient } from "@supabase/supabase-js";
import { isStockField } from "../src/catalog.js";
import { pullAltisJson, syncAltisPayload } from "../src/sync.js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");
const field = process.env.ALTIS_STOCK_FIELD || "";
if (field && !isStockField(field)) throw new Error("ALTIS_STOCK_FIELD inválido; deixe vazio ou use um campo permitido.");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function main(): Promise<void> {
  const payload = await pullAltisJson();
  const result = await syncAltisPayload(db, payload, {
    stockField: field,
    maxProducts: Number(process.env.ALTIS_MAX_PRODUCTS || 5000),
    fullSnapshot: process.env.ALTIS_EXPORT_IS_FULL_SNAPSHOT === "true",
    source: "github_actions_altis_export"
  });
  console.log(JSON.stringify({ ok: true, ...result }));
}
main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: (error instanceof Error ? error.message : "Falha desconhecida").slice(0, 500) }));
  process.exitCode = 1;
});
