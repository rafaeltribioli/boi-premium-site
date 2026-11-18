// Laço de conversa com o modelo (Claude Messages API) usando ferramentas restritas.
import { PROMPT_SISTEMA } from './prompt.js';
import { DEFINICOES, executar } from './ferramentas.js';

const API_PADRAO = 'https://api.anthropic.com/v1/messages';

export class ErroIA extends Error { constructor(motivo, detalhe) { super(motivo); this.motivo = motivo; this.detalhe = detalhe; } }

// mensagens: [{role:'user'|'assistant', content:string}] (histórico já validado + mensagem atual com <dados_do_site>)
export async function conversar({ env, fetchImpl, mensagens, estado, prazo }) {
  const modelo = env.MODELO_IA || 'claude-haiku-5-5';
  const maxChamadas = Math.min(8, Math.max(1, Number(env.MAX_CHAMADAS_MODELO) || 6));
  const maxTokens = Math.min(4096, Math.max(512, Number(env.MAX_TOKENS_RESPOSTA) || 2048));
  const msgs = mensagens.map(m => ({ role: m.role, content: m.content }));
  const uso = { entrada: 0, saida: 0, chamadas: 0 };
  let textoFinal = '';

  for (let i = 0; i < maxChamadas; i++) {
    const restante = prazo - Date.now();
    if (restante < 1500) throw new ErroIA('timeout');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), restante);
    let resp;
    try {
      const abortado = new Promise((_, rej) => ctrl.signal.addEventListener('abort', () => rej(new Error('abort')), { once: true }));
      resp = await Promise.race([abortado, fetchImpl(env.ANTHROPIC_API_URL || API_PADRAO, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: modelo, max_tokens: maxTokens, system: PROMPT_SISTEMA, tools: DEFINICOES, tool_choice: { type: 'auto' }, messages: msgs })
      })]);
    } catch (e) {
      throw new ErroIA(ctrl.signal.aborted ? 'timeout' : 'rede');
    } finally { clearTimeout(t); }
    uso.chamadas++;
    if (!resp.ok) throw new ErroIA(resp.status === 401 || resp.status === 403 ? 'credencial' : resp.status === 429 ? 'limite_provedor' : 'provedor', resp.status);
    let dados;
    try { dados = await resp.json(); } catch { throw new ErroIA('resposta_invalida'); }
    uso.entrada += (dados.usage && dados.usage.input_tokens) || 0;
    uso.saida += (dados.usage && dados.usage.output_tokens) || 0;
    const blocos = Array.isArray(dados.content) ? dados.content : [];
    textoFinal = blocos.filter(b => b.type === 'text').map(b => b.text).join('\n').trim() || textoFinal;
    const chamadas = blocos.filter(b => b.type === 'tool_use');
    if (!chamadas.length) break;
    msgs.push({ role: 'assistant', content: blocos });
    const resultados = [];
    for (const c of chamadas) {
      let saida;
      try { saida = executar(c.name, c.input, estado); } catch { saida = { erro: ['Falha interna na ferramenta.'] }; }
      resultados.push({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(saida).slice(0, 12000) });
    }
    if (estado.final) break;
    msgs.push({ role: 'user', content: resultados });
  }
  return { final: estado.final, textoFinal, uso, modelo };
}
