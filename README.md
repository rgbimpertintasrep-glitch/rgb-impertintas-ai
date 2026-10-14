# RGB Impertintas AI + Altis Sync

Projeto de agente comercial, catálogo Supabase, sincronização de exportações Altis e webhook Evolution API.

## Segurança e limites

- Nunca versionar chaves, tokens, exportações Altis ou dados de clientes.
- O export Altis inclui campos internos, inclusive custos. O JSON original será guardado em public.altis_product_raw, sem acesso para anon/authenticated. O agente consulta somente campos normalizados permitidos.
- O export observado apresenta diferenças entre estoque, disponivel e fisico. O saldo fica oculto por padrão. Configure ALTIS_STOCK_FIELD somente após validar no ERP o campo que representa o saldo vendável.
- A captura de rede não comprova que a porta observada seja uma API HTTP de exportação. Não exponha portas do servidor Altis à internet.
- A sincronização por GitHub Actions usa runner conectado ao Tailscale. Ela exige URL real de exportação JSON e secrets configurados.
- O endereço Tailscale por si só não cria uma API de exportação do Altis.

## Componentes

- src/server.ts: API HTTP, chat, importação administrativa e webhook Evolution.
- src/catalog.ts: normalização, preços e regras conservadoras de estoque.
- src/sync.ts + scripts/pull-altis.ts: sync idempotente de snapshot JSON.
- supabase/migrations/0001_catalog_sync.sql: campos e tabelas de integração.
- .github/workflows/altis-sync.yml: workflow agendado via Tailscale.
- render.yaml: deploy opcional no Render.

## Configuração

1. No Supabase do projeto rgb-impertintas-ai, execute supabase/migrations/0001_catalog_sync.sql no SQL Editor.
2. Em GitHub → Settings → Secrets and variables → Actions, configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ALTIS_EXPORT_URL e TAILSCALE_AUTHKEY. Configure também ALTIS_EXPORT_TOKEN e ALTIS_STOCK_FIELD se apropriado. Use SYNC_ADMIN_TOKEN para as rotas administrativas.
3. Configure ALTIS_EXPORT_URL como URL REAL de exportação JSON atendida pelo ERP ou por um serviço de integração autorizado. A URL deve ser acessível pelo runner conectado à sua tailnet. Autorize no Tailscale a rota subnet 192.168.168.0/24 já anunciada pelo computador da loja.
4. Execute Actions → Altis Catalog Sync → Run workflow para validar o primeiro ciclo.
5. No Evolution API, configure evento MESSAGES_UPSERT com destino https://SEU-SERVICO/webhooks/evolution e cabeçalho personalizado x-rgb-webhook-token. O valor deve ser igual a EVOLUTION_WEBHOOK_TOKEN no Render.
6. No Render, conecte o repositório, configure as variáveis de ambiente de .env.example e faça deploy. O plano gratuito pode suspender web services ociosos; a sincronização agendada fica no GitHub Actions.

## Rotas

- GET /healthz — healthcheck.
- GET /readyz — verifica configuração.
- POST /api/chat — chat para teste.
- POST /api/altis/import — importação JSON autenticada por X-Admin-Token.
- POST /api/altis/pull — chama ALTIS_EXPORT_URL, autenticado.
- GET /api/altis/status — última execução, autenticado.
- POST /webhooks/evolution — webhook autenticado.

## Estoque e categoria

Sem ALTIS_STOCK_FIELD, o sistema preserva os quatro campos originais no payload privado mas não anuncia saldo. Mesmo quando configurado, saldo negativo é tratado como desconhecido. Categorias ausentes no export são estimadas pelo nome e marcadas como inferidas. Preço de varejo permanece separado de promoção; promoção só é normalizada em condições simples e não restritas a pagamento em dinheiro.

## Execução opcional fora da nuvem

    npm install
    cp .env.example .env
    npm test
    npm run build
    npm start

A integração direta ao Altis ainda depende de uma API/URL de exportação compatível. O código não tenta adivinhar protocolo proprietário nem escrever diretamente no banco interno do ERP.
