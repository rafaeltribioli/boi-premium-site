// Motor determinístico do Rafael Virtual (Boi Premium).
// Usado no SERVIDOR (fonte da verdade para a IA) e no navegador (calculadora sem IA).
// Regras: quantidades em gramas (inteiros), dinheiro em centavos (inteiros), sem floats monetários.
// Subtotal por peso = Math.round(preco_centavos × gramas / 1000). Kits: preco_centavos × quantidade inteira.

export const PROTEINAS = ['bovino', 'frango', 'suino', 'cordeiro', 'bufalo', 'ave_especial', 'exotico', 'caprino'];
const NOMES_PROTEINA = { bovino: 'boi', frango: 'frango', suino: 'porco', cordeiro: 'cordeiro', bufalo: 'búfalo', ave_especial: 'codorna', exotico: 'exóticos', caprino: 'bode' };
const MAX_KITS = 20;
const MAX_GRAMAS_ITEM = 60000;
const MAX_ITENS_LISTA = 30;

export function formatarReais(centavos) {
  const neg = centavos < 0; const v = Math.abs(Math.trunc(centavos));
  const r = Math.floor(v / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + 'R$ ' + r + ',' + String(v % 100).padStart(2, '0');
}
export function formatarPeso(gramas) {
  if (gramas < 1000) return gramas + ' g';
  const kg = Math.floor(gramas / 1000); const resto = gramas % 1000;
  return kg + (resto ? ',' + String(resto).padStart(3, '0').replace(/0+$/, '') : '') + ' kg';
}
export function subtotalCentavos(precoCentavos, unidade, quantidade) {
  if (unidade === 'kit') return precoCentavos * quantidade;
  return Math.round(precoCentavos * quantidade / 1000);
}

export function criarCatalogo(json) {
  const todos = [...(json.produtos || []), ...(json.extras_site || [])];
  const porId = new Map(todos.map(p => [p.id, p]));
  const porNome = new Map();
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  for (const p of todos) for (const n of [p.nome, p.nome_site, ...(p.aliases || [])]) if (n) porNome.set(norm(n), p);
  return { json, todos, porId, porNome, norm, parametros: json.parametros };
}

// ---------- Restrições ----------
// restricoes = { excluirProteinas:[], somenteProteinas:[], evitarIds:[], incluirMiudos:false }
export function normalizarRestricoes(r = {}) {
  const lista = v => Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 20) : [];
  return {
    excluirProteinas: lista(r.excluirProteinas).filter(p => PROTEINAS.includes(p)),
    somenteProteinas: lista(r.somenteProteinas).filter(p => PROTEINAS.includes(p)),
    evitarIds: lista(r.evitarIds),
    preferirIds: lista(r.preferirIds)
  };
}

// Retorna null se o produto respeita as restrições, ou o motivo (string) se não respeita.
export function motivoBloqueio(p, restr) {
  if (!p.ativo) return 'inativo';
  if (restr.evitarIds.includes(p.id)) return 'retirado a pedido';
  const exc = restr.excluirProteinas; const som = restr.somenteProteinas;
  const temRestricaoProteina = exc.length || som.length;
  if (p.categoria === 'kits') {
    if (!temRestricaoProteina) return null;
    // Kit só entra com composição validada e sem nenhum componente proibido ou desconhecido.
    if (p.composicao_status !== 'importada_do_site_validada') return 'composição não validada';
    const carnes = p.composicao.filter(c => c.conta_como_carne);
    if (exc.includes('suino') && carnes.some(c => c.contem_suino === 'sim')) return 'contém porco';
    for (const prot of exc) if (carnes.some(c => c.proteina === prot)) return 'contém ' + (NOMES_PROTEINA[prot] || prot);
    for (const comp of p.composicao) {
      if (!comp.conta_como_carne) continue;
      if (exc.includes('suino') && comp.contem_suino !== 'nao') return comp.contem_suino === 'sim' ? 'contém porco' : 'ingredientes a confirmar';
      if (comp.proteina === 'desconhecida' || comp.proteina === 'embutido_ou_preparado') return 'ingredientes a confirmar';
      if (exc.includes(comp.proteina)) return 'contém ' + NOMES_PROTEINA[comp.proteina];
      if (som.length && !som.includes(comp.proteina)) return 'contém outras carnes';
    }
    return null;
  }
  if (exc.includes('suino') && p.contem_suino !== 'nao') return p.contem_suino === 'sim' ? 'contém porco' : 'ingredientes a confirmar';
  if (temRestricaoProteina && !p.ingredientes_conhecidos) return 'ingredientes a confirmar';
  if (exc.includes(p.proteina)) return 'contém ' + (NOMES_PROTEINA[p.proteina] || p.proteina);
  if (som.length && !som.includes(p.proteina)) return 'fora da preferência (' + som.map(x => NOMES_PROTEINA[x]).join(', ') + ')';
  return null;
}

