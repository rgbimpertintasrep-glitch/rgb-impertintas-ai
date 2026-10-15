import test from "node:test";
import assert from "node:assert/strict";
import { extractProducts, isStockField, normalizeAltisProduct, normalizeProducts, parseNumber } from "../src/catalog.js";
import { brandAvailabilityReply, queryTerms, isContextCorrection, isExplicitPriceQuestion, priceReplyFromCatalog, productForCustomer } from "../src/ai.js";

test("extracts the Altis dados array", () => {
  assert.equal(extractProducts({ dados: [{ produtoId: 1, nome: "Produto" }] }).length, 1);
});
test("uses stable ERP key and does not assume stock", () => {
  const row = normalizeAltisProduct({
    empresaId: 1, produtoId: 7, nome: "TINTA ACRILICA 18L", nomeMarca: "MAXVINIL",
    precoVarejo: 129.9, estoque: -1, disponivel: 4, fisico: 4, ativo: "S", bloqueadoVendas: "N"
  });
  assert.ok(row);
  assert.equal(row.erp_code, "1-7");
  assert.equal(row.brand, "MAXVINIL");
  assert.equal(row.retail_price, 129.9);
  assert.equal(row.stock_quantity, null);
  assert.equal(row.stock_source_field, null);
  assert.equal(row.category_source, "inferred");
  assert.ok(row._raw_payload);
});
test("uses only the explicitly selected valid stock field", () => {
  const row = normalizeAltisProduct({
    empresaId: 1, produtoId: 2, nome: "ROLO", estoque: -1, disponivel: 3, fisico: 4, ativo: "S", bloqueadoVendas: "N"
  }, { stockField: "disponivel", now: new Date("2026-01-01T00:00:00Z") });
  assert.equal(row?.stock_quantity, 3);
  assert.equal(row?.stock_source_field, "disponivel");
  assert.equal(row?.stock_verified_at, "2026-01-01T00:00:00.000Z");
});
test("promotion must be lower and not cash-only", () => {
  const ok = normalizeAltisProduct({
    empresaId: 1, produtoId: 9, nome: "ESMALTE", precoVarejo: 100, precoPromocional: 89,
    qtdeMinPromocao: 1, ativo: "S", bloqueadoVendas: "N"
  }, { now: new Date("2026-01-01T00:00:00Z") });
  const cashOnly = normalizeAltisProduct({
    empresaId: 1, produtoId: 10, nome: "ESMALTE", precoVarejo: 100, precoPromocional: 89,
    precoPromoSomenteDinheiro: "S", ativo: "S", bloqueadoVendas: "N"
  });
  assert.equal(ok?.promotional_price, 89);
  assert.equal(cashOnly?.promotional_price, null);
});
test("rejects oversized or malformed exports; parses currency decimals conservatively", () => {
  assert.equal(normalizeProducts({ dados: [null, {}, { produtoId: 1, nome: "OK" }] }).length, 1);
  assert.throws(() => extractProducts({ dados: [{}, {}, {}] }, 2), /limite/);
  assert.equal(parseNumber("15,50"), 15.5);
  assert.equal(parseNumber("R$ 15,50"), null);
  assert.equal(isStockField("disponivel"), true);
  assert.equal(isStockField("estoqueAtual"), false);
});

test("ignores Portuguese filler words so product queries prioritize the requested brand", () => {
  assert.deepEqual(queryTerms("Tem maxvinil?"), ["maxvinil"]);
  assert.deepEqual(queryTerms("Vocês têm tinta Maxvinil, por favor?"), ["maxvinil"]);
});

test("answers direct brand availability only from matching catalog results", () => {
  const product = {
    erp_code: "1-1015", name: "ACR PINTAMAX FOS BRANCO NEVE GL 3,6L MAXVINIL",
    brand: "MAXVINIL", category: "Tintas e complementos", category_source: "inferred",
    retail_price: 49.9, promotional_price: null, stock_quantity: null,
    stock_verified_at: null, stock_source_field: null
  };
  const reply = brandAvailabilityReply("Tem maxvinil?", [product]);
  assert.match(reply ?? "", /marca Maxvinil cadastrados no catálogo/i);
  assert.match(reply ?? "", /saldo disponível precisa ser confirmado/i);
  assert.equal(brandAvailabilityReply("Qual o preço dessa tinta?", [product]), null);
});

