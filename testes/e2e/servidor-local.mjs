// Servidor local para teste de ponta a ponta da interface com o Worker real e um MODELO SIMULADO.
// Não usa chave nem chama a API da Anthropic. Uso: node testes/e2e/servidor-local.mjs 8787 http://localhost:8080
import http from 'node:http';
import { criarHandler } from '../../servidor/worker.js';

const porta = Number(process.argv[2] || 8787);
const origem = process.argv[3] || 'http://localhost:8080';
const uso = (id, name, input) => ({ type: 'tool_use', id, name, input });

async function modeloSimulado(url, init) {
  const corpo = JSON.parse(init.body);
  const ultima = corpo.messages.at(-1);
  let content;
  if (typeof ultima.content === 'string') {
    const texto = ultima.content.split('<mensagem_do_cliente>')[1] || '';
    const ad = /(\d+)\s*adult/i.exec(texto); const cr = /(\d+)\s*crian/i.exec(texto); const orc = /R\$\s*(\d+)/i.exec(texto);
    if (/lento/i.test(texto)) { await new Promise(r => setTimeout(r, 30000)); }
    if (ad) content = [uso('e1', 'estimar_quantidade', { fluxo: 'churrasco', adultos: +ad[1], criancas: cr ? +cr[1] : 0 })];
    else content = [uso('r0', 'responder', { mensagem: 'Para quantas pessoas é o churrasco?', sugestoes_rapidas: ['8 adultos', '10 adultos e 2 crianças'] })];
    corpo._orc = orc ? +orc[1] : null; globalThis.__orc = corpo._orc; globalThis.__semPorco = /sem porco/i.test(texto);
  } else {
    const res = JSON.parse(ultima.content[0].content);
    if (res.gramas) content = [uso('p1', 'propor_opcoes', { fluxo: 'churrasco', alvo_gramas: res.gramas, orcamento_reais: globalThis.__orc || undefined, restricoes: globalThis.__semPorco ? { excluir_proteinas: ['suino'] } : {}, premissas: res.premissas })];
    else if (res.propostas) content = [uso('l1', 'preparar_lista', { proposta_ids: res.propostas.map(p => p.id) }), uso('f1', 'responder', { mensagem: res.propostas.length ? 'Montei as opções com os preços do catálogo. Você já tem carvão e pão de alho?' : res.observacoes.join(' '), acoes: ['adicionar'] })];
    else content = [uso('f2', 'responder', { mensagem: 'Certo.' })];
  }
  return new Response(JSON.stringify({ content, stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 });
}

const handler = criarHandler({ fetchImpl: modeloSimulado, log: () => {} });
const env = { ANTHROPIC_API_KEY: 'simulado-sem-chave-real-000000000000', ORIGENS_PERMITIDAS: origem, TIMEOUT_MS: '4000' };
http.createServer(async (req, res) => {
  const partes = []; for await (const p of req) partes.push(p);
  const corpo = Buffer.concat(partes);
  const r = await handler.fetch(new Request('http://localhost' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : corpo }), env);
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(porta, () => console.log('worker local (modelo simulado) em http://localhost:' + porta));