// ---------- Estimativas ----------
const inteiro = (v, min, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null; };

export function estimarQuantidade(cat, e = {}) {
  const par = cat.parametros;
  const fluxo = e.fluxo === 'semana' ? 'semana' : 'churrasco';
  const adultos = inteiro(e.adultos ?? 0, 0, 500) ?? 0;
  const criancas = inteiro(e.criancas ?? 0, 0, 500) ?? 0;
  const premissas = []; const faltando = [];
  if (fluxo === 'churrasco') {
    const pc = par.churrasco;
    if (!adultos && !criancas) faltando.push('pessoas');
    let base = adultos * pc.adulto_g + criancas * pc.crianca_g;
    premissas.push(`${adultos} adulto(s) × ${pc.adulto_g} g + ${criancas} criança(s) × ${pc.crianca_g} g de carne crua sem osso = ${formatarPeso(base)} (base com acompanhamentos).`);
    if (criancas && !e.idadeCriancasInformada) premissas.push('Idade das crianças não informada: considerei metade da porção de um adulto. Dá para ajustar.');
    let fator = 1;
    const ap = ['leve', 'normal', 'alto'].includes(e.apetite) ? e.apetite : 'normal';
    if (ap !== 'normal') { fator *= pc.fator_apetite[ap]; premissas.push(`Apetite ${ap}: ×${String(pc.fator_apetite[ap]).replace('.', ',')}.`); }
    if (e.acompanhamentos === false) { fator *= pc.fator_sem_acompanhamentos; premissas.push(`Poucos acompanhamentos: ×${String(pc.fator_sem_acompanhamentos).replace('.', ',')}.`); }
    const horas = Number(e.duracaoHoras);
    if (Number.isFinite(horas) && horas >= pc.longa_duracao_horas) { fator *= pc.fator_longa_duracao; premissas.push(`Churrasco longo (${horas} h): ×${String(pc.fator_longa_duracao).replace('.', ',')}.`); }
    const inc = par.incremento_padrao_g;
    const gramas = Math.ceil(Math.round(base * fator) / inc) * inc;
    premissas.push('É uma estimativa, não garantia. Pão de alho e acompanhamentos não contam como carne. Peças com osso não entram nesse peso.');
    return { fluxo, gramas, adultos, criancas, premissas, faltando };
  }
  const ps = par.semana;
  const refeicoes = inteiro(e.refeicoes ?? 0, 0, 60) ?? 0;
  if (!adultos && !criancas) faltando.push('pessoas');
  if (!refeicoes) faltando.push('refeicoes');
  const gramasBrutas = (adultos * ps.adulto_refeicao_g + criancas * ps.crianca_refeicao_g) * refeicoes;
  const inc = par.incremento_padrao_g;
  const gramas = Math.ceil(gramasBrutas / inc) * inc;
  premissas.push(`${adultos} adulto(s) × ${refeicoes} refeição(ões) × ${ps.adulto_refeicao_g} g` + (criancas ? ` + ${criancas} criança(s) × ${refeicoes} × ${ps.crianca_refeicao_g} g` : '') + ` = ${formatarPeso(gramas)} de carne crua sem osso.`);
  premissas.push('Porção é premissa comercial editável, não orientação nutricional.');
  return { fluxo, gramas, adultos, criancas, refeicoes, premissas, faltando };
}

