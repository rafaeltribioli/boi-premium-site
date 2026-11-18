// Cloudflare Worker do Rafael Virtual — POST /api/assistente, GET /api/saude.
// A chave da API fica SOMENTE em variável secreta do Worker (ANTHROPIC_API_KEY). Nunca no navegador.
import catalogoJson from '../dados/catalogo.json' with { type: 'json' };
import { criarCatalogo, cotarLista, montarProposta, normalizarRestricoes, PROTEINAS } from '../assistente/motor.js';
import { conversar, ErroIA } from './ia.js';

const CATALOGO = criarCatalogo(catalogoJson);
const LIMITE_CORPO = 32 * 1024;
const MAX_MENSAGEM = 600;
const MAX_HISTORICO = 12;
const MAX_TEXTO_HISTORICO = 1500;

// ---------- Limitador simples em memória (por instância). Para limite global use também uma regra de Rate Limiting da Cloudflare. ----------
class Limitador {
  constructor() { this.janelas = new Map(); }
  permitir(chave, limite, janelaMs, agora = Date.now()) {
    const j = this.janelas.get(chave);
    if (!j || agora - j.inicio >= janelaMs) { this.janelas.set(chave, { inicio: agora, n: 1 }); this.limpar(agora); return true; }
    if (j.n >= limite) return false;
    j.n++; return true;
  }
  limpar(agora) { if (this.janelas.size > 5000) for (const [k, v] of this.janelas) if (agora - v.inicio > 86400000) this.janelas.delete(k); }
}

const limpar = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/<\/?[a-z][^>]*>/gi, '').trim();

function origensPermitidas(env) {
  return String(env.ORIGENS_PERMITIDAS || 'https://premiumcarnes.com.br,https://www.premiumcarnes.com.br,https://rafaeltribioli.github.io')
    .split(',').map(s => s.trim()).filter(Boolean);
}

function json(corpo, status, origem) {
  const h = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  if (origem) { h['access-control-allow-origin'] = origem; h['vary'] = 'Origin'; }
  return new Response(JSON.stringify(corpo), { status, headers: h });
}

const FALLBACK_MSG = 'Assistente com IA temporariamente indisponível. Você pode usar a calculadora (sem IA) ou falar com a equipe pelo WhatsApp.';
const fallback = (motivo, origem, status = 503) => json({ ok: false, fallback: true, ai: false, motivo, message: FALLBACK_MSG }, status, origem);

// Valida e normaliza o corpo do pedido. Nunca confia em preço/estoque do cliente.
export function validarPedido(corpo) {
  if (!corpo || typeof corpo !== 'object') return { erro: 'corpo_invalido' };
  const message = limpar(corpo.message);
  if (!message) return { erro: 'mensagem_vazia' };
  if (message.length > MAX_MENSAGEM) return { erro: 'mensagem_longa' };
  const sessionId = typeof corpo.sessionId === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(corpo.sessionId) ? corpo.sessionId : null;
  if (!sessionId) return { erro: 'sessao_invalida' };
  const historico = (Array.isArray(corpo.history) ? corpo.history : []).slice(-MAX_HISTORICO)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
    .map(m => ({ role: m.role, text: limpar(m.text).slice(0, MAX_TEXTO_HISTORICO) })).filter(m => m.text);
  const pref = corpo.preferences && typeof corpo.preferences === 'object' ? corpo.preferences : {};
  const restricoesBase = normalizarRestricoes({ excluirProteinas: pref.excluirProteinas, somenteProteinas: pref.somenteProteinas });
  const fluxo = ['churrasco', 'semana', 'orcamento'].includes(pref.fluxo) ? pref.fluxo : null;
  const lista = (Array.isArray(corpo.currentList) ? corpo.currentList : []).slice(0, 30)
    .filter(i => i && typeof i.productId === 'string' && CATALOGO.porId.has(i.productId))
    .map(i => ({ productId: i.productId, quantidade: Number(i.quantity), unidade: CATALOGO.porId.get(i.productId).unidade }));
  const anteriores = (Array.isArray(corpo.lastProposals) ? corpo.lastProposals : []).slice(0, 2)
    .map(p => ({ title: limpar(p && p.title).slice(0, 60) || 'Proposta anterior', itens: (Array.isArray(p && p.items) ? p.items : []).slice(0, 15)
      .filter(i => i && CATALOGO.porId.has(i.productId)).map(i => ({ productId: i.productId, quantidade: Number(i.quantity), unidade: CATALOGO.porId.get(i.productId).unidade })) }))
    .filter(p => p.itens.length);
  return { message, sessionId, historico, restricoesBase, fluxo, lista, anteriores, complementosOferecidos: pref.complementosOferecidos === true };
}

