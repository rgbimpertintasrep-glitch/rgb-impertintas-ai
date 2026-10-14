import test from "node:test";
import assert from "node:assert/strict";
import { extractProducts, isStockField, normalizeAltisProduct, normalizeProducts, parseNumber } from "../src/catalog.js";

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