// ---------- Cotação (validação de tudo no servidor) ----------
// itens: [{ productId, quantidade, unidade }]  (kg → quantidade em gramas; kit → inteiro)
export function cotarLista(cat, itens, opcoes = {}) {
  const restr = normalizarRestricoes(opcoes.restricoes);
  const orc = Number.isInteger(opcoes.orcamentoCentavos) && opcoes.orcamentoCentavos > 0 ? opcoes.orcamentoCentavos : null;
  const erros = []; const avisos = []; const pendencias = []; const violacoes = [];
  const agregados = new Map();
  if (!Array.isArray(itens) || !itens.length) erros.push('Lista vazia.');
  for (const it of (Array.isArray(itens) ? itens : []).slice(0, MAX_ITENS_LISTA)) {
    const p = cat.porId.get(it && it.productId);
    if (!p) { erros.push(`Produto desconhecido: ${String(it && it.productId).slice(0, 40)}`); continue; }
    if (!p.ativo) { erros.push(`${p.nome} está inativo.`); continue; }
    let q = Number(it.quantidade);
    if (!Number.isFinite(q) || q <= 0) { erros.push(`Quantidade inválida para ${p.nome}.`); continue; }
    if (p.unidade === 'kit') {
      if (it.unidade && it.unidade !== 'kit') { erros.push(`${p.nome} é vendido por kit.`); continue; }
      const qi = Math.round(q); if (qi !== q) avisos.push(`${p.nome}: kits só em quantidade inteira (usei ${qi}).`);
      q = Math.min(MAX_KITS, Math.max(1, qi));
    } else {
      if (it.unidade && it.unidade !== 'kg' && it.unidade !== 'g') { erros.push(`${p.nome} é vendido por kg.`); continue; }
      const inc = p.incremento_g || 100; const min = p.minimo_g || inc;
      let g = Math.round(q / inc) * inc;
      if (g < min) { avisos.push(`${p.nome}: quantidade mínima ${formatarPeso(min)}.`); g = min; }
      if (g !== q && g >= min) avisos.push(`${p.nome}: arredondado para ${formatarPeso(g)}.`);
      q = Math.min(MAX_GRAMAS_ITEM, g);
    }
    agregados.set(p.id, (agregados.get(p.id) || 0) + q);
  }
  const linhas = []; let total = 0; let carneSemOsso = 0; let carneComOsso = 0; let paoInclusoPct = 0;
  for (const [id, q] of agregados) {
    const p = cat.porId.get(id);
    const sub = subtotalCentavos(p.preco_centavos, p.unidade, q);
    total += sub;
    const bloqueio = motivoBloqueio(p, restr);
    if (bloqueio) violacoes.push(`${p.nome}: ${bloqueio}`);
    let carne = 0; let osso = 0;
    if (p.unidade === 'kit') {
      carne = p.carne_sem_osso_g * q; osso = p.carne_com_osso_ou_indefinido_g * q;
      paoInclusoPct += (p.pao_de_alho_incluso_pct || 0) * q;
      if (p.itens_sem_peso && p.itens_sem_peso.length) pendencias.push(`${p.nome}: ${p.itens_sem_peso.join(', ')} sem peso informado.`);
    } else if (p.osso === 'nao' && p.ingredientes_conhecidos !== false && p.proteina !== 'embutido_ou_preparado') {
      carne = q;
    } else if (p.osso === 'nao') {
      carne = q; // preparado sem osso: conta como carne, ingredientes a confirmar
    } else {
      osso = q;
    }
    carneSemOsso += carne; carneComOsso += osso;
    if (p.ingredientes_conhecidos === false && p.unidade !== 'kit') pendencias.push(`${p.nome}: ingredientes a confirmar com a equipe.`);
    linhas.push({
      productId: id, nome: p.nome, nomeSite: p.nome_site || p.nome, unidade: p.unidade,
      quantidade: q, unitPriceCents: p.preco_centavos, subtotalCents: sub,
      carneSemOssoG: carne, comOssoG: osso, origemPreco: p.origem
    });
  }
  if (carneComOsso) avisos.push(`${formatarPeso(carneComOsso)} com osso (ou sem informação de osso) não entram no peso de carne sem osso — não há fator de rendimento cadastrado.`);
  if (paoInclusoPct) avisos.push(`Pão de alho já incluso: ${paoInclusoPct} pct (nos kits).`);
  return {
    ok: !erros.length && !!linhas.length,
    erros, avisos, pendencias, violacoes,
    itens: linhas,
    totalCents: total,
    meatWeightGrams: carneSemOsso,
    boneInGrams: carneComOsso,
    budgetCents: orc,
    budgetRemainingCents: orc == null ? null : orc - total,
    dentroDoOrcamento: orc == null ? true : total <= orc,
    paoDeAlhoInclusoPct: paoInclusoPct
  };
}

