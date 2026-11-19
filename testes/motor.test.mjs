import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as m from '../assistente/motor.js';

const json = JSON.parse(readFileSync(new URL('../dados/catalogo.json', import.meta.url), 'utf8'));
const cat = m.criarCatalogo(json);

test('catálogo: 81 itens, categorias 20/15/16/8/13/9, unidades corretas', () => {
  assert.equal(json.produtos.length, 81);
  const cont = {};
  for (const p of json.produtos) cont[p.categoria] = (cont[p.categoria] || 0) + 1;
  assert.deepEqual(cont, { bovinos: 20, aves: 15, suinos: 16, especiais: 8, miudos: 13, kits: 9 });
  for (const p of json.produtos) {
    assert.equal(p.unidade, p.categoria === 'kits' ? 'kit' : 'kg', p.nome);
    assert.ok(Number.isInteger(p.preco_centavos) && p.preco_centavos > 0);
    assert.equal(p.estoque, 'nao_integrado');
  }
});

test('preços confirmados: Kit Fraldinha 12990/kit e Buchada 7990/kg', () => {
  assert.equal(cat.porId.get('BP-075').preco_centavos, 12990);
  assert.equal(cat.porId.get('BP-075').unidade, 'kit');
  assert.equal(cat.porId.get('BP-070').preco_centavos, 7990);
  assert.equal(cat.porId.get('BP-070').unidade, 'kg');
});

test('catálogo enriquecido mantém os preços da importação', () => {
  const imp = JSON.parse(readFileSync(new URL('../dados/importado/catalogo-2026-11-17.json', import.meta.url), 'utf8'));
  for (const p of imp.produtos) assert.equal(cat.porId.get(p.id).preco_centavos, p.preco_centavos, p.nome);
});

test('500 g de picanha = R$ 59,95; 1 kit fraldinha = R$ 129,90', () => {
  const c = m.cotarLista(cat, [{ productId: 'BP-001', quantidade: 500, unidade: 'kg' }, { productId: 'BP-075', quantidade: 1, unidade: 'kit' }]);
  assert.equal(c.itens[0].subtotalCents, 5995);
  assert.equal(c.itens[1].subtotalCents, 12990);
  assert.equal(c.totalCents, 18985);
  assert.equal(m.formatarReais(5995), 'R$ 59,95');
});

test('10 adultos + 4 crianças com acompanhamentos = 4800 g', () => {
  const e = m.estimarQuantidade(cat, { fluxo: 'churrasco', adultos: 10, criancas: 4 });
  assert.equal(e.gramas, 4800);
  assert.ok(e.premissas.some(p => /Idade das crianças/.test(p)), 'explica aproximação da idade');
});

test('2 adultos × 5 refeições × 150 g = 1500 g', () => {
  assert.equal(m.estimarQuantidade(cat, { fluxo: 'semana', adultos: 2, refeicoes: 5 }).gramas, 1500);
});

test('"sem porco" exclui suínos, misturas desconhecidas e kits', () => {
  const r = m.normalizarRestricoes({ excluirProteinas: ['suino'] });
  assert.ok(m.motivoBloqueio(cat.porId.get('BP-042'), r));          // panceta
  assert.ok(m.motivoBloqueio(cat.porId.get('BP-070'), r));          // buchada: ingredientes desconhecidos
  assert.ok(m.motivoBloqueio(cat.porId.get('SITE-001'), r));        // hambúrguer: ingredientes desconhecidos
  for (const k of json.produtos.filter(p => p.categoria === 'kits')) assert.ok(m.motivoBloqueio(cat.porId.get(k.id), r), k.nome);
  assert.equal(m.motivoBloqueio(cat.porId.get('BP-001'), r), null);  // picanha bovina
  const prop = m.proporOpcoes(cat, { fluxo: 'churrasco', alvoGramas: 4800, orcamentoCentavos: 35000, restricoes: { excluirProteinas: ['suino'] } });
  for (const p of prop.propostas) for (const i of p.items) assert.notEqual(cat.porId.get(i.productId).contem_suino, 'sim');
});

test('osso não conta como carne sem osso e é explicado', () => {
  const c = m.cotarLista(cat, [{ productId: 'BP-010', quantidade: 2000, unidade: 'kg' }]);
  assert.equal(c.meatWeightGrams, 0);
  assert.equal(c.boneInGrams, 2000);
  assert.ok(c.avisos.some(a => /osso/.test(a)));
});

