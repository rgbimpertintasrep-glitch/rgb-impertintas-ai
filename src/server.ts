import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { answerCustomer } from "./ai.js";
import { isStockField } from "./catalog.js";
import { pullAltisJson, syncAltisPayload } from "./sync.js";

const port = Number(process.env.PORT || 3000);
const url = process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const admin = process.env.SYNC_ADMIN_TOKEN || "";
const db: SupabaseClient | null = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
const limits = new Map<string, { since: number; count: number }>();
const MAX_BODY = 40 * 1024 * 1024;

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(data));
}
function equalSecret(a: string, b: string): boolean {
  if (!a || !b) return false;
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
function authorized(req: IncomingMessage, header: string, secret: string): boolean {
  return equalSecret(String(req.headers[header] || ""), secret);
}
async function bodyJson(req: IncomingMessage): Promise<any> {
  if (Number(req.headers["content-length"] || 0) > MAX_BODY) throw new Error("Corpo acima de 40 MiB.");
  const buffers: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += b.length;
    if (size > MAX_BODY) throw new Error("Corpo acima de 40 MiB.");
    buffers.push(b);
  }
  try { return JSON.parse(Buffer.concat(buffers).toString("utf8")); }
  catch { throw new Error("JSON inválido."); }
}
function underRateLimit(req: IncomingMessage): boolean {
  const ip = req.socket.remoteAddress || "unknown", now = Date.now(), v = limits.get(ip);
  if (!v || now - v.since > 60000) { limits.set(ip, { since: now, count: 1 }); if (limits.size > 2500) limits.clear(); return true; }
  v.count++;
  return v.count <= 30;
}
function parsedMessage(body: any) {
  const event = String(body?.event ?? body?.type ?? "").toLowerCase();
  const root = body?.data ?? body?.message ?? {};
  const data = Array.isArray(root?.messages) ? root.messages[0] : root;
  const k = data?.key ?? {}, m = data?.message ?? {};
  let jid = String(k.remoteJid ?? k.remoteJidAlt ?? "");
  if (jid.endsWith("@lid") && String(k.remoteJidAlt ?? "").endsWith("@s.whatsapp.net")) jid = String(k.remoteJidAlt);
  const text = String(m.conversation ?? m.extendedTextMessage?.text ?? m.imageMessage?.caption ??
    m.videoMessage?.caption ?? m.documentMessage?.caption ?? m.buttonsResponseMessage?.selectedDisplayText ??
    m.listResponseMessage?.title ?? "").trim().slice(0, 1200);
  return { event, jid, text, id: String(k.id ?? data?.messageTimestamp ?? ""), fromMe: k.fromMe === true || k.fromMe === "true", instance: String(body?.instance ?? "") };
}
async function handleEvolution(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!authorized(req, "x-rgb-webhook-token", process.env.EVOLUTION_WEBHOOK_TOKEN || "")) return json(res, 401, { error: "Webhook não autorizado." });
  if (!db) return json(res, 503, { error: "Supabase não configurado." });
  let body: any;
  try { body = await bodyJson(req); } catch (e) { return json(res, 400, { error: e instanceof Error ? e.message : "JSON inválido." }); }
  const m = parsedMessage(body);
  if (m.event && !m.event.includes("messages.upsert") && !m.event.includes("messages_upsert")) return json(res, 200, { accepted: true, ignored: true });
  if (m.fromMe || !m.jid || m.jid.endsWith("@g.us") || m.jid.endsWith("@broadcast") || m.jid === "status@broadcast") return json(res, 200, { accepted: true, ignored: true });
  if (!m.jid.endsWith("@s.whatsapp.net") || !m.text) return json(res, 200, { accepted: true, ignored: true });
  const base = (process.env.EVOLUTION_API_URL || "").replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY || "", instance = m.instance || process.env.EVOLUTION_INSTANCE || "";
  if (!base || !apiKey || !instance) return json(res, 503, { error: "Evolution API não configurada." });
  const eventId = createHash("sha256").update(instance + ":" + m.jid + ":" + m.id).digest("hex");
  const senderHash = createHash("sha256").update(m.jid).digest("hex");
  const { error } = await db.from("evolution_processed_events").insert({ event_id: eventId, sender_hash: senderHash, status: "processing" });
  if (error) {
    if (error.code === "23505") return json(res, 200, { accepted: true, duplicate: true });
    return json(res, 503, { error: "Falha ao registrar evento." });
  }
  try {
    const answer = await answerCustomer(db, m.text);
    const sendUrl = base + "/message/sendText/" + encodeURIComponent(instance);
    const number = m.jid.replace(/@s\.whatsapp\.net$/, "");
    const postText = (payload: Record<string, unknown>) => fetch(sendUrl, {
      method: "POST", headers: { "content-type": "application/json", apikey: apiKey },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(15000)
    });
    let sendResponse = await postText({ number, textMessage: { text: answer.reply } });
    if (sendResponse.status === 400) {
      const errorBody = await sendResponse.text();
      // Evolution deployments differ by version: older builds accept textMessage.text,
      // while some newer builds validate a top-level text field.
      if (/requires property\s*["']?text|property ["']text["']/i.test(errorBody)) {
        sendResponse = await postText({ number, text: answer.reply });
      } else {
        throw new Error("Evolution HTTP 400: payload de envio recusado.");
      }
    }
    if (!sendResponse.ok) throw new Error("Evolution HTTP " + sendResponse.status);
    await db.from("evolution_processed_events").update({ status: "sent", processed_at: new Date().toISOString() }).eq("event_id", eventId);
    return json(res, 200, { accepted: true, processed: true, sent: true });
  } catch {
    await db.from("evolution_processed_events").delete().eq("event_id", eventId);
    return json(res, 502, { accepted: true, processed: false, reason: "Falha temporária; o evento pode ser reenviado." });
  }
}
const html = "<!doctype html><html lang='pt-br'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>RGB Impertintas</title><style>body{font:16px system-ui;max-width:720px;margin:32px auto;padding:0 16px;color:#17243d}h1{font-size:24px}#log{border:1px solid #ddd;border-radius:12px;min-height:220px;padding:12px;white-space:pre-wrap;margin-bottom:12px}.row{display:flex;gap:8px}input{flex:1;min-width:0;padding:12px;border:1px solid #bbb;border-radius:8px}button{padding:12px;border:0;border-radius:8px;background:#1d4ed8;color:white;font-weight:bold}small{color:#667085}</style><h1>RGB Impertintas</h1><p>Assistente virtual para pintura, reforma e impermeabilização.</p><div id='log'>Olá! Como posso ajudar?</div><form id='f' class='row'><input id='q' maxlength='1200' placeholder='Digite sua dúvida' required><button>Enviar</button></form><p><small>Preços e estoque são informados somente quando validados. WhatsApp: +55 62 92005-9202.</small></p><script>const f=document.getElementById('f'),q=document.getElementById('q'),log=document.getElementById('log');f.addEventListener('submit',async e=>{e.preventDefault();const m=q.value.trim();if(!m)return;log.textContent='Você: '+m+'\\n\\nConsultando…';q.value='';try{const r=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:m})});const d=await r.json();log.textContent='Você: '+m+'\\n\\nRGB: '+(d.reply||d.error||'Não foi possível responder.')}catch{log.textContent='Falha de conexão. Fale com a equipe pelo WhatsApp +55 62 92005-9202.'}})</script></html>";