// ---------- Propostas ----------
const MODELOS = {
  churrasco: {
    custo: [['BP-008', 0.30], ['BP-007', 0.15], ['BP-025', 0.20], ['BP-032', 0.10], ['BP-042', 0.15], ['BP-039', 0.10]],
    premium: [['BP-001', 0.35], ['BP-003', 0.20], ['BP-002', 0.15], ['BP-025', 0.10], ['BP-032', 0.05], ['BP-036', 0.10], ['BP-042', 0.05]]
  },
  semana: {
    custo: [['BP-020', 0.25], ['BP-012', 0.20], ['BP-021', 0.25], ['BP-025', 0.10], ['BP-045', 0.10], ['BP-039', 0.10]],
    premium: [['BP-004', 0.25], ['BP-006', 0.20], ['BP-013', 0.10], ['BP-021', 0.20], ['BP-022', 0.05], ['BP-038', 0.10], ['BP-037', 0.10]]
  }
};
// Substitutos por proteína quando o cliente pede "só boi" etc. (mesmo fluxo, sem osso).
const RESERVA = {
  churrasco: { bovino: ['BP-008', 'BP-007', 'BP-006', 'BP-011', 'BP-004', 'BP-001', 'BP-003', 'BP-002'], frango: ['BP-025', 'BP-032'], suino: ['BP-042', 'BP-039', 'BP-036'], cordeiro: [], bufalo: ['BP-056'] },
  semana: { bovino: ['BP-020', 'BP-012', 'BP-013', 'BP-016', 'BP-004', 'BP-006'], frango: ['BP-021', 'BP-025', 'BP-022'], suino: ['BP-045', 'BP-039', 'BP-038'] }
};

function montarComposicao(cat, fluxo, nivel, restr) {
  let base = MODELOS[fluxo][nivel].filter(([id]) => { const p = cat.porId.get(id); return p && !motivoBloqueio(p, restr); });
  // Preferências explícitas do cliente (ex.: "quero picanha") entram com peso relevante.
  for (const id of restr.preferirIds) {
    const p = cat.porId.get(id);
    if (!p || p.unidade !== 'kg' || motivoBloqueio(p, restr) || p.osso !== 'nao') continue;
    if (!base.some(([b]) => b === id)) base.unshift([id, 0.3]);
  }
  if (!base.length) {
    // Restrição eliminou o modelo: usar reservas das proteínas permitidas.
    const res = RESERVA[fluxo];
    const ids = Object.values(res).flat().filter(id => { const p = cat.porId.get(id); return p && !motivoBloqueio(p, restr); });
    const escolhidos = nivel === 'custo'
      ? [...ids].sort((a, b) => cat.porId.get(a).preco_centavos - cat.porId.get(b).preco_centavos).slice(0, 3)
      : [...ids].sort((a, b) => cat.porId.get(b).preco_centavos - cat.porId.get(a).preco_centavos).slice(0, 3);
    base = escolhidos.map(id => [id, 1 / escolhidos.length]);
  } else if (restr.somenteProteinas.length || restr.excluirProteinas.length) {
    // Completa com reservas se sobrou só 1 item, para não ficar monótono.
    if (base.length < 2) {
      const extras = Object.entries(RESERVA[fluxo]).flatMap(([, v]) => v)
        .filter(id => !base.some(([b]) => b === id)).filter(id => { const p = cat.porId.get(id); return p && !motivoBloqueio(p, restr); });
      const ordenados = extras.sort((a, b) => nivel === 'custo' ? cat.porId.get(a).preco_centavos - cat.porId.get(b).preco_centavos : cat.porId.get(b).preco_centavos - cat.porId.get(a).preco_centavos);
      for (const id of ordenados.slice(0, 2)) base.push([id, 0.25]);
    }
  }
  const soma = base.reduce((s, [, w]) => s + w, 0);
  return base.map(([id, w]) => [id, w / soma]);
}

