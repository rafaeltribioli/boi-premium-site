// Gera dados/catalogo.json (catálogo enriquecido) a partir da importação recebida em 17/11/2026.
// Uso: node scripts/gerar-catalogo.mjs
// Regras: preços vêm SOMENTE da importação (centavos). Este script só acrescenta atributos
// (proteína, suíno, osso, preparo, composição dos kits copiada do index.html) e parâmetros.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const importado = JSON.parse(readFileSync(join(raiz, 'dados/importado/catalogo-2026-11-17.json'), 'utf8'));

const N = 'nao'; const S = 'sim'; const D = 'desconhecido';

// id: [proteina, contem_suino, osso, preparos]
const ATRIB = {
  'BP-001': ['bovino', N, N, ['churrasco', 'grelha']],
  'BP-002': ['bovino', N, N, ['churrasco', 'grelha']],
  'BP-003': ['bovino', N, N, ['churrasco', 'grelha']],
  'BP-004': ['bovino', N, N, ['churrasco', 'bife', 'grelha']],
  'BP-005': ['bovino', N, N, ['churrasco', 'bife', 'grelha']],
  'BP-006': ['bovino', N, N, ['churrasco', 'bife', 'grelha']],
  'BP-007': ['bovino', N, N, ['churrasco', 'assado']],
  'BP-008': ['bovino', N, N, ['churrasco', 'grelha']],
  'BP-009': ['bovino', N, S, ['churrasco']],
  'BP-010': ['bovino', N, S, ['churrasco', 'panela']],
  'BP-011': ['bovino', N, N, ['churrasco', 'assado']],
  'BP-012': ['bovino', N, N, ['bife', 'panela', 'moida']],
  'BP-013': ['bovino', N, N, ['bife', 'panela']],
  'BP-014': ['bovino', N, N, ['panela']],
  'BP-015': ['bovino', N, N, ['assado', 'panela']],
  'BP-016': ['bovino', N, N, ['panela']],
  'BP-017': ['bovino', N, N, ['panela']],
  'BP-018': ['bovino', N, N, ['panela']],
  'BP-019': ['bovino', N, S, ['panela']],
  'BP-020': ['bovino', N, N, ['moida', 'panela']],
  'BP-021': ['frango', N, N, ['bife', 'grelha', 'panela']],
  'BP-022': ['frango', N, N, ['bife', 'grelha']],
  'BP-023': ['frango', N, S, ['assado', 'panela']],
  'BP-024': ['frango', N, S, ['churrasco', 'assado', 'panela']],
  'BP-025': ['frango', N, N, ['churrasco', 'grelha', 'panela']],
  'BP-026': ['frango', N, S, ['churrasco', 'assado']],
  'BP-027': ['frango', N, S, ['churrasco', 'assado']],
  'BP-028': ['frango', N, S, ['churrasco', 'assado']],
  'BP-029': ['frango', N, S, ['assado', 'panela']],
  'BP-030': ['frango', N, S, ['frito', 'assado']],
  'BP-031': ['frango', N, S, ['panela']],
  'BP-032': ['frango', N, N, ['churrasco']],
  'BP-033': ['frango', N, N, ['panela']],
  'BP-034': ['frango', N, N, ['panela']],
  'BP-035': ['frango', N, S, ['panela']],
  'BP-036': ['suino', S, N, ['churrasco', 'grelha']],
  'BP-037': ['suino', S, N, ['grelha', 'assado']],
  'BP-038': ['suino', S, N, ['bife', 'assado']],
  'BP-039': ['suino', S, N, ['churrasco', 'assado']],
  'BP-040': ['suino', S, S, ['bife', 'grelha']],
  'BP-041': ['suino', S, S, ['churrasco', 'assado']],
  'BP-042': ['suino', S, N, ['churrasco']],
  'BP-043': ['suino', S, N, ['churrasco', 'assado']],
  'BP-044': ['suino', S, S, ['assado']],
  'BP-045': ['suino', S, N, ['assado', 'panela']],
  'BP-046': ['suino', S, D, ['assado', 'panela']],
  'BP-047': ['suino', S, S, ['panela']],
  'BP-048': ['suino', S, N, ['panela']],
  'BP-049': ['suino', S, S, ['panela']],
  'BP-050': ['suino', S, N, ['panela']],
  'BP-051': ['suino', S, S, ['panela']],
  'BP-052': ['cordeiro', N, S, ['churrasco', 'grelha']],
  'BP-053': ['cordeiro', N, D, ['assado']],
  'BP-054': ['cordeiro', N, D, ['assado']],
  'BP-055': ['cordeiro', N, S, ['churrasco', 'assado']],
  'BP-056': ['bufalo', N, N, ['churrasco', 'grelha']],
  'BP-057': ['exotico', N, N, ['grelha']],
  'BP-058': ['exotico', N, S, ['assado', 'panela']],
  'BP-059': ['ave_especial', N, S, ['assado']],
  'BP-060': ['bovino', N, N, ['bife', 'panela']],
  'BP-061': ['bovino', N, N, ['panela']],
  'BP-062': ['bovino', N, N, ['panela']],
  'BP-063': ['bovino', N, S, ['panela']],
  'BP-064': ['bovino', N, S, ['panela']],
  'BP-065': ['bovino', N, N, ['churrasco', 'panela']],
  'BP-066': ['bovino', N, N, ['panela']],
  'BP-067': ['bovino', N, N, ['panela']],
  'BP-068': ['bovino', N, N, ['panela']],
  'BP-069': ['bovino', N, N, ['frito', 'panela']],
  'BP-070': ['caprino', D, D, ['panela']],
  'BP-071': ['suino', S, N, ['frito']],
  'BP-072': ['bovino', N, N, ['frito']]
};
// Buchada é preparação com ingredientes não informados.
const INGREDIENTES_DESCONHECIDOS = new Set(['BP-070']);

