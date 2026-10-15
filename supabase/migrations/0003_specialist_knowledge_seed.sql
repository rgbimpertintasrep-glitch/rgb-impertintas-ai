-- Seed concise, source-linked product guidance for the RGB sales advisor.
-- These articles are general guardrails; the product-specific technical bulletin always takes precedence.
INSERT INTO public.knowledge_articles (title, content, visibility, category, active)
SELECT v.title, v.content, v.visibility, v.category, v.active
FROM (VALUES
  (
    'Diagnóstico consultivo: escolher produto pela superfície',
    'Antes de recomendar tinta ou revestimento, confirme o que será pintado (alvenaria/parede, madeira, metal, telha, piso ou outra superfície), se fica em área interna ou externa, o estado atual e o objetivo. Fabricantes separam famílias por superfície. Esmalte de metal/madeira e tinta automotiva não são substitutos automáticos de tinta para parede; nome ou cor no rótulo não prova compatibilidade. Confirme no boletim técnico do produto a superfície indicada, preparo, diluição, demãos, secagem e rendimento. Fontes oficiais: https://www.luztol.com.br/produtos/ e https://www.suvinil.com.br/. Este guia orienta o diagnóstico, mas não substitui a ficha técnica específica.',
    'public', 'technical_guidance', true
  ),
  (
    'Cor indisponível: como encontrar uma alternativa honesta',
    'Se a cor solicitada não aparecer no catálogo, não encerre a venda e não prometa uma cor idêntica sem confirmação. Procure primeiro pelo nome/código exato; depois pelo mesmo tipo de produto e aplicação; por fim, apresente tons próximos confirmados e explique claramente que são aproximações. Cores exibidas em telas podem divergir da amostra física. Maxvinil publica boletins técnicos e conteúdo de tintometria; Leinertex descreve seu sistema tintométrico. Isso não comprova que a RGB tenha máquina, base ou fórmula disponível para toda cor: confirme internamente antes de prometer mistura ou encomenda. Peça código, leque, foto ou amostra se necessário. Fontes: https://maxvinil.com.br/downloads/ e https://leinertex.com.br/.',
    'public', 'color_matching', true
  ),
  (
    'Muro e fachada externa: critérios de compatibilidade',
    'Para muro ou fachada exposta ao sol e à chuva, busque produto cuja ficha técnica declare uso externo em alvenaria. Não selecione uma linha apenas pelo nome da cor ou pelo menor preço. Primeiro identifique se o substrato está no reboco cru/novo, já pintado, descascando ou com umidade. Problemas de infiltração precisam de diagnóstico da origem antes da pintura. Use somente orientações de preparo, selador/fundo, massa, diluição, demãos e rendimento confirmadas na ficha técnica do sistema escolhido. A Suvinil descreve linhas específicas para alvenaria externa e a Leinertex separa produtos por ambiente/acabamento; confira o produto exato. Fontes oficiais: https://www.suvinil.com.br/ e https://leinertex.com.br/produtos/.',
    'public', 'wall_painting', true
  ),
  (
    'Impermeabilizantes Rhodopás: escolher conforme a superfície',
    'A documentação pública da Rhodopás apresenta usos diferentes entre produtos: AM712 para impermeabilização de paredes/fachadas e lajes de concreto; Manta Líquida para superfícies sem tráfego de pedestres ou veículos, como lajes de concreto e terraços; Paredes e Fachadas para superfícies expostas à chuva, com aplicação sobre reboco, concreto e fibrocimento conforme a indicação publicada. Não trate esses produtos como equivalentes nem prometa que resolvam qualquer infiltração. Descubra primeiro onde a água entra e confirme no boletim técnico do produto a base permitida, preparação, condições de uso e aplicação. Fonte oficial: https://rhodopas.com.br/.',
    'public', 'waterproofing', true
  ),
  (
    'Como comparar preço, qualidade e custo-benefício',
    'Compare preços somente entre produtos adequados à mesma superfície e ao mesmo objetivo. O menor preço da embalagem não prova menor custo final: quando a ficha técnica permite, considere tamanho da embalagem, rendimento declarado, demãos indicadas, preparo necessário e materiais complementares. Não invente rendimento ou durabilidade; use o boletim do produto específico. Respeite a preferência explicitada pelo cliente: menor preço, equilíbrio de custo-benefício, qualidade/durabilidade ou marca. Se a preferência mudar a recomendação e não estiver clara, faça uma pergunta simples. Use preço do catálogo RGB para a oferta da loja; preço de site de fabricante não é preço RGB nem confirma estoque local.',
    'public', 'sales_advice', true
  ),
  (
    'Produto ou marca não encontrado: preservar a venda sem enganar',
    'Quando não houver correspondência exata, faça buscas em etapas: produto/cor exatos; mesmo tipo de produto para a superfície; outra marca compatível; e, por último, tom ou acabamento próximo confirmado. Explique qual parte é equivalente e qual é diferente. “Cadastrado no catálogo” não significa estoque físico confirmado. Nunca diga que uma cor é idêntica, que pode ser preparada na loja ou que há pronta-entrega sem confirmação. Se não existir evidência técnica suficiente, informe a dúvida e ofereça confirmar ficha técnica, cor/código e disponibilidade com a equipe antes de fechar a venda.',
    'public', 'sales_advice', true
  )
) AS v(title, content, visibility, category, active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_articles existing WHERE existing.title = v.title
);
