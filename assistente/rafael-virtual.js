// Rafael Virtual — interface do assistente no topo do site.
// Toda a renderização usa textContent (nada de innerHTML com texto do usuário ou do modelo).
import { criarCatalogo, estimarQuantidade, proporOpcoes, formatarReais, formatarPeso, mensagemWhatsApp } from './motor.js';

const CFG = window.BOI_CONFIG || {};
const WHATS = CFG.whatsapp || '5519993497099';
const ENDPOINT = ((CFG.assistente && CFG.assistente.endpoint) || '').replace(/\/+$/, '');
const TIMEOUT = (CFG.assistente && CFG.assistente.timeoutMs) || 22000;
const SAUDACAO = 'Olá! Sou o Rafael Virtual, assistente com IA da Boi Premium. Vamos montar seu churrasco ou as carnes da semana?';
const AVISO_FALLBACK = 'Assistente com IA temporariamente indisponível. Abaixo há uma calculadora simples (sem IA) com os preços do catálogo, e a equipe atende pelo WhatsApp das ' + (CFG.atendimento || '08h às 19h') + '.';
const FLUXOS = {
  churrasco: { titulo: 'Montar meu churrasco', pergunta: 'Quantos adultos e crianças vão participar? Se quiser, já me diga o orçamento e se há restrição (ex.: sem porco).', exemplos: ['10 adultos, 4 crianças, até R$ 350 e sem porco', '6 adultos, sem limite de orçamento'] },
  semana: { titulo: 'Comprar para a semana', pergunta: 'Para quantas pessoas você quer comprar e em quantas refeições pretende preparar carne?', exemplos: ['Somos 2 adultos, 5 refeições, até R$ 150', '4 pessoas, 7 refeições, só frango e boi'] },
  orcamento: { titulo: 'Comprar com meu orçamento', pergunta: 'Quanto você quer gastar? É para churrasco ou para as refeições em casa?', exemplos: ['Tenho R$ 200 para a semana', 'R$ 300 para um churrasco'] }
};

const $ = (s, el = document) => el.querySelector(s);
const el = (tag, props = {}, ...filhos) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const f of filhos) if (f) e.append(f);
  return e;
};
function rastrear(evento, dados = {}) {
  // Eventos sem texto da conversa. Só repassa ao dataLayer se o site já tiver um (consentimento existente).
  try { document.dispatchEvent(new CustomEvent('boi:analytics', { detail: { evento, ...dados } })); if (Array.isArray(window.dataLayer)) window.dataLayer.push({ event: evento, ...dados }); } catch { }
}

const estado = {
  aberto: false, fluxo: 'churrasco', modo: null, // 'ia' | 'calc'
  sessao: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)).replace(/[^a-zA-Z0-9_-]/g, ''),
  historico: [], propostas: [], adicionadas: new Set(), enviando: false, ultimaFalha: null,
  obs: new Set(), restricoesTexto: [], catalogo: null, evitar: new Set(), botaoOrigem: null
};

const secao = $('#inicio.rv') || $('.rv');
if (secao) iniciar();

function iniciar() {
  const painel = $('#rv-painel', secao);
  painel.append(montarCaixa());
  secao.querySelectorAll('[data-fluxo]').forEach(b => b.addEventListener('click', () => abrir(b.dataset.fluxo, b)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && estado.aberto) fechar(); });
}