// Composição dos kits COPIADA do index.html (campanha novembro/2026). Não há composição no PDF.
// c(nome, gramas|null, {produto, proteina, suino, osso, carne, unidades})
const c = (nome, gramas, o = {}) => ({
  nome, gramas, unidades: o.unidades ?? null, produto_id: o.produto ?? null,
  proteina: o.proteina ?? 'desconhecida', contem_suino: o.suino ?? D, osso: o.osso ?? D,
  conta_como_carne: o.carne ?? true
});
const bov = (nome, g, osso = N, produto) => c(nome, g, { proteina: 'bovino', suino: N, osso, produto });
const fra = (nome, g, osso = N, produto) => c(nome, g, { proteina: 'frango', suino: N, osso, produto });
const sui = (nome, g, osso = N, produto) => c(nome, g, { proteina: 'suino', suino: S, osso, produto });
const emb = (nome, g, o = {}) => c(nome, g, { proteina: 'embutido_ou_preparado', suino: D, osso: N, ...o });
const paoDeAlho = () => c('pão de alho', null, { unidades: 1, proteina: 'complemento', suino: D, osso: N, carne: false });

const churrascoBase = (principal) => [
  emb('linguiça toscana', 400), fra('coxinha da asa', 400, S, 'BP-026'), sui('panceta', 400, N, 'BP-042'),
  principal, emb('kafta gourmet', 400), paoDeAlho()
];