const adminHtml = "<!doctype html><html lang='pt-br'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>RGB | Importar catálogo</title><style>body{font:15px system-ui;max-width:760px;margin:28px auto;padding:0 15px;color:#18243b}section{padding:18px;border:1px solid #dde3ec;border-radius:14px;margin:14px 0}input,button{font:inherit;padding:10px;margin:5px 0;max-width:100%}input[type=password],input[type=file]{display:block;width:95%}button{background:#174dcc;color:#fff;border:0;border-radius:8px;cursor:pointer}small{color:#667085}#status{white-space:pre-wrap;overflow-wrap:anywhere;background:#f6f8fb;padding:12px;border-radius:8px}</style><h1>RGB Impertintas · Importação Altis</h1><p>Importa o JSON do Altis para o catálogo consultável e guarda o registro original em tabela restrita.</p><section><label>Chave administrativa (SYNC_ADMIN_TOKEN)<input id='token' type='password' autocomplete='off' required></label><small>A chave é enviada somente no cabeçalho HTTPS desta sessão; não fica salva no navegador.</small></section><section><label>Exportação JSON do Altis<input id='file' type='file' accept='.json,application/json' required></label><p><small>Não envie o arquivo a terceiros. O JSON original pode conter custos e outros dados internos. O servidor deve estar configurado com a chave service-role do Supabase.</small></p><button id='import'>Importar catálogo</button> <button id='check' type='button'>Ver última sincronização</button><div id='status' role='status'>Aguardando arquivo.</div></section><script>const el=id=>document.getElementById(id),status=el('status');el('import').addEventListener('click',async()=>{const file=el('file').files[0],token=el('token').value;if(!file||!token){status.textContent='Escolha o JSON e informe a chave administrativa.';return}if(file.size>40*1024*1024){status.textContent='O arquivo ultrapassa 40 MiB.';return}el('import').disabled=true;status.textContent='Lendo e importando…';try{const payload=JSON.parse(await file.text());const res=await fetch('/api/altis/import',{method:'POST',headers:{'content-type':'application/json','x-admin-token':token},body:JSON.stringify(payload)});const data=await res.json();status.textContent=JSON.stringify(data,null,2);if(!res.ok)status.textContent='Falha HTTP '+res.status+'\\n'+status.textContent}catch(e){status.textContent='Falha: '+(e&&e.message?e.message:'arquivo inválido')}finally{el('import').disabled=false}});el('check').addEventListener('click',async()=>{const token=el('token').value;if(!token){status.textContent='Informe a chave administrativa.';return}try{const res=await fetch('/api/altis/status',{headers:{'x-admin-token':token}});status.textContent=JSON.stringify(await res.json(),null,2)}catch{status.textContent='Não foi possível consultar o status.'}})</script></html>";