function montarCaixa() {
  return el('div', { class: 'rv-caixa' },
    el('div', { class: 'rv-cab' },
      el('div', {}, el('h2', { id: 'rv-titulo-painel', text: 'Rafael Virtual' }), el('span', { class: 'rv-selo-modo', id: 'rv-modo', text: 'Assistente com IA da Boi Premium' })),
      el('button', { class: 'rv-fechar', type: 'button', 'aria-label': 'Fechar o assistente', onclick: () => fechar(), text: '×' })),
    el('p', { class: 'rv-aviso', id: 'rv-aviso', role: 'status', hidden: true }),
    el('div', { class: 'rv-log', id: 'rv-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversa com o Rafael Virtual', tabindex: '0' }),
    el('div', { class: 'rv-rapidas', id: 'rv-rapidas' }),
    el('form', { class: 'rv-form', id: 'rv-form', onsubmit: e => { e.preventDefault(); enviarDoCampo(); } },
      el('label', { for: 'rv-entrada', text: 'Escreva sua mensagem para o Rafael Virtual' }),
      el('textarea', { id: 'rv-entrada', rows: '2', maxlength: '600', placeholder: 'Ex.: 10 adultos, 4 crianças, até R$ 350 e sem porco', onkeydown: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarDoCampo(); } } }),
      el('button', { class: 'rv-enviar', id: 'rv-enviar', type: 'submit', text: 'Enviar' })),
    montarCalculadora(),
    el('div', { class: 'rv-propostas', id: 'rv-propostas', 'aria-live': 'polite' }),
    el('div', { class: 'rv-fechamento', id: 'rv-fechamento', hidden: true })
  );
}

function montarCalculadora() {
  const num = (id, rotulo, extra = {}) => el('label', { for: id }, rotulo, el('input', { id, type: 'number', inputmode: 'numeric', min: '0', ...extra }));
  return el('form', { class: 'rv-calc', id: 'rv-calc', hidden: true, onsubmit: e => { e.preventDefault(); calcular(); } },
    el('h3', { text: 'Calculadora Boi Premium (sem IA)' }),
    el('p', { text: 'Cálculo automático com regras fixas e preços do catálogo (data-base 29/10/2026; Kit Fraldinha e Buchada confirmados em 17/11/2026). Não é inteligência artificial.' }),
    el('div', { class: 'rv-campos' },
      el('label', { for: 'rv-c-fluxo' }, 'Para quê?', el('select', { id: 'rv-c-fluxo', onchange: atualizarCamposCalc },
        el('option', { value: 'churrasco', text: 'Churrasco' }), el('option', { value: 'semana', text: 'Refeições da semana' }), el('option', { value: 'orcamento', text: 'Só pelo orçamento' }))),
      num('rv-c-adultos', 'Adultos', { max: '500', value: '' }),
      num('rv-c-criancas', 'Crianças', { max: '500', value: '' }),
      num('rv-c-refeicoes', 'Refeições com carne', { max: '60' }),
      num('rv-c-orcamento', 'Orçamento (R$, opcional)', { step: '1', max: '50000', inputmode: 'decimal' })),
    el('fieldset', { class: 'rv-checks' }, el('legend', { text: 'Restrições' }),
      el('label', {}, el('input', { type: 'checkbox', id: 'rv-c-semporco' }), 'Sem porco'),
      el('label', {}, el('input', { type: 'checkbox', id: 'rv-c-semfrango' }), 'Sem frango'),
      el('label', {}, el('input', { type: 'checkbox', id: 'rv-c-soboi' }), 'Só boi')),
    el('button', { class: 'rv-primario', type: 'submit', text: 'Calcular sugestões (sem IA)' }),
    el('p', { class: 'rv-obs', id: 'rv-c-msg', role: 'status' }));
}

function atualizarCamposCalc() {
  const f = $('#rv-c-fluxo').value;
  $('#rv-c-refeicoes').closest('label').hidden = f !== 'semana';
}

// ---------- abrir / fechar ----------
async function abrir(fluxo, botao) {
  estado.fluxo = FLUXOS[fluxo] ? fluxo : 'churrasco';
  estado.botaoOrigem = botao;
  const painel = $('#rv-painel');
  painel.hidden = false; estado.aberto = true;
  secao.querySelectorAll('[aria-controls="rv-painel"]').forEach(b => b.setAttribute('aria-expanded', 'true'));
  rastrear('assistant_open'); rastrear('flow_selected', { fluxo: estado.fluxo });
  $('#rv-titulo-painel').textContent = 'Rafael Virtual · ' + FLUXOS[estado.fluxo].titulo;
  if (!estado.modo) await decidirModo();
  if (estado.modo === 'ia') {
    if (!estado.historico.length) { mensagem('ia', SAUDACAO); estado.historico.push({ role: 'assistant', text: SAUDACAO }); }
    mensagem('ia', FLUXOS[estado.fluxo].pergunta); estado.historico.push({ role: 'assistant', text: FLUXOS[estado.fluxo].pergunta });
    rapidas(FLUXOS[estado.fluxo].exemplos);
  } else {
    $('#rv-c-fluxo').value = estado.fluxo; atualizarCamposCalc();
  }
  painel.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  setTimeout(() => (estado.modo === 'ia' ? $('#rv-entrada') : $('#rv-c-adultos')).focus({ preventScroll: true }), 300);
}