function distribuir(cat, composicao, alvoG) {
  const min = cat.parametros.minimo_por_item_g; const inc = cat.parametros.incremento_padrao_g;
  let comp = [...composicao];
  // Remove itens que ficariam abaixo do mínimo (redistribui o peso).
  while (comp.length > 1 && comp.some(([, w]) => alvoG * w < min)) {
    const idx = comp.reduce((iMin, c, i, arr) => c[1] < arr[iMin][1] ? i : iMin, 0);
    comp.splice(idx, 1);
    const s = comp.reduce((a, [, w]) => a + w, 0); comp = comp.map(([id, w]) => [id, w / s]);
  }
  const q = new Map(comp.map(([id, w]) => [id, Math.max(min, Math.round(alvoG * w / inc) * inc)]));
  const barato = [...q.keys()].sort((a, b) => cat.porId.get(a).preco_centavos - cat.porId.get(b).preco_centavos)[0];
  let soma = [...q.values()].reduce((a, b) => a + b, 0);
  while (soma < alvoG) { q.set(barato, q.get(barato) + inc); soma += inc; }
  // Se passou do alvo por arredondamento, tira do mais caro sem ficar abaixo do mínimo/alvo.
  const caros = [...q.keys()].sort((a, b) => cat.porId.get(b).preco_centavos - cat.porId.get(a).preco_centavos);
  for (const id of caros) { while (soma - inc >= alvoG && q.get(id) - inc >= min) { q.set(id, q.get(id) - inc); soma -= inc; } }
  return q;
}

function custoDe(cat, q) { let t = 0; for (const [id, g] of q) t += subtotalCentavos(cat.porId.get(id).preco_centavos, 'kg', g); return t; }

// Desloca peso do item mais caro para o mais barato até caber no orçamento.
function ajustarAoOrcamento(cat, q, orc) {
  const min = cat.parametros.minimo_por_item_g; const inc = cat.parametros.incremento_padrao_g;
  const preco = id => cat.porId.get(id).preco_centavos;
  let guard = 0;
  while (custoDe(cat, q) > orc && guard++ < 2000) {
    const ids = [...q.keys()].sort((a, b) => preco(a) - preco(b));
    const barato = ids[0];
    const caro = [...ids].reverse().find(id => id !== barato && preco(id) > preco(barato) && q.get(id) > 0);
    if (!caro) return false;
    if (q.get(caro) - inc >= min) { q.set(caro, q.get(caro) - inc); q.set(barato, q.get(barato) + inc); }
    else { q.set(barato, q.get(barato) + q.get(caro)); q.delete(caro); }
  }
  return custoDe(cat, q) <= orc;
}

function idDaProposta(itens) {
  const s = itens.map(i => `${i.productId}:${i.quantidade}`).sort().join('|');
  let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 'P' + (h >>> 0).toString(36);
}

export function montarProposta(cat, { titulo, itens, restricoes, orcamentoCentavos, premissas = [], explicacao = '' }) {
  const cot = cotarLista(cat, itens, { restricoes, orcamentoCentavos });
  if (!cot.ok) return { ok: false, erros: cot.erros };
  const pend = [...cot.pendencias, 'Estoque, peso final, frete e prazo são confirmados pela equipe no WhatsApp.'];
  return {
    ok: true,
    id: idDaProposta(cot.itens),
    title: titulo,
    items: cot.itens,
    meatWeightGrams: cot.meatWeightGrams,
    boneInGrams: cot.boneInGrams,
    totalCents: cot.totalCents,
    budgetCents: cot.budgetCents,
    budgetRemainingCents: cot.budgetRemainingCents,
    withinBudget: cot.dentroDoOrcamento,
    restrictionViolations: cot.violacoes,
    assumptions: [...premissas, ...cot.avisos],
    pendingConfirmations: pend,
    explanation: explicacao,
    validatedBy: 'motor-boi-premium'
  };
}

function maiorAlvoNoOrcamento(cat, fluxo, nivel, restr, orc) {
  const inc = cat.parametros.incremento_padrao_g; const min = cat.parametros.minimo_por_item_g;
  let lo = 0; let hi = 100000; let melhor = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2 / inc) * inc;
    if (mid < min) { lo = mid + inc; continue; }
    const q = distribuir(cat, montarComposicao(cat, fluxo, nivel, restr), mid);
    const okk = ajustarAoOrcamento(cat, q, orc);
    if (okk) { melhor = mid; lo = mid + inc; } else hi = mid - inc;
  }
  return melhor;
}

