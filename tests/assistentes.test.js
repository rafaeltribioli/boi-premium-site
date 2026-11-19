// Testes do cálculo dos assistentes. Rodar na pasta do site:  node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const C = require(path.join(raiz, 'assistente/calculo.js'));
require(path.join(raiz, 'assistente/catalogo-acougue.js'));
const acougue = C.produtosAcougue(globalThis.BOI_CATALOGO_ACOUGUE);
const ctx = {};
vm.runInNewContext(fs.readFileSync(path.join(raiz, 'parceiros/data.js'), 'utf8') + ';this.products=products;', ctx);
const parceiro = C.produtosParceiro(ctx.products);
const QUI_19_11_2026 = new Date(2026, 10, 19);

function linha(r, nome) { return r.linhas.find(l => l.nome === nome); }

test('catálogo do açougue: 81 itens e preços confirmados', () => {
  assert.equal(acougue.length, 81);
  assert.equal(acougue.find(p => p.nome === 'Kit Fraldinha').precoCentavos, 12990);
  assert.equal(acougue.find(p => p.nome === 'Buchada de bode').precoCentavos, 7990);
});

test('20 pessoas = 10 kg (5 fraldinha, 2,5 coxinha, 2,5 linguiça)', () => {
  const r = C.montarChurrasco({ pessoas: 20, slots: C.slotsIniciais(), extras: {} }, acougue);
  assert.equal(r.carneG, 10000);
  assert.equal(linha(r, 'Fraldinha Premium').gramas, 5000);
  assert.equal(linha(r, 'Coxinha da asa').gramas, 2500);
  assert.equal(linha(r, 'Linguiça').gramas, 2500);
  assert.equal(linha(r, 'Fraldinha Premium').subtotalCentavos, 34950); // 5 kg × R$ 69,90
  assert.equal(linha(r, 'Coxinha da asa').subtotalCentavos, 7475);    // 2,5 kg × R$ 29,90
  assert.equal(linha(r, 'Linguiça').subtotalCentavos, null);          // sem preço no catálogo do açougue
  assert.deepEqual(r.pendentes, ['Linguiça']);
});

test('30 pessoas = 15 kg (7,5 / 3,75 / 3,75)', () => {
  const r = C.montarChurrasco({ pessoas: 30, slots: C.slotsIniciais(), extras: {} }, acougue);
  assert.equal(r.carneG, 15000);
  assert.equal(linha(r, 'Fraldinha Premium').gramas, 7500);
  assert.equal(linha(r, 'Coxinha da asa').gramas, 3750);
  assert.equal(linha(r, 'Linguiça').gramas, 3750);
});

test('pão de alho e queijo coalho ficam fora do peso de carne', () => {
  const r = C.montarChurrasco({ pessoas: 20, slots: C.slotsIniciais(), extras: { 'pao-de-alho': 3, 'queijo-coalho': 2 } }, acougue);
  assert.equal(r.carneG, 10000);
  assert.equal(r.extras.find(e => e.id === 'pao-de-alho').quantidade, 3);
  assert.ok(r.pendentes.includes('Pão de alho'));
});

test('troca de item recota e mantém o peso; mudar pessoas preserva a troca', () => {
  const slots = C.slotsIniciais();
  const t = C.aplicarTroca(slots, 'coxinha', 'tulipa', acougue);
  assert.equal(t.ok, true);
  let r = C.montarChurrasco({ pessoas: 20, slots, extras: {} }, acougue);
  const tul = r.linhas.find(l => /Tulipa/.test(l.nome));
  assert.equal(tul.gramas, 2500);
  assert.equal(tul.subtotalCentavos, 9975); // 2,5 kg × R$ 39,90
  r = C.montarChurrasco({ pessoas: 30, slots, extras: {} }, acougue);
  assert.equal(r.linhas.find(l => /Tulipa/.test(l.nome)).gramas, 3750);
  assert.equal(r.carneG, 15000);
});

test('leitura da conversa do Rafael', () => {
  assert.equal(C.interpretarChurrasco('churrasco pra 20 pessoas', acougue).pessoas, 20);
  assert.equal(C.interpretarChurrasco('vai ser trinta pessoas', acougue).pessoas, 30);
  assert.equal(C.interpretarChurrasco('20 pessoas até R$ 500', acougue).orcamentoCentavos, 50000);
  assert.deepEqual(C.interpretarChurrasco('troca a linguiça por panceta', acougue).troca, { de: 'linguica', para: 'panceta' });
  assert.equal(C.interpretarChurrasco('quero 2 pães de alho', acougue).extras['pao-de-alho'], 2);
  assert.equal(C.interpretarChurrasco('com queijo coalho', acougue).extras['queijo-coalho'], 1);
});

test('orçamento: informa quantas pessoas cabem', () => {
  const r = C.montarChurrasco({ pessoas: 20, slots: C.slotsIniciais(), extras: {}, orcamentoCentavos: 30000 }, acougue);
  assert.ok(r.saldoCentavos < 0);
  assert.ok(r.pessoasNoOrcamento > 0 && r.pessoasNoOrcamento < 20);
});