function fechar() {
  $('#rv-painel').hidden = true; estado.aberto = false;
  secao.querySelectorAll('[aria-controls="rv-painel"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
  (estado.botaoOrigem || $('.rv-cta', secao)).focus();
}

async function decidirModo() {
  if (!ENDPOINT) return modoCalculadora('nao_configurado');
  setDigitando(true, 'Conectando ao assistente…');
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(ENDPOINT + '/api/saude', { signal: ctrl.signal, credentials: 'omit' });
    clearTimeout(t);
    const j = await r.json();
    if (r.ok && j.ia_configurada) { estado.modo = 'ia'; modoIA(); } else modoCalculadora('nao_configurado');
  } catch { modoCalculadora('indisponivel'); } finally { setDigitando(false); }
}

function modoIA() {
  $('#rv-modo').textContent = 'Assistente com IA da Boi Premium'; $('#rv-modo').classList.remove('off');
  $('#rv-form').hidden = false; $('#rv-calc').hidden = true; $('#rv-aviso').hidden = true;
}

function modoCalculadora(motivo) {
  estado.modo = 'calc';
  $('#rv-modo').textContent = 'IA indisponível · calculadora sem IA'; $('#rv-modo').classList.add('off');
  const aviso = $('#rv-aviso'); aviso.textContent = AVISO_FALLBACK; aviso.hidden = false;
  aviso.append(' ', el('a', { href: whatsLink('Olá, Boi Premium! Vim pelo site e quero ajuda para montar meu pedido.'), target: '_blank', rel: 'noopener noreferrer', text: 'Falar com a equipe ↗' }));
  $('#rv-form').hidden = true; $('#rv-calc').hidden = false; $('#rv-rapidas').replaceChildren();
  $('#rv-c-fluxo').value = estado.fluxo; atualizarCamposCalc();
  rastrear('fallback_used', { motivo });
}

// ---------- conversa (IA real) ----------
function mensagem(quem, texto) {
  const log = $('#rv-log');
  log.append(el('p', { class: 'rv-msg ' + quem, text: texto }));
  log.scrollTop = log.scrollHeight;
}
function setDigitando(sim, texto = 'Rafael Virtual está pensando…') {
  const log = $('#rv-log'); let d = $('.rv-digitando', log);
  if (sim) { if (!d) { d = el('p', { class: 'rv-digitando', text: texto }); log.append(d); } else d.textContent = texto; log.scrollTop = log.scrollHeight; }
  else if (d) d.remove();
}
function rapidas(lista) {
  const box = $('#rv-rapidas'); box.replaceChildren();
  for (const t of (lista || []).slice(0, 4)) box.append(el('button', { type: 'button', text: t, onclick: () => enviar(t) }));
}

function enviarDoCampo() {
  const campo = $('#rv-entrada'); const t = campo.value.trim();
  if (!t || estado.enviando) return;
  campo.value = ''; enviar(t);
}