// fluxo: 'churrasco' | 'semana'; alvoG opcional (fluxo orçamento sem pessoas → maior peso que cabe).
export function proporOpcoes(cat, entrada = {}) {
  const fluxo = entrada.fluxo === 'semana' ? 'semana' : 'churrasco';
  const restr = normalizarRestricoes(entrada.restricoes);
  const orc = Number.isInteger(entrada.orcamentoCentavos) && entrada.orcamentoCentavos > 0 ? entrada.orcamentoCentavos : null;
  let alvo = Number.isInteger(entrada.alvoGramas) && entrada.alvoGramas > 0 ? Math.min(entrada.alvoGramas, 100000) : null;
  const premissas = Array.isArray(entrada.premissas) ? entrada.premissas.slice(0, 8) : [];
  const resultado = { fluxo, propostas: [], observacoes: [], inviavel: null };
  if (!alvo && !orc) { resultado.observacoes.push('Preciso do número de pessoas ou do orçamento para sugerir quantidades.'); return resultado; }

  const niveis = [['custo', 'Melhor custo-benefício'], ['premium', 'Seleção premium']];
  const quantidades = {};
  for (const [nivel] of niveis) {
    const comp = montarComposicao(cat, fluxo, nivel, restr);
    if (!comp.length) continue;
    let alvoNivel = alvo;
    if (!alvoNivel) {
      alvoNivel = maiorAlvoNoOrcamento(cat, fluxo, nivel, restr, orc);
      if (!alvoNivel) continue;
    }
    const q = distribuir(cat, comp, alvoNivel);
    if (orc && !ajustarAoOrcamento(cat, q, orc)) continue;
    quantidades[nivel] = { q, alvo: alvoNivel, comp };
  }
  if (quantidades.premium) {
    // A seleção premium só existe se mantiver pelo menos um corte nobre e custar mais que a de custo-benefício.
    const idsCusto = new Set((quantidades.custo ? quantidades.custo.comp : montarComposicao(cat, fluxo, 'custo', restr)).map(([id]) => id));
    const nobres = [...quantidades.premium.q.keys()].filter(id => !idsCusto.has(id));
    const maisCaro = !quantidades.custo || custoDe(cat, quantidades.premium.q) > custoDe(cat, quantidades.custo.q);
    if (!nobres.length || !maisCaro) {
      delete quantidades.premium;
      resultado.observacoes.push('A seleção premium não coube no orçamento/restrições sem virar uma cópia da opção econômica, então mostrei só uma opção. Posso ampliar o orçamento ou reduzir a quantidade para incluir cortes nobres.');
    }
  }
  if (!Object.keys(quantidades).length) {
    const algumComp = montarComposicao(cat, fluxo, 'custo', restr);
    if (!algumComp.length) { resultado.observacoes.push('Com essas restrições não encontrei cortes cadastrados para sugerir. Posso chamar a equipe.'); return resultado; }
    if (alvo && orc) {
      const qMin = distribuir(cat, algumComp, alvo);
      ajustarAoOrcamento(cat, qMin, 0); // concentra no mais barato
      const necessario = custoDe(cat, qMin);
      const cabe = maiorAlvoNoOrcamento(cat, fluxo, 'custo', restr, orc);
      resultado.inviavel = { orcamentoNecessarioCentavos: necessario, alvoGramas: alvo, maiorPesoNoOrcamentoGramas: cabe };
      resultado.observacoes.push(`Para ${formatarPeso(alvo)} de carne, o mínimo com o catálogo atual é cerca de ${formatarReais(necessario)}. Com ${formatarReais(orc)} cabem até ${formatarPeso(cabe)}. Podemos reduzir a quantidade ou ampliar o orçamento.`);
    } else {
      resultado.observacoes.push('O orçamento informado não cobre a quantidade mínima por item.');
    }
    return resultado;
  }
  for (const [nivel, titulo] of niveis) {
    const r = quantidades[nivel]; if (!r) continue;
    const itens = [...r.q].map(([productId, quantidade]) => ({ productId, quantidade, unidade: 'kg' }));
    const prem = [...premissas];
    if (!alvo) prem.push(`Sem número de pessoas: montei o maior peso que cabe no orçamento (${formatarPeso(r.alvo)}).`);
    const proposta = montarProposta(cat, {
      titulo, itens, restricoes: restr, orcamentoCentavos: orc, premissas: prem,
      explicacao: nivel === 'custo' ? 'Cortes com bom rendimento e preço mais acessível.' : 'Cortes nobres, ajustados para caber no orçamento quando possível.'
    });
    if (!proposta.ok) continue;
    if (resultado.propostas.some(p => p.id === proposta.id)) {
      resultado.observacoes.push('Com o orçamento e as restrições informados, só existe uma combinação viável — não repeti a mesma opção.');
      continue;
    }
    resultado.propostas.push(proposta);
  }
  if (resultado.propostas.length === 1 && !resultado.observacoes.length) resultado.observacoes.push('Só uma opção coube no orçamento/restrições.');
  return resultado;
}