test('Kelly: lista com data, depois muda de 30 para 40 tulipas sem perder o resto', () => {
  let r = C.kellyProcessar('50 espetinhos de fraldinha e 30 tulipas pra sexta', null, parceiro, QUI_19_11_2026);
  let cot = r.cotacao;
  assert.equal(cot.itens.length, 2);
  assert.equal(cot.itens[0].produto.nome, 'Espetinho de fraldinha');
  assert.equal(cot.itens[0].quantidade, 50);
  assert.equal(cot.itens[0].status, 'peso_a_confirmar'); // vendido por kg, pedido em unidades
  assert.equal(cot.itens[1].produto.nome, 'Tulipa — meio da asa');
  assert.equal(cot.itens[1].quantidade, 30);
  assert.equal(cot.data.iso, '2026-11-20');

  r = C.kellyProcessar('muda pra 40 tulipas', cot, parceiro, QUI_19_11_2026);
  assert.equal(r.acao, 'alterou');
  cot = r.cotacao;
  assert.equal(cot.itens.length, 2);
  assert.equal(cot.itens[1].quantidade, 40);
  assert.equal(cot.itens[0].quantidade, 50);
  assert.equal(cot.itens[0].produto.nome, 'Espetinho de fraldinha');
  assert.equal(cot.data.iso, '2026-11-20');
});

test('Kelly: kg calcula preço; "muda a fraldinha pra 8 kg"; tira item; troca produto', () => {
  let cot = C.kellyProcessar('5 kg de fraldinha, 3 kg de coxinha da asa', null, parceiro, QUI_19_11_2026).cotacao;
  assert.equal(cot.itens[0].subtotalCentavos, 29950); // 5 × 59,90
  assert.equal(cot.totalCotadoCentavos, 29950 + 7470);
  cot = C.kellyProcessar('muda a fraldinha pra 8 kg', cot, parceiro, QUI_19_11_2026).cotacao;
  assert.equal(cot.itens[0].quantidade, 8);
  assert.equal(cot.itens[1].quantidade, 3);
  cot = C.kellyProcessar('mais 2 kg de coxinha da asa', cot, parceiro, QUI_19_11_2026).cotacao;
  assert.equal(cot.itens[1].quantidade, 5);
  cot = C.kellyProcessar('troca a coxinha por linguiça', cot, parceiro, QUI_19_11_2026).cotacao;
  assert.equal(cot.itens[1].produto.nome, 'Linguiça');
  assert.equal(cot.itens[1].quantidade, 5);
  cot = C.kellyProcessar('tira a linguiça', cot, parceiro, QUI_19_11_2026).cotacao;
  assert.equal(cot.itens.length, 1);
});

test('Kelly: produto fora do catálogo fica para a equipe confirmar', () => {
  const cot = C.kellyProcessar('10 kg de picanha de avestruz e 2 pacotes de pão de alho', null, parceiro, QUI_19_11_2026).cotacao;
  const pao = cot.itens.find(i => i.produto && i.produto.nome === 'Pão de alho');
  assert.equal(pao.subtotalCentavos, 2980);
  const pic = cot.itens[0];
  assert.equal(pic.conferir, true); // "avestruz" não existe: pede conferência
  const nada = C.kellyProcessar('3 kg de muçarela', null, parceiro, QUI_19_11_2026).cotacao.itens[0];
  assert.equal(nada.status, 'sem_cadastro');
  assert.equal(nada.subtotalCentavos, null);
});

test('Kelly: dimensionar churrasco com a mesma regra', () => {
  const r = C.kellyProcessar('me ajuda com um churrasco pra 20 pessoas', null, parceiro, QUI_19_11_2026);
  assert.equal(r.acao, 'churrasco');
  const kgTotal = r.cotacao.itens.reduce((a, i) => a + i.quantidade, 0);
  assert.equal(Math.round(kgTotal * 1000), 10000);
});

test('datas', () => {
  assert.equal(C.extrairData('pra amanhã', QUI_19_11_2026).iso, '2026-11-20');
  assert.equal(C.extrairData('dia 25', QUI_19_11_2026).iso, '2026-11-25');
  assert.equal(C.extrairData('para 05/12', QUI_19_11_2026).iso, '2026-12-05');
  assert.equal(C.extrairData('no sábado', QUI_19_11_2026).iso, '2026-11-21');
});

test('Kelly: "mais 5 kg de coxinha da asa" não altera a tulipa (nomes parecidos)', () => {
  let cot = C.kellyProcessar('50 espetinhos de fraldinha e 30 tulipas pra sexta', null, parceiro, QUI_19_11_2026).cotacao;
  cot = C.kellyProcessar('mais 5 kg de coxinha da asa', cot, parceiro, QUI_19_11_2026).cotacao;
  assert.equal(cot.itens.length, 3);
  assert.equal(cot.itens[1].quantidade, 30);
  assert.equal(cot.itens[2].produto.nome, 'Coxinha da asa');
});