async function enviar(texto, repetir = false) {
  if (estado.enviando) return;
  estado.enviando = true; $('#rv-enviar').disabled = true; $('#rv-rapidas').replaceChildren();
  const retry = $('.rv-retry'); if (retry) retry.remove();
  if (!repetir) { mensagem('cliente', texto); }
  setDigitando(true);
  const lista = window.BoiLista ? window.BoiLista.itensComProduto() : [];
  const corpo = {
    message: texto.slice(0, 600), sessionId: estado.sessao,
    history: estado.historico.slice(-12),
    preferences: { fluxo: estado.fluxo, complementosOferecidos: estado.historico.some(m => m.role === 'assistant' && /carv[aã]o/i.test(m.text)) },
    currentList: lista,
    lastProposals: estado.propostas.slice(-2).map(p => ({ title: p.title, items: p.items.map(i => ({ productId: i.productId, quantity: i.quantity })) }))
  };
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT);
    const r = await fetch(ENDPOINT + '/api/assistente', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo), signal: ctrl.signal, credentials: 'omit' });
    clearTimeout(t);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) {
      if (r.status === 429) { setDigitando(false); mensagem('sistema', j.message || 'Muitas mensagens seguidas. Aguarde um pouco.'); estado.ultimaFalha = texto; botaoRetry(); return; }
      throw Object.assign(new Error('falha'), { motivo: j.motivo || 'http_' + r.status });
    }
    setDigitando(false);
    estado.historico.push({ role: 'user', text: texto });
    const resposta = [j.message, ...(j.questions || [])].filter(Boolean).join('\n\n');
    mensagem('ia', resposta); estado.historico.push({ role: 'assistant', text: resposta });
    if (Array.isArray(j.restrictions)) estado.restricoesTexto = j.restrictions.slice(0, 6);
    if (Array.isArray(j.pendingRequests)) for (const t of j.pendingRequests.slice(0, 6)) estado.obs.add(t);
    if (j.proposals && j.proposals.length) { estado.propostas = j.proposals; mostrarPropostas(j.proposals, 'ia'); }
    rapidas(j.quickReplies);
    estado.ultimaFalha = null;
  } catch (e) {
    setDigitando(false);
    estado.ultimaFalha = texto;
    mensagem('sistema', 'Não consegui falar com o assistente com IA agora.');
    botaoRetry();
    modoCalculadora(e.name === 'AbortError' ? 'timeout' : (e.motivo || 'rede'));
    $('#rv-form').hidden = false; // permite tentar de novo
  } finally {
    estado.enviando = false; $('#rv-enviar').disabled = false;
  }
}
function botaoRetry() {
  const b = el('button', { type: 'button', class: 'rv-btn2 rv-retry', text: 'Tentar de novo', onclick: () => { b.remove(); if (estado.ultimaFalha) enviar(estado.ultimaFalha, true); } });
  $('#rv-log').after(b);
}

// ---------- calculadora (sem IA) ----------
async function catalogo() {
  if (!estado.catalogo) {
    const r = await fetch(new URL('../dados/catalogo.json', import.meta.url));
    if (!r.ok) throw new Error('catalogo');
    estado.catalogo = criarCatalogo(await r.json());
  }
  return estado.catalogo;
}

async function calcular() {
  const msg = $('#rv-c-msg'); msg.textContent = '';
  let cat; try { cat = await catalogo(); } catch { msg.textContent = 'Não consegui carregar o catálogo. Fale com a equipe pelo WhatsApp.'; return; }
  const fl = $('#rv-c-fluxo').value;
  const n = id => { const v = $(id).value.trim(); return v === '' ? 0 : Math.max(0, Math.round(Number(v.replace(',', '.')))); };
  const adultos = n('#rv-c-adultos'), criancas = n('#rv-c-criancas'), refeicoes = n('#rv-c-refeicoes');
  const orcTxt = $('#rv-c-orcamento').value.trim().replace(',', '.');
  const orc = orcTxt ? Math.round(Number(orcTxt) * 100) : null;
  const restr = { excluirProteinas: [], somenteProteinas: [], evitarIds: [...estado.evitar] };
  estado.restricoesTexto = [];
  if ($('#rv-c-semporco').checked) { restr.excluirProteinas.push('suino'); estado.restricoesTexto.push('sem porco'); }
  if ($('#rv-c-semfrango').checked) { restr.excluirProteinas.push('frango'); estado.restricoesTexto.push('sem frango'); }
  if ($('#rv-c-soboi').checked) { restr.somenteProteinas.push('bovino'); estado.restricoesTexto.push('só boi'); }
  const finalidade = fl === 'semana' ? 'semana' : 'churrasco';
  let alvo = null; let premissas = [];
  if (fl !== 'orcamento' || adultos || criancas) {
    if (!adultos && !criancas) { msg.textContent = 'Informe quantos adultos e crianças.'; $('#rv-c-adultos').focus(); return; }
    if (finalidade === 'semana' && !refeicoes) { msg.textContent = 'Informe quantas refeições com carne.'; $('#rv-c-refeicoes').focus(); return; }
    const e = estimarQuantidade(cat, { fluxo: finalidade, adultos, criancas, refeicoes });
    alvo = e.gramas; premissas = e.premissas;
  } else if (!orc) { msg.textContent = 'Informe o orçamento ou o número de pessoas.'; $('#rv-c-orcamento').focus(); return; }
  const r = proporOpcoes(cat, { fluxo: finalidade, alvoGramas: alvo, orcamentoCentavos: orc, restricoes: restr, premissas });
  msg.textContent = r.observacoes.join(' ');
  const props = r.propostas.map(p => ({
    id: p.id, title: p.title, explanation: p.explanation,
    items: p.items.map(i => ({ productId: i.productId, name: i.nome, siteName: i.nomeSite, quantity: i.quantidade, unit: i.unidade === 'kit' ? 'kit' : 'g', priceUnit: i.unidade, unitPriceCents: i.unitPriceCents, subtotalCents: i.subtotalCents })),
    meatWeightGrams: p.meatWeightGrams, boneInGrams: p.boneInGrams, totalCents: p.totalCents, budgetCents: p.budgetCents, budgetRemainingCents: p.budgetRemainingCents,
    assumptions: p.assumptions, pendingConfirmations: p.pendingConfirmations
  }));
  estado.propostas = props;
  mostrarPropostas(props, 'calc');
}