// Busca simples para a IA (somente leitura).
export function buscarProdutos(cat, f = {}) {
  const restr = normalizarRestricoes(f.restricoes);
  const texto = cat.norm(f.texto || '').slice(0, 60);
  let lista = cat.todos.filter(p => p.ativo);
  if (f.categoria) lista = lista.filter(p => p.categoria === f.categoria);
  if (f.preparo) lista = lista.filter(p => (p.preparo || []).includes(f.preparo));
  if (texto) lista = lista.filter(p => [p.nome, p.nome_site, ...(p.aliases || [])].some(n => n && cat.norm(n).includes(texto)));
  if (Number.isInteger(f.precoMaxCentavos)) lista = lista.filter(p => p.preco_centavos <= f.precoMaxCentavos);
  return lista.slice(0, 40).map(p => resumoProduto(p, motivoBloqueio(p, restr)));
}

export function resumoProduto(p, bloqueio = null) {
  const r = {
    id: p.id, nome: p.nome_site || p.nome, categoria: p.categoria, unidade: p.unidade,
    preco: formatarReais(p.preco_centavos) + (p.unidade === 'kit' ? '/kit' : '/kg'), preco_centavos: p.preco_centavos,
    proteina: p.proteina, contem_suino: p.contem_suino, osso: p.osso, preparo: p.preparo,
    estoque: 'sujeito à confirmação', origem_preco: p.origem
  };
  if (bloqueio) r.bloqueado_pelas_restricoes = bloqueio;
  if (p.unidade === 'kit') {
    Object.assign(r, {
      composicao: p.composicao.map(c => (c.gramas ? c.gramas + ' g ' : c.unidades + ' un. ') + c.nome),
      carne_sem_osso_g: p.carne_sem_osso_g, com_osso_ou_indefinido_g: p.carne_com_osso_ou_indefinido_g,
      pao_de_alho_incluso_pct: p.pao_de_alho_incluso_pct, itens_sem_peso: p.itens_sem_peso,
      trocas: 'trocas dentro do kit só com confirmação da equipe; o preço do kit não muda automaticamente'
    });
  }
  if (p.ingredientes_conhecidos === false && p.unidade !== 'kit') r.ingredientes = 'a confirmar com a equipe';
  return r;
}

export function complementos(cat, propostaItens = []) {
  const skus = cat.todos.filter(p => /carv|pao de alho|p[aã]o de alho/i.test(cat.norm(p.nome)) && p.unidade !== 'kit');
  const pao = propostaItens.reduce((s, i) => { const p = cat.porId.get(i.productId); return s + (p && p.pao_de_alho_incluso_pct ? p.pao_de_alho_incluso_pct * i.quantidade : 0); }, 0);
  return {
    pergunta: 'Você já tem carvão e pão de alho?',
    disponiveisComPreco: skus.map(p => resumoProduto(p)),
    paoDeAlhoJaInclusoPct: pao,
    mensagem: skus.length ? '' : 'Carvão e pão de alho avulsos não estão cadastrados com preço. Posso pedir para a equipe consultar.'
  };
}

// Mensagem de WhatsApp (sem dados pessoais).
export function mensagemWhatsApp(linhas, extras = {}) {
  const partes = ['Olá, Boi Premium! Montei esta lista pelo site e gostaria de revisar com a equipe:', ''];
  let total = 0;
  for (const l of linhas) {
    total += l.subtotalCents;
    const q = l.unidade === 'kit' ? `${l.quantidade}x` : formatarPeso(l.quantidade);
    partes.push(`• ${q} ${l.nome} — ${formatarReais(l.subtotalCents)}` + (l.unidade === 'kg' ? ` (${formatarReais(l.unitPriceCents)}/kg)` : ` (${formatarReais(l.unitPriceCents)}/kit)`));
  }
  partes.push('', `Total estimado: ${formatarReais(total)}`);
  if (extras.restricoes && extras.restricoes.length) partes.push(`Restrições: ${extras.restricoes.join('; ')}`);
  if (extras.pendencias && extras.pendencias.length) { partes.push('A confirmar:'); for (const p of extras.pendencias) partes.push(`- ${p}`); }
  partes.push('', 'Sei que peso final, disponibilidade, frete e prazo são confirmados por vocês.');
  return partes.join('\n');
}
