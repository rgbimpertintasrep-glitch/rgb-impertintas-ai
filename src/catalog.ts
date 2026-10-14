import { createHash } from "node:crypto";

export type JsonRecord = Record<string, unknown>;
export const ALLOWED_STOCK_FIELDS = ["estoque", "disponivel", "fisico", "disponivelEntregas", "disponivelTodasEmpresas"] as const;
export type StockField = typeof ALLOWED_STOCK_FIELDS[number];

export function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}
export function scalarText(value: unknown, max = 240): string {
  return value === null || value === undefined ? "" : String(value).trim().slice(0, max);
}
export function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}
function yes(v: unknown): boolean {
  return v === true || v === 1 || (typeof v === "string" && ["S", "SIM", "TRUE", "1", "YES"].includes(v.trim().toUpperCase()));
}
function no(v: unknown): boolean {
  return v === false || v === 0 || (typeof v === "string" && ["N", "NAO", "NÃO", "FALSE", "0", "NO"].includes(v.trim().toUpperCase()));
}
function inferCategory(name: string): string {
  const n = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(tinta|esmalte|latex|acrilic|verniz|stain|selador|fundo preparador|primer|zarcao)\b/.test(n)) return "Tintas e complementos";
  if (/\b(massa|gesso|argamassa|rejunte|cimento|cal hidratada)\b/.test(n)) return "Massas e preparação";
  if (/\b(impermeabil|manta liquida|vedacit|rhodopas|silicone|pu 40|selante)\b/.test(n)) return "Impermeabilização e vedação";
  if (/\b(lixa|lixamento|abrasiv)\b/.test(n)) return "Lixas e abrasivos";
  if (/\b(rolo|pincel|trincha|broxa|espatula|desempenadeira|bandeja|fita crepe|prolongador)\b/.test(n)) return "Ferramentas de pintura";
  if (/\b(thinner|solvente|aguarras|removedor|diluente)\b/.test(n)) return "Solventes e limpeza";
  if (/\b(luva|mascara|oculos|respirador|epi)\b/.test(n)) return "Proteção e EPI";
  return "Outros materiais";
}

export function normalizeAltisProduct(rawValue: unknown, options: { stockField?: string; now?: Date } = {}): (JsonRecord & { erp_code: string; name: string; active: boolean }) | null {
  const raw = asRecord(rawValue);
  if (!raw) return null;
  const name = scalarText(raw.nome ?? raw.nomeTela ?? raw.name, 240);
  const id = scalarText(raw.produtoId ?? raw.id ?? raw.erp_code ?? raw.codigo, 100);
  const company = scalarText(raw.empresaId ?? "altis", 80);
  if (!name || !id) return null;
  const now = options.now ?? new Date();
  const retailRaw = parseNumber(raw.precoVarejo ?? raw.retail_price);
  const retail = retailRaw !== null && retailRaw >= 0 ? Math.round(retailRaw * 100) / 100 : null;
  const promoRaw = parseNumber(raw.precoPromocional ?? raw.promotional_price);
  const end = raw.dataFinalPromocao ? Date.parse(String(raw.dataFinalPromocao)) : NaN;
  const minPromo = parseNumber(raw.qtdeMinPromocao);
  const promoValid = promoRaw !== null && promoRaw > 0 && retail !== null && promoRaw < retail &&
    !yes(raw.precoPromoSomenteDinheiro) && (minPromo === null || minPromo <= 1) &&
    (!Number.isFinite(end) || end >= now.getTime());
  const promo = promoValid ? Math.round((promoRaw as number) * 100) / 100 : null;
  const explicitCategory = scalarText(raw.categoria ?? raw.grupoNome ?? raw.category, 120);
  const candidateField = options.stockField ?? "";
  const stockField = (ALLOWED_STOCK_FIELDS as readonly string[]).includes(candidateField) ? candidateField : "";
  const rawStock = stockField ? parseNumber(raw[stockField]) : null;
  const stock = rawStock !== null && rawStock >= 0 ? rawStock : null;
  const active = !(no(raw.ativo) || yes(raw.bloqueadoVendas));
  const barcode = scalarText(raw.codigoBarras, 80) || null;
  return {
    erp_code: company + "-" + id,
    barcode,
    name,
    brand: scalarText(raw.nomeMarca ?? raw.brand, 120) || null,
    category: explicitCategory || inferCategory(name),
    category_source: explicitCategory ? "altis" : "inferred",
    retail_price: retail,
    promotional_price: promo,
    stock_quantity: stock,
    stock_source_field: stock === null ? null : stockField,
    stock_verified_at: stock === null ? null : now.toISOString(),
    customer_visible: active && !yes(raw.servico),
    active,
    source: "altis_sync",
    source_hash: createHash("sha256").update(JSON.stringify(raw)).digest("hex"),
    last_seen_at: now.toISOString(),
    updated_at: now.toISOString(),
    _raw_payload: raw
  };
}

export function extractProducts(payload: unknown, maxProducts = 5000): JsonRecord[] {
  const root = asRecord(payload);
  const list = Array.isArray(payload) ? payload : Array.isArray(root?.dados) ? root.dados : Array.isArray(root?.products) ? root.products : null;
  if (!list) throw new Error("Exportação Altis inválida: esperado array, dados[] ou products[].");
  if (list.length > maxProducts) throw new Error("Exportação excede o limite configurado de produtos.");
  return list.map(asRecord).filter((v): v is JsonRecord => v !== null);
}
export function normalizeProducts(payload: unknown, options: { stockField?: string; maxProducts?: number; now?: Date } = {}): Array<JsonRecord & { erp_code: string; name: string; active: boolean }> {
  const unique = new Map<string, JsonRecord & { erp_code: string; name: string; active: boolean }>();
  for (const row of extractProducts(payload, options.maxProducts ?? 5000)) {
    const normalized = normalizeAltisProduct(row, options);
    if (normalized) unique.set(normalized.erp_code, normalized);
  }
  return [...unique.values()];
}
export function isStockField(value: string): value is StockField {
  return (ALLOWED_STOCK_FIELDS as readonly string[]).includes(value);
}