// ---------- propostas ----------
function mostrarPropostas(props, origem) {
  const box = $('#rv-propostas'); box.replaceChildren();
  for (const p of props) box.append(cartao(p, origem));
  if (props.length) rastrear('proposal_shown', { quantidade: props.length, origem });
}

function cartao(p, origem) {
  const itens = el('ul', { class: 'rv-itens' });
  for (const i of p.items) {
    const qtd = i.unit === 'kit' ? `${i.quantity} kit${i.quantity > 1 ? 's' : ''}` : formatarPeso(i.quantity);
    const det = el('span', { class: 'rv-det' }, el('span', { text: formatarReais(i.unitPriceCents) + (i.priceUnit === 'kit' ? '/kit' : '/kg') }));
    if (origem === 'calc' && p.items.length > 1) det.append(el('button', { type: 'button', class: 'rv-tirar', text: 'Trocar este item', 'aria-label': 'Trocar ' + i.name + ' por outra opção', onclick: () => { estado.evitar.add(i.productId); calcular(); } }));
    itens.append(el('li', {}, el('span', { class: 'rv-nome', text: `${qtd} · ${i.name}` }), el('span', { text: formatarReais(i.subtotalCents) }), det));
  }
  const resumo = el('dl', { class: 'rv-resumo' },
    el('dt', { text: 'Carne sem osso (estimada)' }), el('dd', { text: formatarPeso(p.meatWeightGrams) }));
  if (p.boneInGrams) resumo.append(el('dt', { text: 'Peças com osso (fora da estimativa)' }), el('dd', { text: formatarPeso(p.boneInGrams) }));
  resumo.append(el('dt', { text: 'Total de produtos' }), el('dd', { class: 'rv-total', text: formatarReais(p.totalCents) }));
  if (p.budgetCents != null) resumo.append(el('dt', { text: 'Saldo do orçamento' }), el('dd', { text: formatarReais(p.budgetRemainingCents) }));
  const det = el('details', {}, el('summary', { text: 'Premissas e o que a equipe confirma' }), el('ul', {}, ...[...(p.assumptions || []), ...(p.pendingConfirmations || [])].map(t => el('li', { text: t }))));
  const ja = estado.adicionadas.has(p.id);
  const add = el('button', { type: 'button', class: 'rv-primario', text: ja ? 'Adicionada à sua lista ✓' : 'Adicionar à minha lista', disabled: ja, onclick: () => adicionar(p, add) });
  const acoes = el('div', { class: 'rv-acoes' }, add,
    el('button', { type: 'button', class: 'rv-btn2', text: 'Trocar um item', onclick: () => trocar(p) }),
    el('button', { type: 'button', class: 'rv-btn2', text: 'Ajustar orçamento', onclick: () => ajustarOrcamento() }),
    el('a', { class: 'rv-btn2', href: whatsLink('Olá, Boi Premium! Estou montando um pedido pelo site e queria falar com a equipe.'), target: '_blank', rel: 'noopener noreferrer', text: 'Falar com a equipe ↗' }));
  return el('article', { class: 'rv-prop', 'aria-label': p.title },
    el('h3', { text: p.title }), p.explanation ? el('p', { class: 'rv-expl', text: p.explanation }) : null, itens, resumo, det, acoes);
}