test("infers useful categories from common Altis product abbreviations", () => {
  const acrylic = normalizeAltisProduct({ produtoId: 31, nome: "ACR COBERTEX S/B CROMIO BR 18L MAXVINIL" });
  const waterproof = normalizeAltisProduct({ produtoId: 32, nome: "AM712 IMPERMEABILIZANTE RHOPDOPAS 1L" });
  const texture = normalizeAltisProduct({ produtoId: 33, nome: "RUSTICO GRAFIATO LEINERTEX 23KG NOVO CAMURCA" });
  assert.equal(acrylic?.category, "Tintas e complementos");
  assert.equal(waterproof?.category, "Impermeabilização e vedação");
  assert.equal(texture?.category, "Texturas e revestimentos");
});

import { consultativeGuard } from "../src/ai.js";

test("asks a compatibility question instead of listing products for a silver masonry wall", () => {
  const reply = consultativeGuard("Quero pintar um muro de prata, qual você recomenda?");
  assert.match(reply ?? "", /efeito prata metálico brilhante ou só um tom cinza-prata comum/i);
  assert.doesNotMatch(reply ?? "", /R\$|BROCAL|ESMALTE SINTETICO LUZTOL/i);
});

test("uses only customer messages to determine whether metallic effect was confirmed", () => {
  const recent = [{
    user: "Quero pintar um muro de prata, qual você recomenda?",
    assistant: "Você quer um efeito prata metálico brilhante ou só um tom cinza-prata comum?"
  }];
  const reply = consultativeGuard("Só quero um tom cinza-prata comum.", recent);
  assert.match(reply ?? "", /tinta acrílica própria para parede/i);
  assert.match(reply ?? "", /pega sol e chuva/i);
});

test("does not recommend an unverified metallic system for masonry", () => {
  const recent = [{
    user: "Quero pintar um muro de prata, qual você recomenda?",
    assistant: "Você quer um efeito prata metálico brilhante ou só um tom cinza-prata comum?"
  }];
  const reply = consultativeGuard("Quero efeito prata metálico mesmo.", recent);
  assert.match(reply ?? "", /ficha técnica/i);
  assert.match(reply ?? "", /reboco\/cimento/i);
});

import { updateCustomerProfile } from "../src/ai.js";

test("learns only explicit buying preferences and current project facts", () => {
  const profile = updateCustomerProfile({}, [
    "Prefiro Maxvinil, sou pintor profissional e quero a opção mais barata para um muro externo cinza."
  ]);
  assert.equal(profile.pricePriority, "lowest_price");
  assert.equal(profile.experienceLevel, "professional");
  assert.deepEqual(profile.preferredBrands, ["maxvinil"]);
  assert.equal(profile.project?.surface, "alvenaria");
  assert.equal(profile.project?.environment, "external");
  assert.equal(profile.project?.desiredColor, "cinza");
});

test("keeps explicit buying priorities across turns but does not invent preferences", () => {
  const first = updateCustomerProfile({}, ["Gosto de qualidade e durabilidade, preço não é o principal."]);
  assert.equal(first.pricePriority, "quality");
  const next = updateCustomerProfile(first, ["Agora esse muro pega sol e chuva."]);
  assert.equal(next.pricePriority, "quality");
  assert.equal(next.project?.environment, "external");
  const noPreference = updateCustomerProfile({}, ["Quero pintar um muro de azul."]);
  assert.equal(noPreference.pricePriority, undefined);
});

import { filterCompatibleCandidates } from "../src/ai.js";

test("does not offer automotive paint, metallic enamel or brocal as wall-paint alternatives", () => {
  const products = [
    { erp_code: "1", name: "LAZZUDUR PRATA BARI MET 900ML", brand: "SHERWIN AUTOMOTIVO" },
    { erp_code: "2", name: "ESMALTE SINTETICO LUZTOL METALICO PRATA NIQUEL", brand: "LUZTOL" },
    { erp_code: "3", name: "BROCAL METALICO PRATA 500G HITTA", brand: "HITTA" },
    { erp_code: "4", name: "TINTA ACRILICA EXTERNA CINZA", brand: "MAXVINIL" }
  ] as any[];
  const compatible = filterCompatibleCandidates(products, { project: { surface: "alvenaria", environment: "external", desiredColor: "prata" } });
  assert.deepEqual(compatible.map((p) => p.erp_code), ["4"]);
});