function montarMensagens(v, estado) {
  // Recota lista e propostas anteriores com preços do servidor.
  const lista = v.lista.length ? cotarLista(CATALOGO, v.lista) : null;
  const anteriores = v.anteriores.map(p => {
    const prop = montarProposta(CATALOGO, { titulo: p.title, itens: p.itens, restricoes: v.restricoesBase });
    if (prop.ok) estado.propostas.set(prop.id, prop);
    return prop.ok ? { id: prop.id, titulo: prop.title, itens: prop.items.map(i => `${i.unidade === 'kit' ? i.quantidade + ' kit(s)' : i.quantidade + ' g'} ${i.nome} [${i.productId}]`), total_reais: (prop.totalCents / 100).toFixed(2) } : null;
  }).filter(Boolean);
  const dados = {
    fluxo_escolhido: v.fluxo,
    restricoes_salvas: { excluir_proteinas: v.restricoesBase.excluirProteinas, somente_proteinas: v.restricoesBase.somenteProteinas },
    lista_atual_do_cliente: lista && lista.ok ? lista.itens.map(i => `${i.unidade === 'kit' ? i.quantidade + ' kit(s)' : i.quantidade + ' g'} ${i.nome}`) : [],
    propostas_mostradas_antes: anteriores,
    complementos_ja_oferecidos: v.complementosOferecidos,
    atendimento_humano: '08h às 19h pelo WhatsApp', data_base_precos: CATALOGO.json.data_base_pdf
  };
  const msgs = [];
  for (const m of v.historico) {
    const ultimo = msgs[msgs.length - 1];
    if (ultimo && ultimo.role === m.role) ultimo.content += '\n' + m.text; else msgs.push({ role: m.role, content: m.text });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  const atual = `<dados_do_site>${JSON.stringify(dados)}</dados_do_site>\n<mensagem_do_cliente>${v.message}</mensagem_do_cliente>`;
  if (msgs.length && msgs[msgs.length - 1].role === 'user') msgs[msgs.length - 1].content += '\n' + atual; else msgs.push({ role: 'user', content: atual });
  return msgs;
}

const ROTULO = { bovino: 'boi', frango: 'frango', suino: 'porco', cordeiro: 'cordeiro', bufalo: 'búfalo', ave_especial: 'codorna', exotico: 'exóticos', caprino: 'bode' };
function rotulosRestricoes(r) {
  if (!r) return [];
  const out = (r.excluirProteinas || []).map(p => 'sem ' + ROTULO[p]);
  if ((r.somenteProteinas || []).length) out.push('só ' + r.somenteProteinas.map(p => ROTULO[p]).join(' e '));
  return out;
}

function propostaParaCliente(p) {
  return {
    id: p.id, title: p.title,
    items: p.items.map(i => ({ productId: i.productId, name: i.nome, siteName: i.nomeSite, quantity: i.quantidade, unit: i.unidade === 'kit' ? 'kit' : 'g', priceUnit: i.unidade, unitPriceCents: i.unitPriceCents, subtotalCents: i.subtotalCents })),
    meatWeightGrams: p.meatWeightGrams, boneInGrams: p.boneInGrams, totalCents: p.totalCents,
    budgetCents: p.budgetCents, budgetRemainingCents: p.budgetRemainingCents,
    assumptions: p.assumptions.slice(0, 8), pendingConfirmations: p.pendingConfirmations.slice(0, 8), explanation: p.explanation
  };
}

export function criarHandler({ fetchImpl = (...a) => fetch(...a), relogio = () => Date.now(), log = (o) => console.log(JSON.stringify(o)) } = {}) {
  const limitador = new Limitador();
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const origem = request.headers.get('origin');
      const permitidas = origensPermitidas(env);
      const origemOk = origem && permitidas.includes(origem) ? origem : null;
      const iaConfigurada = !!(env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY.length > 20);

      if (request.method === 'OPTIONS') {
        if (!origemOk) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: { 'access-control-allow-origin': origemOk, 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600', vary: 'Origin' } });
      }
      if (url.pathname === '/api/saude' && request.method === 'GET') {
        return json({ ok: true, ia_configurada: iaConfigurada, servico: 'rafael-virtual', catalogo_itens: CATALOGO.json.produtos.length }, 200, origemOk);
      }
      if (url.pathname !== '/api/assistente') return json({ ok: false, erro: 'nao_encontrado' }, 404, origemOk);
      if (request.method !== 'POST') return json({ ok: false, erro: 'metodo' }, 405, origemOk);
      if (!origemOk) return json({ ok: false, erro: 'origem_nao_permitida' }, 403, null);
      if (!(request.headers.get('content-type') || '').includes('application/json')) return json({ ok: false, erro: 'tipo' }, 415, origemOk);

      const inicio = relogio();
      const ip = request.headers.get('cf-connecting-ip') || 'desconhecido';
      const minuto = 60000;
      if (!limitador.permitir('ip:' + ip, Number(env.LIMITE_IP_10MIN) || 20, 10 * minuto, inicio)) return json({ ok: false, erro: 'muitas_requisicoes', message: 'Muitas mensagens em pouco tempo. Aguarde alguns minutos ou fale com a equipe.' }, 429, origemOk);
      if (!limitador.permitir('global', Number(env.LIMITE_GLOBAL_DIA) || 3000, 1440 * minuto, inicio)) { log({ evt: 'limite_global' }); return fallback('limite_diario', origemOk); }

      const texto = await request.text();
      if (texto.length > LIMITE_CORPO) return json({ ok: false, erro: 'corpo_grande' }, 413, origemOk);
      let corpo; try { corpo = JSON.parse(texto); } catch { return json({ ok: false, erro: 'json_invalido' }, 400, origemOk); }
      const v = validarPedido(corpo);
      if (v.erro) return json({ ok: false, erro: v.erro }, 400, origemOk);
      if (!limitador.permitir('s:' + v.sessionId, Number(env.LIMITE_SESSAO_DIA) || 60, 1440 * minuto, inicio)) return json({ ok: false, erro: 'limite_sessao', message: 'Esta conversa atingiu o limite de hoje. Fale com a equipe pelo WhatsApp.' }, 429, origemOk);
      if (!iaConfigurada) { log({ evt: 'fallback', motivo: 'nao_configurado' }); return fallback('nao_configurado', origemOk); }

      const estado = { cat: CATALOGO, propostas: new Map(), novas: [], mostrar: null, final: null, restricoesBase: v.restricoesBase };
      const prazo = inicio + Math.min(25000, Number(env.TIMEOUT_MS) || 20000);
      try {
        const r = await conversar({ env, fetchImpl, mensagens: montarMensagens(v, estado), estado, prazo });
        const idsMostrar = estado.mostrar && estado.mostrar.length ? estado.mostrar : estado.novas.slice(-2);
        const propostas = idsMostrar.map(id => estado.propostas.get(id)).filter(p => p && p.withinBudget !== false && !(p.restrictionViolations || []).length).map(propostaParaCliente);
        const final = r.final || { mensagem: r.textoFinal, pergunta: '', sugestoes: [], acoes: [] };
        const message = limpar(final.mensagem).slice(0, 900) || 'Pode me contar um pouco mais sobre o que você precisa?';
        log({ evt: 'turno', status: 200, ms: relogio() - inicio, chamadas: r.uso.chamadas, tok_in: r.uso.entrada, tok_out: r.uso.saida, propostas: propostas.length });
        return json({
          ok: true, ai: true, fallback: false, modelo: r.modelo,
          message, questions: final.pergunta ? [limpar(final.pergunta).slice(0, 200)] : [],
          quickReplies: (final.sugestoes || []).map(limpar).filter(Boolean),
          proposals: propostas,
          restrictions: rotulosRestricoes(estado.ultimasRestricoes || v.restricoesBase),
          pendingRequests: (final.solicitacoes || []).map(limpar).filter(Boolean),
          actions: propostas.length ? [...new Set(['adicionar', 'trocar', 'ajustar_orcamento', 'falar_equipe', ...(final.acoes || [])])] : (final.acoes || [])
        }, 200, origemOk);
      } catch (e) {
        const motivo = e instanceof ErroIA ? e.motivo : 'erro_interno';
        log({ evt: 'fallback', motivo, ms: relogio() - inicio, status_provedor: e && e.detalhe });
        return fallback(motivo, origemOk);
      }
    }
  };
}

export default criarHandler();
