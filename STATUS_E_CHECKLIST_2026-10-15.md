# Status e checklist — RGB Impertintas AI
**Auditoria realizada em 15/10/2026.** Este relatório distingue verificações feitas de itens ainda pendentes. Não trata a integração como pronta para clientes até os testes finais.

## Resumo executivo

- **Catálogo importado:** 2.018 registros recebidos, normalizados e guardados no Supabase; 1.996 estão ativos e visíveis no catálogo.
- **Preço/nome/marca na importação:** 0 divergências encontradas ao comparar os 2.018 produtos normalizados com o JSON original armazenado do Altis.
- **Preço promocional:** 3 promoções no catálogo; comparação de regras de validação encontrou 0 divergências.
- **Busca por marca:** código corrigido para ignorar palavras de preenchimento, pontuar marca acima de coincidências no nome e responder à disponibilidade da marca com base no catálogo.
- **Recomendação técnica:** correção adicionada para impedir que uma busca por “muro de prata” despeje esmalte metálico/tinta automotiva só porque o nome contém “prata”. Primeiro pergunta se o cliente quer efeito metálico ou cinza-prata comum. A compatibilidade deve preceder o preço.
- **Thinking e ferramentas:** código configurado para habilitar thinking do Nemotron, chamar ferramentas de busca interna no catálogo/artigos e fazer até 3 rodadas de ferramenta. A CI testa tipagem, testes e build; ainda falta teste de ponta a ponta com uma chave NVIDIA válida. Pesquisa de fabricantes na internet só funciona após configurar `TAVILY_API_KEY` no Render.
- **Perfil consultivo persistente:** `rgb_conversation_memory.customer_profile` já foi adicionada no Supabase e versão SQL foi versionada. Guarda prioridades explicitadas (menor preço/custo-benefício/qualidade), marca preferida, experiência, superfície e contexto da obra por até 30 dias.
- **Base técnica inicial:** 6 artigos consultivos com fontes de fabricantes foram adicionados à `public.knowledge_articles`; a tabela agora tem 13 artigos. Isso é uma base inicial, não uma biblioteca técnica completa por SKU.
- **Ainda não está pronto para operação completa:** memória curta e otimizações de contexto foram implementadas e publicadas no Render; falta validação funcional do chat com o banco conectado, configurar a chave Tailscale do workflow e obter a URL real de exportação do Altis. O canal WhatsApp ainda não está conectado à Evolution.

## Checklist do que já foi feito

- [x] Banco Supabase e tabelas de integração criados.
- [x] Primeira importação manual do Altis concluída com sucesso: 2.018 produtos.
- [x] Conferido que os 2.018 códigos ERP são únicos.
- [x] Conferidos nome e marca contra o payload original: 0 divergências.
- [x] Conferido preço de varejo contra o payload original: 0 divergências.
- [x] Conferida regra de preço promocional contra o payload original: 0 divergências.
- [x] Encontrado e corrigido no código o bug de busca “Tem maxvinil?” que dava peso à palavra “tem” e encontrava “temperatura”.
- [x] Adicionados testes para filtrar palavras comuns em português e para responder à pergunta direta de marca só com resultados do catálogo.
- [x] Ajustada a classificação aproximada de produtos com abreviações do Altis e atualizada a categoria de todos os 2.018 registros no banco.
- [x] Corrigida a sintaxe de expressões do GitHub Actions no workflow de sincronização.
- [x] CI GitHub confirmou sucesso nos testes recentes de busca e inferência de categoria: https://github.com/rgbimpertintasrep-glitch/rgb-impertintas-ai/actions
- [x] Criado e atualizado este checklist e o guia para iniciante.

## Memória e consumo de tokens