import { rankCompatibleCandidates } from "../src/ai.js";

test("respects a stated preference for a lower price only after removing incompatible products", () => {
  const products = [
    { erp_code: "cheap-wrong", name: "ESMALTE SINTETICO PRATA", brand: "LUZTOL", retail_price: 25, promotional_price: null },
    { erp_code: "wall-1", name: "TINTA ACRILICA EXTERNA CINZA", brand: "MAXVINIL", retail_price: 80, promotional_price: null },
    { erp_code: "wall-2", name: "TINTA ACRILICA EXTERNA CINZA ECONOMICA", brand: "RENDColor", retail_price: 50, promotional_price: null }
  ] as any[];
  const ranked = rankCompatibleCandidates(products, { pricePriority: "lowest_price", project: { surface: "alvenaria", environment: "external" } });
  assert.deepEqual(ranked.map((p) => p.erp_code), ["wall-2", "wall-1"]);
});

test("remembers the latest explicit color and resets stale surface-specific details for a new project", () => {
  const color = updateCustomerProfile({}, ["Não quero branco, prefiro azul."]);
  assert.equal(color.project?.desiredColor, "azul");
  const next = updateCustomerProfile(
    { pricePriority: "quality", project: { surface: "alvenaria", environment: "external", desiredColor: "branco", condition: "reboco cru/novo" } },
    ["Agora preciso pintar um portão de madeira."]
  );
  assert.equal(next.project?.surface, "madeira");
  assert.equal(next.project?.environment, undefined);
  assert.equal(next.project?.desiredColor, undefined);
  assert.equal(next.pricePriority, "quality");
});

test("does not interpret refusing the cheapest option as a low-price priority", () => {
  const profile = updateCustomerProfile({}, ["Não quero o mais barato; quero qualidade e durabilidade, preço não é o principal."]);
  assert.equal(profile.pricePriority, "quality");
});

test("uses verified product technical facts to reject a wrong surface", () => {
  const product = {
    erp_code: "TECH-1",
    name: "ACR TINTA PREMIUM ACETINADA",
    brand: "EXAMPLE",
    retail_price: 120,
    promotional_price: null,
    technical_facts: [{
      manufacturer: "Fabricante",
      source_url: "https://manufacturer.example/technical-bulletin",
      source_title: "Boletim técnico",
      suitable_surfaces: ["metal"],
      excluded_surfaces: [],
      use_cases: [],
      application_guidance: "Somente uso em metal.",
      surface_preparation: null,
      dilution_guidance: null,
      coat_guidance: null,
      coverage_guidance: null,
      drying_guidance: null,
      technical_excerpt: null,
      verified_at: "2026-10-15T00:00:00Z"
    }]
  } as any;
  assert.deepEqual(filterCompatibleCandidates([product], { project: { surface: "alvenaria" } }), []);
  assert.deepEqual(filterCompatibleCandidates([product], { project: { surface: "metal" } }).map((p) => p.erp_code), ["TECH-1"]);
});

test("understands yes/no as an answer to the prior exposure question rather than repeating it", () => {
  const recent = [
    { user: "Quero pintar um muro de prata.", assistant: "Você quer um efeito prata metálico brilhante ou só um tom cinza-prata comum?" },
    { user: "Só quero um tom cinza-prata comum.", assistant: "Esse muro pega sol e chuva?" }
  ];
  assert.equal(consultativeGuard("Sim", recent), null);
  assert.equal(consultativeGuard("Não", recent), null);
});

test("does not treat a vague yes as selecting one of two color styles", () => {
  const recent = [
    { user: "Quero pintar um muro de prata.", assistant: "Você quer um efeito prata metálico brilhante ou só um tom cinza-prata comum?" }
  ];
  assert.match(consultativeGuard("Sim", recent) ?? "", /Só para eu não entender errado/i);
});

test("preserves gray-silver as a compound color intent", () => {
  const profile = updateCustomerProfile({}, ["Quero um cinza-prata comum, sem brilho metálico."]);
  assert.equal(profile.project?.desiredColor, "cinza-prata");
  assert.equal(profile.project?.desiredFinish, undefined);
  const metallic = updateCustomerProfile({}, ["Quero um prata metálico brilhante."]);
  assert.equal(metallic.project?.desiredFinish, "metalico-brilhante");
  const notSilverGray = updateCustomerProfile({}, ["Não quero cinza-prata, prefiro azul."]);
  assert.equal(notSilverGray.project?.desiredColor, "azul");
});

