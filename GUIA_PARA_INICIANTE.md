# Guia para iniciante — ativar a IA da RGB Impertintas

**Siga os passos na ordem. Não precisa instalar nada no computador nem mexer no código.** Abra os links em outra aba para não perder este guia.

## Antes de começar: o que está pronto e o que falta

Já está publicado:
- Site do agente: https://rgb-impertintas-ai.onrender.com/
- Tela de importação do catálogo: https://rgb-impertintas-ai.onrender.com/admin/catalog
- Código versionado: https://github.com/rgbimpertintasrep-glitch/rgb-impertintas-ai
- Projeto Supabase criado e tabelas de sincronização criadas.
- O código tem o webhook que conversa com a Evolution API, mas **a própria Evolution API ainda não foi implantada como um serviço separado**.
- O catálogo do Supabase ainda está vazio até importar o JSON do Altis.
- O modelo NVIDIA já está selecionado no código e no Render, mas a chave pessoal da NVIDIA ainda precisa ser adicionada.

**Importante:** publicar o agente não conecta automaticamente o WhatsApp. A aplicação web, o banco de dados, o modelo de IA e a Evolution API são componentes diferentes.

## Passo 1 — ligar o banco de dados ao agente

1. Abra o [projeto RGB no Supabase](https://supabase.com/dashboard/project/sxuobjzimaaadrvfhvry).
2. No menu do projeto, abra **Settings / Project Settings → API Keys**. Se o menu estiver diferente, procure por **API Keys** nas configurações.
3. Crie uma **Secret API Key** para o servidor, por exemplo com o nome rgb-agent-render. A chave nova normalmente começa com sb_secret_. Não selecione a chave pública sb_publishable_.
4. Copie a chave secreta. Ela dá acesso elevado ao banco; trate-a como senha de administrador. Não a envie no chat, não a coloque no GitHub e não cole em uma página de navegador.
5. Abra as [variáveis do serviço Render](https://dashboard.render.com/web/srv-db7v1jjrjlhs7396tfi0/env).
6. Procure a variável SUPABASE_SERVICE_ROLE_KEY. Se não existir, clique em **Add Environment Variable**.
7. Preencha:
   - **Key / Nome:** SUPABASE_SERVICE_ROLE_KEY
   - **Value / Valor:** cole a chave secreta que copiou do Supabase.
8. Clique em **Save, Save Changes ou Deploy** conforme a opção mostrada pelo Render. Espere terminar o deploy.

O nome SUPABASE_SERVICE_ROLE_KEY é o nome que o nosso código já espera; ele pode receber a nova chave sb_secret_. O segredo fica no Render, não no repositório. A chave secreta ignora as políticas RLS e por isso só deve ficar no servidor. Referência oficial: https://supabase.com/docs/guides/getting-started/api-keys

### Como saber se deu certo

Abra https://rgb-impertintas-ai.onrender.com/readyz

- Se aparecer ready: true, as variáveis obrigatórias foram encontradas.
- Se aparecer SUPABASE_SERVICE_ROLE_KEY na lista missing, volte ao Render e confira o nome da variável e se salvou.
- Esse teste verifica a configuração, mas ainda não prova que o catálogo foi carregado.

## Passo 2 — ativar o modelo de IA NVIDIA Build

A personalidade e o funcionamento do agente já usam o endpoint compatível da NVIDIA. Falta cadastrar a chave pessoal.

1. Abra o modelo [NVIDIA Nemotron 3.5 Lightning 30B A3B](https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b).
2. Entre na sua conta NVIDIA ou crie uma conta, se solicitado.
3. Na página do modelo, procure **Get API Key** ou a opção para obter a chave. Siga as instruções de login e clique para gerar/copiar a chave.
4. **Não envie a chave para mim nem a salve no GitHub.** Copie diretamente para o Render, como no próximo item.
5. Abra novamente as [variáveis do Render](https://dashboard.render.com/web/srv-db7v1jjrjlhs7396tfi0/env).
6. Adicione ou edite:
   - NVIDIA_API_KEY = sua chave copiada da NVIDIA
   - NVIDIA_MODEL = nvidia/nemotron-3.5-lightning-30b-a3b
   - NVIDIA_API_URL = https://integrate.api.nvidia.com/v1/chat/completions
7. Salve e espere o serviço terminar de implantar.

A configuração padrão foi trocada para este modelo porque a página do modelo anterior, openai/gpt-oss-120b, marca o endpoint gratuito como depreciado. O catálogo NVIDIA lista atualmente o modelo Nemotron acima com endpoint gratuito, mas limites, disponibilidade e condições podem mudar. Se a NVIDIA devolver erro ou atingir limite, o agente volta às respostas de segurança sem o modelo; ele não deve inventar preços ou estoque.

Referência oficial para obter a chave: https://docs.api.nvidia.com/nim/docs/api-quickstart

## Passo 3 — importar todos os produtos do Altis

Use o arquivo JSON exportado do Altis que você já tem. **Não envie esse arquivo para o GitHub**, pois ele pode conter custos e informações comerciais internas.

1. Confirme primeiro que o Passo 1 foi concluído e que /readyz mostra ready: true.
2. Abra a [tela de importação do catálogo](https://rgb-impertintas-ai.onrender.com/admin/catalog).
3. No Render, abra Environment e localize SYNC_ADMIN_TOKEN. Use a opção de revelar/copiar valor, caso esteja disponível. Esse é o token administrativo que a aplicação usa para proteger a importação. Não é a chave do Supabase.
4. Na tela de importação, cole o valor de SYNC_ADMIN_TOKEN.
5. Selecione no computador o JSON exportado do Altis.
6. Clique em **Importar catálogo** e aguarde a resposta.
7. A tela deve apresentar um resultado com a quantidade de produtos recebidos, normalizados e gravados. Se aparecer um erro, copie somente o texto do erro — nunca copie segredos.
8. Para ver a última importação depois, use o botão **Ver última sincronização** na mesma tela.

O sistema salva os campos originais do export numa tabela restrita do Supabase, mas a IA consulta somente campos comerciais autorizados, como nome, marca e preço. O saldo fica oculto porque o arquivo possui divergências entre estoque, disponivel e fisico; não escolha um campo de estoque sem validar qual é o saldo de venda correto.

### Se a importação falhar

- **Erro de configuração/Supabase:** volte ao Passo 1.
- **Chave administrativa inválida:** confira SYNC_ADMIN_TOKEN no Render; o valor digitado deve ser exatamente igual.
- **JSON inválido:** confira se selecionou a exportação JSON original do Altis, não um PDF, planilha ou captura de tela.
- **Timeout ou erro 5xx:** aguarde o serviço acordar e tente de novo. O plano gratuito do Render pode suspender aplicações inativas.

## Passo 4 — testar o agente sem WhatsApp

Abra https://rgb-impertintas-ai.onrender.com/

Teste estas mensagens uma de cada vez:
1. Bom dia
2. Vocês trabalham com Maxvinil?
3. Qual o preço do esmalte Cobert ex 3,6 L camurça? (use o nome tal como aparece no seu catálogo)
4. Preciso pintar uma parede. O que vocês precisam saber para me orientar?

Confira se o preço coincide com o Altis. Não considere o estoque validado ainda. A personalidade do agente foi configurada para ser acolhedora, prática, consultiva e curta, como um bom atendente de balcão da RGB — sem inventar dados e sem pressionar o cliente.

Se a NVIDIA ainda não estiver configurada, o sistema pode responder em modo de regras. Isso é normal; o modelo generativo só entra em uso depois de cadastrar NVIDIA_API_KEY.

## Passo 5 — ligar o WhatsApp: a Evolution API ainda precisa existir

Esta etapa é diferente da criação do agente. A URL /webhooks/evolution já existe no nosso código, mas a instância Evolution API em si ainda **não está implantada**. Não adianta preencher EVOLUTION_API_URL com uma URL inventada.

### Antes de escolher onde rodar

A Evolution API oficial usa armazenamento da sessão do WhatsApp em /evolution/instances e documenta um volume persistente. No Render Free, arquivos locais podem ser perdidos e o serviço pode suspender após 15 minutos sem tráfego; o plano gratuito também não oferece disco persistente. Isso pode desconectar o WhatsApp ou exigir novo pareamento por QR. Por isso não é correto prometer um atendimento comercial confiável 24 horas com Evolution no Render Free.

Você tem dois caminhos reais:

**Caminho A — Evolution API:** usar um host que mantenha o processo sempre ativo e os arquivos de sessão persistentes (por exemplo, um serviço pago com disco persistente ou um servidor privado/VPS). Também precisa configurar a base de dados/cache exigidos pela implantação escolhida. A documentação oficial de Evolution explica Docker, banco e volume de sessão:
- https://doc.evolution-api.com/v2/en/install/docker
- https://github.com/evolution-foundation/evolution-api
- Limitações oficiais do Render Free: https://render.com/docs/free

**Caminho B — WhatsApp Business Cloud API oficial:** não precisa hospedar a Evolution API. Exige configurar a aplicação/conta da Meta e adaptar o webhook do agente à API oficial. É uma alternativa a considerar quando se quer reduzir a manutenção de um servidor de sessão do WhatsApp.

Não crie a Evolution no Render Free para um número de atendimento importante esperando que ela seja permanente. Primeiro conclua os Passos 1–4. Depois escolha A ou B de acordo com o orçamento e o número de WhatsApp que será conectado.

### Como será a ligação quando a Evolution estiver hospedada

Depois de ter uma URL real da Evolution e conectar o número por QR:
1. No Render do agente, preencha EVOLUTION_API_URL com a URL base da Evolution (sem barra final).
2. Preencha EVOLUTION_API_KEY com a chave de autenticação da Evolution.
3. Preencha EVOLUTION_INSTANCE com o nome exato da instância conectada.
4. Copie EVOLUTION_WEBHOOK_TOKEN da configuração do Render do agente.
5. Na configuração de webhook da Evolution, defina o destino https://rgb-impertintas-ai.onrender.com/webhooks/evolution, evento MESSAGES_UPSERT e cabeçalho personalizado x-rgb-webhook-token com o token do passo anterior.
6. Teste primeiro com seu próprio número e confirme que uma mensagem recebida gera apenas uma resposta. Não ative prospecção automática nessa etapa.

**Não compartilhe aqui a chave de API da Evolution, a chave do Supabase, a chave da NVIDIA nem os tokens do Render.** Digite cada segredo diretamente na plataforma que o usa.

## Passo 6 — sincronização automática do Altis (depois do primeiro teste)

O GitHub já tem um workflow preparado para rodar a cada 15 minutos, mas ele precisa de uma URL real de exportação JSON do Altis. O endereço Tailscale não é uma API e não cria a exportação sozinho.

A sincronização recorrente só poderá ser ligada quando você tiver uma URL que realmente devolva o JSON completo do Altis através da rede privada. Ela pode vir de um recurso oficial do fornecedor ou de uma ponte autorizada. Não exponha a porta do ERP diretamente à internet.

Depois disso, em GitHub → Settings → Secrets and variables → Actions, configure TAILSCALE_AUTHKEY, ALTIS_EXPORT_URL, RENDER_APP_URL com valor https://rgb-impertintas-ai.onrender.com e SYNC_ADMIN_TOKEN com o mesmo valor do Render. ALTIS_EXPORT_TOKEN é opcional. Só marque ALTIS_EXPORT_IS_FULL_SNAPSHOT=true se tiver certeza de que cada export contém a lista completa; caso contrário, produtos ausentes poderiam ser inativados.

Workflow: https://github.com/rgbimpertintasrep-glitch/rgb-impertintas-ai/actions/workflows/altis-sync.yml

## Passo 7 — prospecção em Goiânia e Hermes: deixar para depois

O primeiro objetivo é responder corretamente aos clientes atuais. Só depois de atendimento, catálogo e WhatsApp estarem estáveis, faz sentido ativar a prospecção.

A futura rotina pode:
1. encontrar empresas com perfil compatível num raio de até 15 km da loja;
2. registrar nome, categoria, endereço, telefone comercial e fonte do dado;
3. priorizar o lead pelo tipo de negócio, sinais de manutenção/reforma e adequação aos materiais RGB;
4. preparar uma mensagem individualizada e mostrar o motivo da recomendação;
5. deixar você aprovar o primeiro contato;
6. qualificar a resposta e enviar a você um resumo do lead, necessidade, urgência e próximo passo.

O sistema deve respeitar pedidos para não receber novas mensagens e evitar disparos em massa. Mensagens frias automatizadas podem causar bloqueio do WhatsApp e gerar risco de conformidade. O Hermes Agent é uma plataforma separada de agente autônomo, não um modelo de IA que já esteja conectado neste repositório; sua configuração deve ser uma etapa posterior, com permissões limitadas e aprovação humana.

## Checklist final

- [ ] SUPABASE_SERVICE_ROLE_KEY está definida no Render e /readyz mostra ready: true.
- [ ] NVIDIA_API_KEY está definida no Render.
- [ ] Catálogo importado e contagem conferida.
- [ ] Preços testados no site contra o Altis.
- [ ] Decidido onde hospedar a Evolution com persistência, ou optar pela API oficial da Meta.
- [ ] WhatsApp testado em conversa individual antes de abrir aos clientes.
- [ ] Só então iniciar a sincronização automática e a prospecção de leads.
