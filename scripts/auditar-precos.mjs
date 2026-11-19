// Auditoria: compara os preços do site atual (index.html) e do PDF (texto extraído) com o catálogo importado.
// Uso: node scripts/auditar-precos.mjs [texto-do-pdf.txt]   (gere o texto com: pdftotext -layout dados/importado/tabela-original-2026-10-29.pdf)
import { readFileSync } from 'node:fs';
const raiz = new URL('../', import.meta.url);
const cat = JSON.parse(readFileSync(new URL('dados/catalogo.json', raiz), 'utf8'));
const html = readFileSync(new URL('index.html', raiz), 'utf8');
const todos = [...cat.produtos, ...cat.extras_site];
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const porNome = new Map(); for (const p of todos) for (const n of [p.nome, p.nome_site, ...(p.aliases || [])]) if (n) porNome.set(norm(n), p);
const reais = c => (c / 100).toFixed(2).replace('.', ',');
const linhas = [];

const m = /const prices=(\{[^}]*\})/.exec(html);
const precosSite = JSON.parse(m[1]);
linhas.push('## Site atual (index.html) × catálogo', '', '| Item no site | Site | Catálogo | Situação |', '|---|---|---|---|');
for (const [nome, centavos] of Object.entries(precosSite)) {
  const p = porNome.get(norm(nome));
  const sit = !p ? 'não existe no catálogo importado' : p.preco_centavos === centavos ? 'igual' : 'DIVERGENTE';
  linhas.push(`| ${nome} | R$ ${reais(centavos)} | ${p ? 'R$ ' + reais(p.preco_centavos) + ' (' + p.id + ')' : '—'} | ${p && p.id.startsWith('SITE') ? 'só no site (não está no PDF); mantido com preço do site' : sit} |`);
}
const pdf = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : null;
if (pdf) {
  linhas.push('', '## PDF (data-base 29/10/2026) × catálogo', '', '| Produto | PDF | Catálogo | Situação |', '|---|---|---|---|');
  let iguais = 0;
  for (const l of pdf.split('\n')) {
    const r = /^\s{2,}(\S.*?)\s{2,}(\d+,\d{2})\s*$/.exec(l); if (!r) continue;
    const p = porNome.get(norm(r[1])); const c = Math.round(Number(r[2].replace(',', '.')) * 100);
    if (p && p.preco_centavos === c) { iguais++; continue; }
    linhas.push(`| ${r[1]} | R$ ${r[2]} | ${p ? 'R$ ' + reais(p.preco_centavos) : '—'} | ${p ? 'diferente — ' + (p.origem.startsWith('confirmacao') ? 'confirmação do proprietário em 17/11/2026 prevalece' : 'verificar') : 'não encontrado'} |`);
  }
  linhas.push('', `Demais ${iguais} itens do PDF: preço igual ao catálogo.`);
}
console.log(linhas.join('\n'));
