import test from "node:test";
import assert from "node:assert/strict";
import { extractProducts, isStockField, normalizeAltisProduct, normalizeProducts, parseNumber } from "../src/catalog.js";
import { brandAvailabilityReply, queryTerms } from "../src/ai.js";

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
  assert.deepEqual(queryTerms("Vocês têm tinta Maxvinil, por favor?"), ["tinta", "maxvinil"]);
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