- [x] Criada a tabela `public.rgb_conversation_memory` com RLS ativado, sem acesso para roles anon/authenticated e acesso de servidor pelo service_role.
- [x] Coluna `customer_profile` jsonb criada e versionada em `supabase/migrations/0002_customer_profile_memory.sql`.
- [x] Site e webhook foram ligados à memória curta. Guarda até 4 trocas encurtadas por sessão, com identidade derivada por HMAC; envia até as 2 últimas trocas ao modelo nas perguntas que precisam de contexto.
- [x] Registros vencidos são removidos periodicamente quando o serviço está ativo; validade da memória: 30 dias.
- [x] Aviso de memória/retensão incluído no rodapé do chat web e na primeira resposta de um contato WhatsApp.
- [x] Respostas simples evitam a NVIDIA quando a regra de catálogo basta; conhecimento limitado a 4 artigos relevantes (até 520 caracteres), até 5 candidatos de produto no contexto, thinking com orçamento de 384 e até 900 tokens de geração na rota complexa; temperatura 0,2. Busca na internet requer `TAVILY_API_KEY`.
- [x] CI passou em typecheck, testes e build para o commit `83ac635`; commits posteriores de aviso de privacidade e documentação também passaram no CI.
- [x] Deploy do Render `dep-db8gipui0phs73fkc5q0` ficou `live` em 15/10/2026 17:12 UTC.
- [ ] Fazer um teste funcional depois do deploy: várias mensagens seguidas na mesma janela web e verificar se perguntas de continuação como “e para fora?” usam contexto anterior. A tabela de memória estava vazia na última consulta porque a versão nova ainda não tinha gerado conversas.
- [ ] Confirmar `NVIDIA_API_KEY` no Render e se o modelo está efetivamente respondendo, em vez de fallback determinístico.
- [ ] Configurar `TAVILY_API_KEY` no Render se quiser pesquisa online de fichas técnicas de fabricantes; ela ainda não foi ativada/testada.
- [ ] Adicionar `TAVILY_API_KEY` no Render, caso queira pesquisa técnica em sites oficiais de fabricantes. Até isso ser feito e testado, internet não está ativa no agente.
- [ ] Testar manualmente “Quero pintar um muro de prata, qual você recomenda?” e confirmar que o sistema pergunta se é efeito metálico ou cinza-prata comum, sem despejar a lista de esmaltes/tinta automotiva.
- [ ] Testar projeto encadeado: responder “só cinza comum” → “pega sol e chuva” → “não quero o mais barato, quero qualidade” → “agora é um portão de madeira”; validar que a memória recupera o contexto útil e substitui o projeto anterior.

## Auditoria do catálogo

### Marca e produtos
- MAXVINIL: 355 produtos ativos/visíveis no catálogo.
- Outras marcas mais frequentes: LUZTOL (240), COLATEX (222), LEINERTEX (177), SHERWIN WILLIAMS (174), SHERWIN AUTOMOTIVO (141), ATLAS (124).
- A consulta não encontrou grupos de nomes duplicados entre produtos ativos/visíveis no catálogo.

### Preços
A comparação de campos comerciais entre o catálogo normalizado e o JSON original do Altis encontrou **0 divergências** para preço de varejo, nome ou marca. Isto demonstra que a importação preservou esses campos do arquivo; não prova que o próprio ERP esteja comercialmente correto hoje.

**8 produtos têm preço zero no JSON exportado; 7 estão ativos no cadastro.** A busca da IA foi alterada para não listar produtos com preço menor ou igual a zero, mas os preços precisam ser corrigidos/confirmados no Altis antes da próxima sincronização:
- `1-1806` — CONJUNTO DE PINTURA E ACABAMENTO 5PCS ATLAS REF4328 — ATLAS.
- `1-2014` — FUNDO PRIMER COLORAU 3,6LTS VERDE — COLORAU.
- `1-1457` — KP-T118 PLACA PCI-EXPRESS — CONDOR.
- `1-1458` — MTG-109 SUPORTE — CONDOR.
- `1-1947` — OPEX MASSA RAPIDA CINZALACA 1,2KG SHERWIN WILLIANS — SHERWIN AUTOMOTIVO.
- `1-2020` — PAPEL ONDULADO ROLO 1,20X30 MTS MELO E COSTA — GERAL.
- `1-1719` — TINTA ACR LEINERTEX FOSCA SUPER LAVAVEL 3,6LTS BRANCO NEVE — CONTORNO (inativo no catálogo).
- `1-1961` — TINTA ACR RENDCOLOR CLASSIC 3,6LTS PALHA — RENDCOLOR.

### Categorias
O JSON analisado não ofereceu uma categoria explícita aproveitável, então as 2.018 categorias estão marcadas com origem `inferred` (inferida), não categoria oficial do Altis. Melhoramos as regras de inferência e atualizamos o campo `category`; 302 produtos ativos/visíveis ainda ficam em “Outros materiais”. Revisão humana continua recomendada para categorias, nomes abreviados e marca atribuída no cadastro fonte. Não afirmar que a categoria é oficial.

### Estoque
- Nenhum produto possui estoque marcado como validado no catálogo.
- Os campos `estoque` e `disponivel` diferem em 1.377 de 2.018 registros.
- Os campos `disponivel` e `fisico` diferem em 16 de 2.018 registros.
- O campo que deve ser informado ao cliente ainda não foi validado com a equipe/fornecedor Altis. Por isso, o sistema não deve dizer que há quantidade disponível; encaminhe a confirmação para a equipe.