function trocar(p) {
  if (estado.modo === 'ia') { const c = $('#rv-entrada'); c.value = 'Quero trocar '; c.focus(); return; }
  const msg = $('#rv-c-msg'); msg.textContent = 'Toque em "Trocar este item" no produto que você quer substituir.';
  const b = $('#rv-propostas .rv-tirar'); if (b) b.focus();
}
function ajustarOrcamento() {
  if (estado.modo === 'ia') { const c = $('#rv-entrada'); c.value = 'Quero ajustar o orçamento para R$ '; c.focus(); return; }
  $('#rv-c-orcamento').focus();
}

async function adicionar(p, botao) {
  if (estado.adicionadas.has(p.id) || !window.BoiLista) return;
  botao.disabled = true;
  let cat; try { cat = await catalogo(); } catch { botao.disabled = false; mensagem('sistema', 'Não consegui carregar o catálogo para adicionar. Tente de novo.'); return; }
  const itens = [];
  for (const i of p.items) {
    const prod = cat.porId.get(i.productId);
    if (!prod) { botao.disabled = false; mensagem('sistema', 'Um item não está mais no catálogo. Peça uma nova sugestão.'); return; }
    itens.push({ productId: prod.id, nome: prod.nome_site || prod.nome, unidade: prod.unidade, quantidade: i.quantity, precoCentavos: prod.preco_centavos });
  }
  const obs = [...estado.restricoesTexto.map(r => 'Restrição: ' + r), ...(p.pendingConfirmations || []).filter(t => !/Estoque, peso final/.test(t)), ...[...estado.obs].map(t => 'Solicitação a confirmar: ' + t)];
  window.BoiLista.adicionar(itens, obs);
  estado.adicionadas.add(p.id);
  botao.textContent = 'Adicionada à sua lista ✓';
  rastrear('proposal_added', { itens: itens.length, valor_centavos: p.totalCents });
  mostrarFechamento();
}

function mostrarFechamento() {
  const box = $('#rv-fechamento'); box.hidden = false;
  const linhas = window.BoiLista.linhas();
  const n = linhas.length;
  const botao = el('button', { type: 'button', class: 'rv-primario', text: 'Revisar e pedir no WhatsApp' });
  box.replaceChildren(
    el('h3', { text: 'Sua lista foi atualizada' }),
    el('p', { class: 'rv-obs', text: `${n} produto${n > 1 ? 's' : ''} na mesma lista dos kits do site. Você pode continuar escolhendo kits abaixo ou revisar a mensagem.` }),
    botao);
  botao.addEventListener('click', () => {
    const texto = window.BoiLista.mensagem();
    const area = el('textarea', { readonly: true, 'aria-label': 'Mensagem que será aberta no WhatsApp' }); area.value = texto;
    const link = el('a', { class: 'rv-whats', href: whatsLink(texto), target: '_blank', rel: 'noopener noreferrer', text: 'Abrir no WhatsApp para revisar e enviar ↗', onclick: () => rastrear('whatsapp_clicked', { itens: n }) });
    box.replaceChildren(el('h3', { text: 'Revise a mensagem' }),
      el('p', { class: 'rv-obs', text: 'Nada é enviado automaticamente: o WhatsApp abre com o texto e você confere antes de enviar. Endereço e telefone são combinados no atendimento. Peso final, disponibilidade, frete e prazo são confirmados pela equipe.' }),
      area, link);
    area.focus();
  });
}

function whatsLink(texto) { return 'https://wa.me/' + WHATS + '?text=' + encodeURIComponent(texto); }

export const _interno = { mensagemWhatsApp };