test("explicitly rejects stale context instead of continuing the previous product diagnosis", () => {
  assert.equal(isContextCorrection("ta doido... to falando nada disso"), true);
  assert.equal(isContextCorrection("Não é disso que estou falando, esquece isso."), true);
  assert.equal(isContextCorrection("Quero pintar um muro de prata."), false);
});

test("only explicit price requests trigger catalog price replies", () => {
  assert.equal(isExplicitPriceQuestion("Quanto custa a tinta Maxvinil?"), true);
  assert.equal(isExplicitPriceQuestion("Qual o preço do esmalte Cobert ex?"), true);
  assert.equal(isExplicitPriceQuestion("Tem Maxvinil?"), false);
  assert.equal(isExplicitPriceQuestion("Quero pintar um muro de prata, qual você recomenda?"), false);
});

test("quotes only a valid price from the catalog for a sufficiently identified product", () => {
  const product = {
    erp_code: "100-1",
    name: "ESMALTE COBERTEX CAMURCA 3,6L",
    brand: "LUZTOL",
    category: "Esmaltes",
    retail_price: 99.9,
    promotional_price: 89.9,
    stock_quantity: null,
    stock_verified_at: null,
    stock_source_field: null,
    technical_facts: []
  } as any;
  const reply = priceReplyFromCatalog("Qual o preço do esmalte Cobertex camurça 3,6L?", [product]);
  assert.match(reply, /ESMALTE COBERTEX CAMURCA 3,6L/i);
  assert.match(reply, /R\$\s*89,90/);
  assert.doesNotMatch(reply, /R\$\s*99,90/);
});

test("does not guess a price when the product is not identified", () => {
  const reply = priceReplyFromCatalog("Qual o preço da tinta azul?", []);
  assert.doesNotMatch(reply, /R\$\s*\d/);
  assert.match(reply, /nome do produto e o tamanho da embalagem/i);
});

test("asks the buyer to choose a variant instead of quoting an ambiguous price", () => {
  const products = [
    { erp_code: "a", name: "ESMALTE COBERTEX CAMURCA 900ML", brand: "LUZTOL", retail_price: 35, promotional_price: null },
    { erp_code: "b", name: "ESMALTE COBERTEX CAMURCA 3,6L", brand: "LUZTOL", retail_price: 99, promotional_price: null }
  ] as any[];
  const reply = priceReplyFromCatalog("Qual o preço do esmalte Cobertex camurça?", products);
  assert.doesNotMatch(reply, /R\$\s*\d/);
  assert.match(reply, /mais de uma versão parecida/i);
});

test("keeps catalog prices out of product recommendation payloads", () => {
  const product = {
    erp_code: "100-2",
    name: "TINTA ACRILICA EXTERNA",
    brand: "MAXVINIL",
    category: "Tintas",
    retail_price: 100,
    promotional_price: 80,
    stock_quantity: null,
    stock_verified_at: null,
    stock_source_field: null
  } as any;
  const payload = productForCustomer(product) as Record<string, unknown>;
  assert.equal("price" in payload, false);
});

test("does not inherit the old silver-wall guard when the customer starts a different project", () => {
  const recent = [{
    user: "Quero pintar um muro de prata, qual você recomenda?",
    assistant: "Você quer um efeito prata metálico brilhante ou só um tom cinza-prata comum?"
  }];
  assert.equal(consultativeGuard("Agora preciso pintar um portão de madeira.", recent), null);
});

test("ignores an invalid promotional price above the retail price", () => {
  const product = {
    erp_code: "100-3",
    name: "ESMALTE COBERTEX CAMURCA 3,6L",
    brand: "LUZTOL",
    category: "Esmaltes",
    retail_price: 99.9,
    promotional_price: 150,
    stock_quantity: null,
    stock_verified_at: null,
    stock_source_field: null
  } as any;
  const reply = priceReplyFromCatalog("Qual o preço do esmalte Cobertex camurça 3,6L?", [product]);
  assert.match(reply, /R\$\s*99,90/);
  assert.doesNotMatch(reply, /R\$\s*150,00/);
});