## O que falta para concluir

- [x] **Correção de busca implantada no Render:** deploy `dep-db8g8dui0phs73fjac40` está com status `live` desde 15/10/2026 16:50 UTC. A consulta de marca agora ignora palavras de preenchimento, prioriza o campo de marca, e a busca deixa de retornar produtos com preço zero. **Falta o teste funcional manual no navegador:** testar “Tem maxvinil?”, “Tem Luztol?” e “Tem Rhodopás?” no site e confirmar o comportamento visível.
- [ ] **Chave NVIDIA:** confirmar que `NVIDIA_API_KEY` está cadastrada e válida no Render; depois testar uma resposta gerada pela NVIDIA. Os valores secretos não são visíveis pelas ferramentas de auditoria. Sem chave válida, o agente usa regras determinísticas.
- [ ] **Preços zerados:** corrigir ou validar os 8 casos no Altis.
- [ ] **Estoque:** escolher e validar, com responsável do Altis, qual campo significa saldo real vendável antes de popular `ALTIS_STOCK_FIELD`.
- [ ] **Sincronização automática:** o workflow GitHub existe e agenda execução a cada 15 minutos, mas só foi confirmada uma importação manual (`manual_json`); não há sincronização automática bem-sucedida registrada.
- [ ] Criar/adicionar como GitHub Actions Secrets: `TAILSCALE_AUTHKEY`, `ALTIS_EXPORT_URL`, `RENDER_APP_URL=https://rgb-impertintas-ai.onrender.com` e `SYNC_ADMIN_TOKEN` (mesmo valor do Render). `ALTIS_EXPORT_TOKEN` somente se o endpoint exigir. A última execução do workflow falhou no passo Tailscale com a mensagem de que não recebeu uma chave de autenticação; `TAILSCALE_AUTHKEY` está ausente ou vazio.
- [ ] **Bloqueador da sincronização:** obter uma URL real, autorizada e testável que retorne o JSON completo do Altis pela rede privada, via API oficial ou uma ponte local autorizada. O IP Tailscale não é uma API e não basta sozinho. Não inventar URL nem expor o ERP diretamente à internet.
- [ ] Executar manualmente o workflow depois que todos os secrets e a URL real existirem: https://github.com/rgbimpertintasrep-glitch/rgb-impertintas-ai/actions/workflows/altis-sync.yml
- [ ] **WhatsApp:** escolher Evolution API em hospedagem que tenha processo persistente e volume persistente para a sessão, ou adaptar o agente para a API oficial WhatsApp Business Cloud da Meta. A Evolution API separada ainda não está implantada e as variáveis `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_INSTANCE` ainda precisam ser configuradas.
- [ ] Testar mensagem recebida e resposta enviada por WhatsApp com um número interno antes de abrir ao público.
- [ ] Só depois de atendimento estável, trabalhar prospecção/Hermes, com revisão humana, respeito a pedidos de não contato e sem disparos em massa não solicitados.

## Alertas de segurança Supabase

O painel de segurança reportou que estas tabelas no schema `private` estão com Row Level Security (RLS) desativado:
- `private.product_costs`
- `private.integration_settings`
- `private.rate_limits`
- `private.integration_events`
- `private.conversation_audit`

**Não alterei automaticamente as políticas dessas tabelas.** Habilitar RLS sem preparar as permissões pode interromper funções internas; revisar acesso e políticas primeiro. SQL sugerido pelo advisor (não execute até revisar o acesso esperado):

```sql
ALTER TABLE "private"."product_costs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "private"."integration_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "private"."rate_limits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "private"."integration_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "private"."conversation_audit" ENABLE ROW LEVEL SECURITY;
```

As tabelas privadas da integração de catálogo foram criadas com RLS habilitado; devem continuar acessíveis somente pelo lado servidor autorizado. Não copie tokens nem chaves para GitHub como arquivos, para o site público ou para conversas.

## Links úteis

- Site do assistente: https://rgb-impertintas-ai.onrender.com/
- Importação/último status do Altis: https://rgb-impertintas-ai.onrender.com/admin/catalog
- Variáveis do Render: https://dashboard.render.com/web/srv-db7v1jjrjlhs7396tfi0/env
- Workflow de sincronização: https://github.com/rgbimpertintasrep-glitch/rgb-impertintas-ai/actions/workflows/altis-sync.yml
- Guia passo a passo: https://github.com/rgbimpertintasrep-glitch/rgb-impertintas-ai/blob/main/GUIA_PARA_INICIANTE.md
