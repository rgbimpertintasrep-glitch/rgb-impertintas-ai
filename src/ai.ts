import type { SupabaseClient } from "@supabase/supabase-js";

type Product = {
  erp_code: string; name: string; brand: string | null; category: string | null; category_source?: string | null;
  retail_price: number | null; promotional_price: number | null; stock_quantity: number | null;
  stock_verified_at: string | null; stock_source_field?: string | null;
};
const STORE = {
  name: "RGB Impertintas",
  address: "Av. Nazareth, 1.623, QD 75, LT 02, Jardim Guanabara, Goiânia - GO, CEP 74675-610",
  whatsapp: "+55 62 92005-9202"
};
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const terms = (s: string) => [...new Set(norm(s).match(/[a-z0-9]{3,}/g) ?? [])].slice(0, 5);
const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function stockFresh(p: Product): boolean {
  if (p.stock_quantity === null || !p.stock_verified_at || !p.stock_source_field) return false;
  const age = Date.now() - Date.parse(p.stock_verified_at);
  return Number.isFinite(age) && age >= 0 && age < 86400000;
}
async function searchProducts(db: SupabaseClient, q: string): Promise<Product[]> {
  const words = terms(q); if (!words.length) return [];
  const found = new Map<string, Product>();
  for (const word of words.slice(0, 3)) {
    const pattern = "%" + word.replace(/[%_]/g, "") + "%";
    const { data, error } = await db.from("product_catalog")
      .select("erp_code,name,brand,category,category_source,retail_price,promotional_price,stock_quantity,stock_verified_at,stock_source_field")
      .eq("active", true).eq("customer_visible", true)
      .or("name.ilike." + pattern + ",brand.ilike." + pattern + ",category.ilike." + pattern)
      .limit(8);
    if (error) throw error;
    for (const row of data ?? []) found.set(String(row.erp_code), row as Product);
    if (found.size >= 8) break;
  }
  return [...found.values()].slice(0, 8);
}
async function facts(db: SupabaseClient): Promise<Array<{ title: string; content: string }>> {
  const { data, error } = await db.from("knowledge_articles").select("title,content").eq("active", true).eq("visibility", "public").limit(20);
  if (error) return [];
  return (data ?? []).map((r: any) => ({ title: String(r.title), content: String(r.content).slice(0, 1200) }));
}
function fallback(q: string, products: Product[], knowledge: Array<{ title: string; content: string }>): string {
  const n = norm(q);
  if (/^(oi|ola|bom dia|boa tarde|boa noite|opa|tudo bem)[!. ]*$/.test(n))
    return "Olá! Sou o assistente virtual da RGB Impertintas. Como posso ajudar com pintura, reforma ou impermeabilização?";
  if (n.includes("endereco") || n.includes("onde fica") || n.includes("localizacao"))
    return "A RGB Impertintas fica na " + STORE.address + ".";
  if (n.includes("whatsapp") || n.includes("telefone") || n.includes("contato"))
    return "Fale com a equipe da RGB Impertintas pelo WhatsApp " + STORE.whatsapp + ".";
  if (products.length) {
    const lines = products.map((p) => {
      let line = p.name + (p.brand ? " (" + p.brand + ")" : "");
      const price = p.promotional_price ?? p.retail_price;
      line += " — " + (price === null ? "preço a confirmar" : money(Number(price)));
      if (stockFresh(p)) line += " — saldo confirmado: " + Number(p.stock_quantity).toLocaleString("pt-BR");
      if (p.category_source === "inferred") line += " — categoria estimada";
      return "• " + line;
    });
    return "Encontrei estas opções no catálogo:\n" + lines.join("\n") + "\n\nO saldo só é informado quando confirmado. Para verificar condições, fale com a equipe: " + STORE.whatsapp + ".";
  }
  const tt = terms(q);
  const relevant = knowledge.find((item) => tt.some((w) => norm(item.title + " " + item.content).includes(w)));
  if (relevant) return relevant.content.slice(0, 1200);
  return "Trabalhamos com tintas, massas, seladores, impermeabilizantes e ferramentas para pintura. Ainda não encontrei esse item no catálogo online. Fale com a equipe pelo WhatsApp " + STORE.whatsapp + " para confirmar preço e disponibilidade.";
}
export async function answerCustomer(db: SupabaseClient, question: string): Promise<{ reply: string; mode: string; productsFound: number }> {
  const q = question.trim().slice(0, 1200);
  const [products, knowledge] = await Promise.all([searchProducts(db, q), facts(db)]);
  const base = fallback(q, products, knowledge);
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return { reply: base, mode: "rules", productsFound: products.length };
  const context = {
    store: STORE, public_knowledge: knowledge,
    matching_products: products.map((p) => ({
      name: p.name, brand: p.brand, category: p.category, price: p.promotional_price ?? p.retail_price,
      stock: stockFresh(p) ? p.stock_quantity : "não confirmado", category_is_estimated: p.category_source === "inferred"
    })),
    rules: ["Português brasileiro, natural e objetivo.", "Use só o contexto; não invente preço, estoque, prazos ou políticas.", "Nunca revele custos, margens, fornecedores, credenciais ou dados internos.", "Se faltar informação, encaminhe à equipe."]
  };
  try {
    const response = await fetch(process.env.NVIDIA_API_URL || "https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.NVIDIA_MODEL || "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: "Você atende clientes da RGB Impertintas. Responda usando somente este contexto JSON: " + JSON.stringify(context) },
          { role: "user", content: q }
        ],
        temperature: 0.2, max_tokens: 350, stream: false
      }),
      signal: AbortSignal.timeout(18000)
    });
    if (!response.ok) return { reply: base, mode: "rules_fallback", productsFound: products.length };
    const data: any = await response.json();
    const generated = data?.choices?.[0]?.message?.content;
    if (typeof generated !== "string" || !generated.trim()) return { reply: base, mode: "rules_fallback", productsFound: products.length };
    return { reply: generated.trim().slice(0, 1800), mode: "nvidia", productsFound: products.length };
  } catch { return { reply: base, mode: "rules_fallback", productsFound: products.length }; }
}