const KITS = {
  'BP-073': { nome_site: 'Kit Picanha', aliases: [], ancora: 'kit-picanha', linha: 'churrasco', total_declarado_g: 2400,
    componentes: churrascoBase(bov('picanha premium', 800, N, 'BP-001')) },
  'BP-074': { nome_site: 'Kit Chorizo', aliases: [], ancora: 'kit-chorizo', linha: 'churrasco', total_declarado_g: 2400,
    componentes: churrascoBase(bov('chorizo premium', 800, N, 'BP-002')) },
  'BP-075': { nome_site: 'Kit Fraldinha', aliases: [], ancora: 'kit-fraldinha', linha: 'churrasco', total_declarado_g: 2400,
    componentes: churrascoBase(bov('fraldinha premium', 800, N, 'BP-008')) },
  'BP-076': { nome_site: 'Kit Família', aliases: [], ancora: 'kit-familia', linha: 'casa', total_declarado_g: 6500, componentes: [
    bov('ponta de alcatra em iscas', 500), emb('salsicha', 500), fra('frango a passarinho', 500, S, 'BP-030'),
    sui('bife de pernil suíno', 500), bov('contrafilé em bifes', 500, N, 'BP-004'), sui('lombo suíno em iscas', 500),
    fra('filé de coxa', 500), emb('linguiça', 500), fra('coxinha da asa', 500, S, 'BP-026'), sui('bisteca de porco', 500, S, 'BP-040'),
    fra('filé de frango em bifes', 500), sui('pernil em cubos sem osso', 500, N, 'BP-045'), bov('patinho moído', 500),
    emb('calabresa', null, { unidades: 1 })] },
  'BP-077': { nome_site: 'Kit Fitness', aliases: [], ancora: 'kit-fitness', linha: 'casa', total_declarado_g: 4500, componentes: [
    bov('patinho moído', 500), bov('patinho em iscas', 500), sui('lombo em bistecas', 500, S), sui('filé de pernil em bifes', 500),
    sui('lombo suíno em cubos', 500), fra('sobrecoxa', 500, D), fra('filé de frango em bifes', 500), fra('coxa e sobrecoxa', 1000, S, 'BP-024')] },
  'BP-078': { nome_site: 'Kit Casal', aliases: [], ancora: 'kit-casal', linha: 'casa', total_declarado_g: 3500, componentes: [
    bov('patinho em iscas', 1000), fra('frango a passarinho', 1000, S, 'BP-030'), fra('filé de frango', 500),
    sui('pernil picado', 500, D), emb('salsicha', 500)] },
  'BP-079': { nome_site: 'Kit Feijoada Gourmet Premium', aliases: ['Kit Feijoada'], ancora: 'kit-feijoada', linha: 'casa', total_declarado_g: 2700, componentes: [
    emb('paio', 300), sui('bacon', 300), sui('toucinho', 300), emb('calabresa', 300), sui('costelinha', 300, S),
    bov('carne seca', 300), c('pé', 300), c('orelha', 300), c('rabo', 300)] },
  'BP-080': { nome_site: 'Kit Tacho Gourmet', aliases: ['Kit Tacho'], ancora: 'kit-tacho', linha: 'casa', total_declarado_g: 2700, componentes: [
    bov('iscas de fraldinha', 300), fra('iscas de filé de frango', 300), fra('iscas de filé de coxa', 300), sui('bacon cortado', 300),
    emb('calabresa fatiada', 300), emb('linguiça', 300), sui('iscas de pernil', 300), bov('iscas de miolo de acém', 300), sui('iscas de panceta', 300)] },
  'BP-081': { nome_site: 'Kit Compra do Mês', aliases: ['Kit do Mês', 'Compra do Mês'], ancora: 'kit-compra-do-mes', linha: 'casa', total_declarado_g: 9300, componentes: [
    bov('coxão mole em iscas', 500), fra('asa completa', 500, S, 'BP-028'), bov('patinho moído', 500), fra('frango a passarinho', 500, S, 'BP-030'),
    fra('coxa e sobrecoxa', 500, S, 'BP-024'), bov('contrafilé em bifes', 500, N, 'BP-004'), sui('pernil em cubos', 500), sui('lombo suíno em iscas', 500),
    sui('bisteca suína', 500, S, 'BP-040'), bov('costela para panela', 500, S), fra('filé de frango em bifes', 500), fra('filé de frango para estrogonofe', 500),
    emb('hambúrguer', 500), sui('bife de lombo suíno', 500), bov('fígado bovino', 500, N, 'BP-060'), sui('bacon', 300),
    emb('calabresa', null, { unidades: 1 }), c('batata palito', 500, { proteina: 'nao_carne', suino: N, osso: N, carne: false }),
    emb('salsicha', 500), fra('filé de coxa', 500)] }
};

function resumoKit(k) {
  const comp = k.componentes;
  const somaG = comp.reduce((s, x) => s + (x.gramas || 0), 0);
  const carneSemOsso = comp.filter(x => x.conta_como_carne && x.osso === N && x.gramas).reduce((s, x) => s + x.gramas, 0);
  const carneComOsso = comp.filter(x => x.conta_como_carne && x.osso !== N && x.gramas).reduce((s, x) => s + x.gramas, 0);
  const semPeso = comp.filter(x => x.gramas == null && x.conta_como_carne).map(x => `${x.unidades} un. ${x.nome}`);
  const suino = comp.some(x => x.contem_suino === S) ? S : comp.some(x => x.contem_suino === D) ? D : N;
  const pao = comp.filter(x => x.nome === 'pão de alho').reduce((s, x) => s + (x.unidades || 0), 0);
  return {
    soma_componentes_g: somaG,
    confere_com_total_declarado: somaG === k.total_declarado_g,
    carne_sem_osso_g: carneSemOsso,
    carne_com_osso_ou_indefinido_g: carneComOsso,
    itens_sem_peso: semPeso,
    contem_suino: suino,
    pao_de_alho_incluso_pct: pao
  };
}