const server = createServer(async (req, res) => {
  const method = req.method || "GET", path = new URL(req.url || "/", "http://localhost").pathname;
  if (method === "GET" && path === "/healthz") return json(res, 200, { ok: true, service: "rgb-impertintas-ai" });
  if (method === "GET" && path === "/readyz") {
    const missing: string[] = [];
    if (!url) missing.push("SUPABASE_URL");
    if (!key) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    if (!admin) missing.push("SYNC_ADMIN_TOKEN");
    return json(res, missing.length ? 503 : 200, { ready: missing.length === 0, missing });
  }
  if (method === "GET" && path === "/admin/catalog") { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }); return res.end(adminHtml); }
  if (method === "GET" && path === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    return res.end(html);
  }
  if (method === "POST" && path === "/webhooks/evolution") return handleEvolution(req, res);
  if (method === "POST" && path === "/api/chat") {
    if (!underRateLimit(req)) return json(res, 429, { error: "Muitas mensagens. Tente novamente em um minuto." });
    if (!db) return json(res, 503, { error: "Atendimento indisponível." });
    try {
      const b = await bodyJson(req), message = String(b?.message ?? "").trim().slice(0, 1200);
      if (!message) return json(res, 400, { error: "Digite uma mensagem." });
      return json(res, 200, await answerCustomer(db, message));
    } catch (e) { return json(res, 400, { error: e instanceof Error ? e.message.slice(0, 180) : "Falha ao processar." }); }
  }
  if (path.startsWith("/api/altis/")) {
    if (!authorized(req, "x-admin-token", admin)) return json(res, 401, { error: "Chave administrativa inválida." });
    if (!db) return json(res, 503, { error: "Supabase não configurado." });
    if (method === "GET" && path === "/api/altis/status") {
      const { data, error } = await db.from("altis_sync_runs").select("id,status,source,products_received,products_normalized,raw_saved,started_at,finished_at,error_message,details").order("id", { ascending: false }).limit(1).maybeSingle();
      if (error) return json(res, 500, { error: "Falha de consulta; confira a migração Supabase." });
      return json(res, 200, { lastRun: data ?? null });
    }
    if (method === "POST" && (path === "/api/altis/import" || path === "/api/altis/pull")) {
      try {
        let payload: unknown;
        let submittedOptions: any = {};
        if (path.endsWith("/pull")) payload = await pullAltisJson();
        else {
          const b = await bodyJson(req);
          payload = b && Object.prototype.hasOwnProperty.call(b, "payload") ? b.payload : b;
          submittedOptions = b?.options && typeof b.options === "object" ? b.options : {};
        }
        const stockField = String(submittedOptions.stockField ?? process.env.ALTIS_STOCK_FIELD ?? "");
        if (stockField && !isStockField(stockField)) return json(res, 400, { error: "ALTIS_STOCK_FIELD inválido." });
        const fullSnapshot = typeof submittedOptions.fullSnapshot === "boolean"
          ? submittedOptions.fullSnapshot
          : process.env.ALTIS_EXPORT_IS_FULL_SNAPSHOT === "true";
        const result = await syncAltisPayload(db, payload, {
          stockField, maxProducts: Number(process.env.ALTIS_MAX_PRODUCTS || 5000),
          fullSnapshot,
          source: path.endsWith("/pull") ? "http_altis_pull" : "manual_json"
        });
        return json(res, 200, { ok: true, ...result });
      } catch (e) {
        return json(res, 400, { error: e instanceof Error ? e.message.slice(0, 500) : "Falha na sincronização." });
      }
    }
  }
  return json(res, 404, { error: "Não encontrado." });
});
server.listen(port, "0.0.0.0", () => console.log(JSON.stringify({ service: "rgb-impertintas-ai", port })));
