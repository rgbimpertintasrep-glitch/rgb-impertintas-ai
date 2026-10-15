# RGB Impertintas AI + Altis Sync

## Comece aqui se você não é técnico

**Leia primeiro o [GUIA PARA INICIANTE](GUIA_PARA_INICIANTE.md).** Ele orienta, passo a passo, como configurar o Supabase, NVIDIA Build, importar o catálogo e entender o que falta para conectar o WhatsApp.


Agente comercial da RGB Impertintas, catálogo consultável em Supabase, sincronização do Altis por exportação JSON e integração Evolution API.

## Links da aplicação

- Atendimento web: https://rgb-impertintas-ai.onrender.com/
- Importação inicial do catálogo: https://rgb-impertintas-ai.onrender.com/admin/catalog
- Healthcheck: https://rgb-impertintas-ai.onrender.com/healthz
- Diagnóstico de configuração: https://rgb-impertintas-ai.onrender.com/readyz
- Repositório: https://github.com/rgbimpertintasrep-glitch/rgb-impertintas-ai

## Segurança e comportamento

- Não versionar chaves, tokens, exportações Altis nem dados de clientes.
- O export Altis inclui dados internos (por exemplo, custos). O JSON integral é salvo em \`public.altis_product_raw\`, com RLS habilitado e permissões revogadas para \`anon\` e \`authenticated\`. O agente de atendimento consulta apenas campos normalizados permitidos.
- O export observado tem divergências entre \`estoque\`, \`disponivel\` e \`fisico\`. O estoque fica **não confirmado por padrão**; informe \`ALTIS_STOCK_FIELD\` somente após validar qual campo representa o saldo vendável.
- Quando a exportação não informa categoria, o sistema estima uma categoria pelo nome e marca \`category_source=inferred\`.
- Não se presume que a porta do Altis seja API HTTP. Não exponha o servidor ERP diretamente à internet. O IP Tailscale sozinho não cria uma URL de exportação.
- O repositório não contém segredos. As credenciais devem ficar nas variáveis do Render ou nos GitHub Actions Secrets.

## O que está publicado

- \`src/server.ts\`: chat web, rotas de importação e status, webhook Evolution autenticado.
- \`src/ai.ts\`: respostas determinísticas e opção de modelo NVIDIA; o modelo recebe somente campos comerciais autorizados.
- \`src/catalog.ts\`: normalização do snapshot, preços promocionais conservadores, categorias inferidas e estoque opcional.
- \`src/sync.ts\`: escrita idempotente de produtos, armazenamento do payload original e auditoria das execuções.
- \`scripts/push-altis.ts\`: obtém o JSON pelo acesso privado e encaminha ao Render por HTTPS.
- \`scripts/pull-altis.ts\`: opção alternativa de sincronização direta (requer chave service-role no ambiente).
- \`supabase/migrations/0001_catalog_sync.sql\`: tabelas para payload restrito, histórico de sync e deduplicação de mensagens.
- \`.github/workflows/ci.yml\`: valida tipagem, testes e build a cada push.
- \`.github/workflows/altis-sync.yml\`: execução manual e agendada a cada 15 minutos.
- \`render.yaml\`: configuração de referência para deploy no Render.

## Primeiro uso — sem instalar código local

### 1. Configurar o serviço no Render

Abra [variáveis de ambiente do serviço](https://dashboard.render.com/web/srv-db7v1jjrjlhs7396tfi0/env):
- \`SUPABASE_URL=https://sxuobjzimaaadrvfhvry.supabase.co\` (já definida na criação).
- \`SUPABASE_SERVICE_ROLE_KEY\`: crie/consulte uma secret key nas configurações de API do projeto Supabase e cole diretamente no campo do Render. **Não envie essa chave no chat nem a coloque no GitHub.**
- \`SYNC_ADMIN_TOKEN\` e \`EVOLUTION_WEBHOOK_TOKEN\`: o Render já tem valores gerados para essas variáveis. Use “Reveal” no dashboard para copiá-los para os lugares indicados abaixo.
- Evolution: preencha \`EVOLUTION_API_URL\`, \`EVOLUTION_API_KEY\` e \`EVOLUTION_INSTANCE\` com os dados da sua instância Evolution.
- \`NVIDIA_API_KEY\` é opcional. Sem ela o agente usa respostas determinísticas baseadas no catálogo.

A aplicação começa a atender produtos somente quando \`SUPABASE_SERVICE_ROLE_KEY\` estiver definida e o catálogo for importado. Depois da alteração, aguarde o Render terminar o deploy/restart.

### 2. Importar o arquivo JSON do Altis

Abra [Importação inicial](https://rgb-impertintas-ai.onrender.com/admin/catalog), copie o \`SYNC_ADMIN_TOKEN\` em Reveal no Render, selecione a exportação JSON que já foi gerada no Altis e clique **Importar catálogo**.

A importação grava:
- catálogo normalizado com nome, código ERP, código de barras, marca e preço de varejo;
- promoção somente quando os campos permitem interpretar uma promoção simples válida;
- payload original completo na tabela restrita do Supabase, incluindo campos não usados pelo agente;
- histórico da execução e contagem de registros importados.

O saldo não é divulgado a menos que se defina e valide um \`ALTIS_STOCK_FIELD\`.

### 3. Preparar a sincronização contínua

No GitHub, abra **Settings → Secrets and variables → Actions → New repository secret** e configure:
- \`TAILSCALE_AUTHKEY\`: auth key adequada para conectar o runner à tailnet, com acesso limitado à rota da loja;
- \`ALTIS_EXPORT_URL\`: URL real de exportação do Altis que retorne JSON e seja acessível através do Tailscale;
- \`ALTIS_EXPORT_TOKEN\`: somente se o endpoint de exportação exigir bearer token;
- \`RENDER_APP_URL=https://rgb-impertintas-ai.onrender.com\`;
- \`SYNC_ADMIN_TOKEN\`: mesmo valor do Render, copiado usando Reveal.

Em **Actions → Altis Catalog Sync**, execute **Run workflow** para testar. Depois, a rotina agendada roda a cada 15 minutos. A rota subnet \`192.168.168.0/24\` deve estar aprovada na tailnet e anunciada pelo computador/roteador Tailscale da loja.

É necessário existir um endpoint real de exportação JSON. A URL precisa ser fornecida pelo fornecedor Altis ou implementada como ponte autorizada acessível pela rede privada. Não foi confirmado que o protocolo/porta observados na captura de rede forneçam essa API. Até a URL ser configurada e testada, a rotina agendada não pode sincronizar sozinha.

Opcionalmente, defina \`ALTIS_STOCK_FIELD\` como variável de repositório GitHub — valores permitidos: \`estoque\`, \`disponivel\`, \`fisico\`, \`disponivelEntregas\`, \`disponivelTodasEmpresas\`. Deixe vazio até validar com a equipe. A variável \`ALTIS_EXPORT_IS_FULL_SNAPSHOT\` deve permanecer \`false\` até confirmar que o endpoint sempre entrega a lista completa; com \`true\`, itens ausentes no snapshot podem ser inativados.

### 4. Configurar Evolution API

Na Evolution API, configure o evento \`MESSAGES_UPSERT\` para enviar POST a:

\`https://rgb-impertintas-ai.onrender.com/webhooks/evolution\`

Configure o cabeçalho personalizado:
\`x-rgb-webhook-token: <valor EVOLUTION_WEBHOOK_TOKEN do Render>\`

No Render, preencha \`EVOLUTION_API_URL\` (base URL sem barra final), \`EVOLUTION_API_KEY\` e \`EVOLUTION_INSTANCE\`. A função ignora mensagens enviadas pelo próprio bot, grupos e status, e deduplica IDs de evento. Teste primeiro com um número interno. O webhook tenta o formato de mensagem compatível com a API Evolution configurada; payloads específicos podem variar por versão.

## Rotas

- \`GET /healthz\` — serviço vivo.
- \`GET /readyz\` — variáveis obrigatórias configuradas.
- \`GET /admin/catalog\` — upload inicial e status; requer token na ação.
- \`POST /api/chat\` — endpoint do chat web.
- \`POST /api/altis/import\` — importação JSON, cabeçalho \`X-Admin-Token\`.
- \`POST /api/altis/pull\` — o servidor busca \`ALTIS_EXPORT_URL\`, autenticado.
- \`GET /api/altis/status\` — status da última sincronização, autenticado.
- \`POST /webhooks/evolution\` — webhook, cabeçalho \`x-rgb-webhook-token\`.

## Observações de disponibilidade

Render Free pode suspender o web service por inatividade; a primeira visita pode demorar. O workflow GitHub Actions é o agendador de sincronização, mas precisa de secrets e endpoint Altis configurados. O catálogo Supabase recebeu uma importação manual em 15/10/2026: 2.018 produtos, 1.996 ativos/visíveis. A rotina automática ainda depende de uma URL de exportação JSON autorizada do Altis e dos GitHub Actions Secrets. Consulte [STATUS_E_CHECKLIST_2026-10-15.md](STATUS_E_CHECKLIST_2026-10-15.md).

A migração \`rgb_altis_catalog_sync\` foi aplicada ao Supabase. O alerta de segurança do projeto também identificou tabelas antigas em \`private\` sem RLS (\`product_costs\`, \`integration_settings\`, \`rate_limits\`, \`integration_events\`, \`conversation_audit\`). Essas tabelas precisam de revisão própria; a migração desta integração protege as novas tabelas e não altera automaticamente as permissões antigas.