const produtos = importado.produtos.map(p => {
  const base = { ...p };
  if (p.categoria === 'kits') {
    const k = KITS[p.id];
    if (!k) throw new Error('Kit sem composição: ' + p.id);
    const r = resumoKit(k);
    if (!r.confere_com_total_declarado) throw new Error(`Soma da composição de ${p.id} (${r.soma_componentes_g} g) difere do total do site`);
    return {
      ...base,
      nome_site: k.nome_site, aliases: k.aliases, ancora_site: k.ancora, linha: k.linha,
      proteina: 'kit_misto', contem_suino: r.contem_suino, osso: 'parcial', ingredientes_conhecidos: false,
      preparo: k.linha === 'churrasco' ? ['churrasco'] : ['casa'],
      composicao_status: 'importada_do_site_validada',
      composicao_origem: 'index.html (campanha novembro/2026), conferida em 17/11/2026',
      composicao: k.componentes, total_declarado_g: k.total_declarado_g, ...r,
      incremento: 1, minimo: 1,
      trocas_permitidas: false,
      disponibilidade: { status: 'nao_integrado', origem: null, data: null },
      validade_oferta: null
    };
  }
  const a = ATRIB[p.id];
  if (!a) throw new Error('Sem atributos: ' + p.id);
  return {
    ...base,
    proteina: a[0], contem_suino: a[1], osso: a[2], preparo: a[3],
    miudo: p.categoria === 'miudos',
    ingredientes_conhecidos: !INGREDIENTES_DESCONHECIDOS.has(p.id),
    rendimento_sem_osso: null,
    incremento_g: 100, minimo_g: 300,
    disponibilidade: { status: 'nao_integrado', origem: null, data: null },
    validade_oferta: null
  };
});

// Item vendido no site atual que NÃO consta na tabela importada (auditoria: manter preço do site).
const extrasSite = [{
  id: 'SITE-001', nome: 'Hambúrguer Gourmet de Fraldinha', nome_site: 'Hambúrguer Gourmet de Fraldinha', ancora_site: 'hamburguer',
  categoria: 'preparados_site', unidade: 'kg', preco_centavos: 5990, moeda: 'BRL', estoque: 'nao_integrado', ativo: true,
  origem: 'site_atual_index_html', proteina: 'embutido_ou_preparado', contem_suino: D, osso: N, preparo: ['grelha', 'chapa'],
  miudo: false, ingredientes_conhecidos: false, rendimento_sem_osso: null, incremento_g: 100, minimo_g: 300,
  disponibilidade: { status: 'nao_integrado', origem: null, data: null }, validade_oferta: null
}];

const saida = {
  fonte: importado.fonte,
  data_base_pdf: importado.data_base_pdf,
  data_confirmacao_parcial: importado.data_confirmacao_parcial,
  precos_confirmados_proprietario: { 'BP-075': 12990, 'BP-070': 7990 },
  gerado_por: 'scripts/gerar-catalogo.mjs',
  observacao: 'Preços por kg (exceto kits). Estoque não integrado: tudo sujeito à confirmação da equipe. Não há carvão nem pão de alho avulsos cadastrados.',
  parametros: {
    churrasco: { adulto_g: 400, crianca_g: 200, fator_apetite: { leve: 0.85, normal: 1, alto: 1.2 }, fator_sem_acompanhamentos: 1.15, fator_longa_duracao: 1.1, longa_duracao_horas: 5 },
    semana: { adulto_refeicao_g: 150, crianca_refeicao_g: 75 },
    incremento_padrao_g: 100,
    minimo_por_item_g: 300,
    whatsapp: '5519993497099',
    atendimento: '08h às 19h'
  },
  produtos,
  extras_site: extrasSite
};

writeFileSync(join(raiz, 'dados/catalogo.json'), JSON.stringify(saida, null, 1) + '\n');
console.log(`OK: ${produtos.length} produtos + ${extrasSite.length} extra(s) do site → dados/catalogo.json`);