test('duas propostas distintas dentro do orçamento (exemplo da SPEC)', () => {
  const r = m.proporOpcoes(cat, { fluxo: 'churrasco', alvoGramas: 4800, orcamentoCentavos: 35000, restricoes: { excluirProteinas: ['suino'] } });
  assert.equal(r.propostas.length, 2);
  assert.notEqual(r.propostas[0].id, r.propostas[1].id);
  assert.deepEqual(r.propostas.map(p => p.title), ['Melhor custo-benefício', 'Seleção premium']);
  for (const p of r.propostas) {
    assert.ok(p.totalCents <= 35000);
    assert.ok(p.meatWeightGrams >= 4800);
    assert.equal(p.budgetRemainingCents, 35000 - p.totalCents);
    assert.equal(p.totalCents, p.items.reduce((s, i) => s + i.subtotalCents, 0));
  }
});

test('orçamento insuficiente é informado sem inventar solução', () => {
  const r = m.proporOpcoes(cat, { fluxo: 'churrasco', alvoGramas: 4800, orcamentoCentavos: 5000 });
  assert.equal(r.propostas.length, 0);
  assert.ok(r.inviavel && r.inviavel.orcamentoNecessarioCentavos > 5000);
  assert.ok(r.observacoes[0].includes('reduzir a quantidade ou ampliar o orçamento'));
});

test('orçamento apertado não gera "premium" igual ao econômico', () => {
  const r = m.proporOpcoes(cat, { fluxo: 'churrasco', alvoGramas: 4800, orcamentoCentavos: 15000, restricoes: { excluirProteinas: ['suino'] } });
  assert.equal(r.propostas.length, 1);
  assert.ok(r.observacoes.some(o => /só uma opção/.test(o)));
});

test('troca recota tudo; kits inteiros; pesos com incremento', () => {
  const a = m.proporOpcoes(cat, { fluxo: 'churrasco', alvoGramas: 4000 });
  const b = m.proporOpcoes(cat, { fluxo: 'churrasco', alvoGramas: 4000, restricoes: { evitarIds: ['BP-042'] } });
  assert.ok(a.propostas[0].items.some(i => i.productId === 'BP-042'));
  assert.ok(!b.propostas[0].items.some(i => i.productId === 'BP-042'));
  for (const p of [...a.propostas, ...b.propostas]) for (const i of p.items) assert.equal(i.quantidade % 100, 0);
  const k = m.cotarLista(cat, [{ productId: 'BP-075', quantidade: 1.6, unidade: 'kit' }, { productId: 'BP-001', quantidade: 1234, unidade: 'kg' }]);
  assert.equal(k.itens[0].quantidade, 2);
  assert.equal(k.itens[1].quantidade, 1200);
  assert.equal(k.itens[1].subtotalCents, Math.round(11990 * 1200 / 1000));
});

test('cotação ignora preço vindo de fora e rejeita produto inexistente', () => {
  const c = m.cotarLista(cat, [{ productId: 'BP-001', quantidade: 1000, unidade: 'kg', unitPriceCents: 1, precoCentavos: 1 }, { productId: 'XX-999', quantidade: 1 }]);
  assert.equal(c.itens[0].subtotalCents, 11990);
  assert.ok(c.erros.some(e => /desconhecido/.test(e)));
  assert.equal(c.ok, false);
});

test('kits: composição validada contra o site; sem promessa de rendimento por pessoa', () => {
  for (const k of json.produtos.filter(p => p.categoria === 'kits')) {
    assert.equal(k.composicao_status, 'importada_do_site_validada');
    assert.equal(k.confere_com_total_declarado, true, k.nome);
    const r = m.resumoProduto(k);
    assert.ok(!('pessoas' in r));
  }
  assert.deepEqual(cat.porNome.get('kit do mes').id, 'BP-081'); // alias Kit do Mês = Kit Compra do Mês
});

test('complemento sem preço não é oferecido; pão do kit não é duplicado', () => {
  const c = m.complementos(cat, [{ productId: 'BP-075', quantidade: 2 }]);
  assert.equal(c.disponiveisComPreco.length, 0);
  assert.equal(c.paoDeAlhoJaInclusoPct, 2);
  assert.match(c.mensagem, /não estão cadastrados/);
});

test('mensagem de WhatsApp: produtos, total, restrições, pendências e confirmação; sem dados pessoais', () => {
  const c = m.cotarLista(cat, [{ productId: 'BP-008', quantidade: 1500, unidade: 'kg' }]);
  const txt = m.mensagemWhatsApp(c.itens, { restricoes: ['sem porco'], pendencias: ['Trocar panceta do kit (a confirmar)'] });
  assert.match(txt, /1,5 kg Fraldinha — R\$ 104,85/);
  assert.match(txt, /Total estimado: R\$ 104,85/);
  assert.match(txt, /Restrições: sem porco/);
  assert.match(txt, /a confirmar/);
  assert.match(txt, /frete e prazo são confirmados/);
  assert.doesNotMatch(txt, /endere|telefone|CPF/i);
});
