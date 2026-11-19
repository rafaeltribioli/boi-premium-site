// Ferramentas restritas expostas ao modelo. Nenhuma delas aceita preço, desconto, URL ou comando.
// Tudo é validado e calculado pelo motor determinístico com o catálogo do servidor.
import {
  PROTEINAS, buscarProdutos, resumoProduto, estimarQuantidade, cotarLista, proporOpcoes,
  montarProposta, complementos, normalizarRestricoes
} from '../assistente/motor.js';

const RESTRICOES_SCHEMA = {
  type: 'object',
  description: 'Exclusões e preferências do cliente.',
  properties: {
    excluir_proteinas: { type: 'array', items: { type: 'string', enum: PROTEINAS }, description: 'Ex.: ["suino"] para "sem porco".' },
    somente_proteinas: { type: 'array', items: { type: 'string', enum: PROTEINAS }, description: 'Ex.: ["bovino"] para "quero só boi".' },
    evitar_produto_ids: { type: 'array', items: { type: 'string' }, description: 'IDs que o cliente pediu para tirar.' },
    preferir_produto_ids: { type: 'array', items: { type: 'string' }, description: 'IDs que o cliente pediu para incluir (cortes por kg sem osso).' }
  },
  additionalProperties: false
};

export const DEFINICOES = [
  {
    name: 'buscar_produtos',
    description: 'Busca produtos ativos no catálogo da Boi Premium. Retorna id, nome, unidade, preço do catálogo, proteína, osso, se contém suíno e se está bloqueado pelas restrições.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Parte do nome (ex.: "picanha", "kit").' },
        categoria: { type: 'string', enum: ['bovinos', 'aves', 'suinos', 'especiais', 'miudos', 'kits', 'preparados_site'] },
        preparo: { type: 'string', enum: ['churrasco', 'grelha', 'bife', 'panela', 'assado', 'moida', 'frito', 'chapa', 'casa'] },
        restricoes: RESTRICOES_SCHEMA
      },
      additionalProperties: false
    }
  },
  {
    name: 'obter_produto',
    description: 'Detalhes de até 10 produtos por id, incluindo composição validada dos kits.',
    input_schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' }, maxItems: 10 } }, required: ['ids'], additionalProperties: false }
  },
  {
    name: 'estimar_quantidade',
    description: 'Calcula a estimativa de carne crua sem osso. Churrasco: adulto 400 g, criança 200 g (com acompanhamentos), ajustes por apetite/duração/acompanhamentos. Semana: 150 g por adulto por refeição.',
    input_schema: {
      type: 'object',
      properties: {
        fluxo: { type: 'string', enum: ['churrasco', 'semana'] },
        adultos: { type: 'integer', minimum: 0, maximum: 500 },
        criancas: { type: 'integer', minimum: 0, maximum: 500 },
        refeicoes: { type: 'integer', minimum: 0, maximum: 60, description: 'Somente semana: refeições com carne.' },
        apetite: { type: 'string', enum: ['leve', 'normal', 'alto'] },
        acompanhamentos: { type: 'boolean', description: 'false se houver poucos acompanhamentos.' },
        duracao_horas: { type: 'number', minimum: 0, maximum: 24 },
        idade_criancas_informada: { type: 'boolean' }
      },
      required: ['fluxo'],
      additionalProperties: false
    }
  },
  {
    name: 'propor_opcoes',
    description: 'Monta até duas propostas validadas ("Melhor custo-benefício" e "Seleção premium") a partir do peso alvo e/ou orçamento, respeitando restrições. Se não couber, explica o limite.',
    input_schema: {
      type: 'object',
      properties: {
        fluxo: { type: 'string', enum: ['churrasco', 'semana'] },
        alvo_gramas: { type: 'integer', minimum: 300, maximum: 100000, description: 'Resultado de estimar_quantidade. Omitir no fluxo orçamento sem pessoas.' },
        orcamento_reais: { type: 'number', minimum: 1, maximum: 50000 },
        restricoes: RESTRICOES_SCHEMA,
        premissas: { type: 'array', items: { type: 'string' }, maxItems: 6 }
      },
      required: ['fluxo'],
      additionalProperties: false
    }
  },
  {
    name: 'cotar_lista',
    description: 'Cota uma lista específica (trocas, pedidos do cliente, kits). Quantidades: gramas para produtos por kg (arredondadas a 100 g), número inteiro para kits. Retorna proposta validada com id.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', maxLength: 60 },
        itens: {
          type: 'array', maxItems: 15,
          items: {
            type: 'object',
            properties: { produto_id: { type: 'string' }, gramas: { type: 'integer', minimum: 1, maximum: 60000 }, kits: { type: 'integer', minimum: 1, maximum: 20 } },
            required: ['produto_id'], additionalProperties: false
          }
        },
        orcamento_reais: { type: 'number', minimum: 1, maximum: 50000 },
        restricoes: RESTRICOES_SCHEMA,
        premissas: { type: 'array', items: { type: 'string' }, maxItems: 6 }
      },
      required: ['itens'],
      additionalProperties: false
    }
  },
  {
    name: 'consultar_complementos',
    description: 'Verifica complementos cadastrados (carvão, pão de alho) e se a proposta já inclui pão de alho.',
    input_schema: { type: 'object', properties: { proposta_id: { type: 'string' } }, additionalProperties: false }
  },
  {
    name: 'preparar_lista',
    description: 'Seleciona quais propostas validadas (ids) a tela deve mostrar com o botão "Adicionar à minha lista". O cliente é quem clica para adicionar.',
    input_schema: { type: 'object', properties: { proposta_ids: { type: 'array', items: { type: 'string' }, maxItems: 2 } }, required: ['proposta_ids'], additionalProperties: false }
  },
  {
    name: 'responder',
    description: 'Finaliza o turno com a mensagem ao cliente. Use sempre no fim.',
    input_schema: {
      type: 'object',
      properties: {
        mensagem: { type: 'string', maxLength: 900 },
        pergunta: { type: 'string', maxLength: 200, description: 'No máximo uma pergunta sobre dado faltante.' },
        sugestoes_rapidas: { type: 'array', items: { type: 'string', maxLength: 40 }, maxItems: 4, description: 'Respostas curtas clicáveis (ex.: "Sem porco", "Até R$ 300").' },
        acoes: { type: 'array', items: { type: 'string', enum: ['adicionar', 'trocar', 'ajustar_orcamento', 'falar_equipe', 'revisar_whatsapp'] }, maxItems: 5 },
        solicitacoes_para_equipe: { type: 'array', items: { type: 'string', maxLength: 160 }, maxItems: 4, description: 'Pedidos que dependem da equipe (ex.: troca dentro de kit, alergia, carvão/pão avulso). Vão para a mensagem do WhatsApp como "a confirmar".' }
      },
      required: ['mensagem'],
      additionalProperties: false
    }
  }
];

const reaisParaCentavos = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null);
function restricoesDe(r) {
  r = r && typeof r === 'object' ? r : {};
  return normalizarRestricoes({
    excluirProteinas: r.excluir_proteinas, somenteProteinas: r.somente_proteinas,
    evitarIds: r.evitar_produto_ids, preferirIds: r.preferir_produto_ids
  });
}
const textos = (a, n) => (Array.isArray(a) ? a.filter(x => typeof x === 'string').slice(0, n).map(x => x.slice(0, 240)) : []);

// estado: { cat, propostas: Map, mostrar: string[]|null, final: null|{...}, restricoesBase }
export function executar(nome, entrada, estado) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const cat = estado.cat;
  const mesclar = r => {
    const base = estado.restricoesBase || {};
    const x = restricoesDe(r);
    return {
      excluirProteinas: [...new Set([...(base.excluirProteinas || []), ...x.excluirProteinas])],
      somenteProteinas: x.somenteProteinas.length ? x.somenteProteinas : (base.somenteProteinas || []),
      evitarIds: x.evitarIds, preferirIds: x.preferirIds
    };
  };
  switch (nome) {
    case 'buscar_produtos':
      return { produtos: buscarProdutos(cat, { texto: typeof e.texto === 'string' ? e.texto : '', categoria: e.categoria, preparo: e.preparo, restricoes: mesclar(e.restricoes) }) };
    case 'obter_produto': {
      const ids = Array.isArray(e.ids) ? e.ids.slice(0, 10) : [];
      return { produtos: ids.map(id => cat.porId.get(id)).filter(Boolean).map(p => resumoProduto(p)), nao_encontrados: ids.filter(id => !cat.porId.has(id)) };
    }
    case 'estimar_quantidade':
      return estimarQuantidade(cat, {
        fluxo: e.fluxo, adultos: e.adultos, criancas: e.criancas, refeicoes: e.refeicoes, apetite: e.apetite,
        acompanhamentos: e.acompanhamentos, duracaoHoras: e.duracao_horas, idadeCriancasInformada: e.idade_criancas_informada === true
      });
    case 'propor_opcoes': {
      estado.ultimasRestricoes = mesclar(e.restricoes);
      const r = proporOpcoes(cat, {
        fluxo: e.fluxo, alvoGramas: Number.isInteger(e.alvo_gramas) ? e.alvo_gramas : null,
        orcamentoCentavos: reaisParaCentavos(e.orcamento_reais), restricoes: mesclar(e.restricoes), premissas: textos(e.premissas, 6)
      });
      for (const p of r.propostas) { estado.propostas.set(p.id, p); estado.novas && estado.novas.push(p.id); }
      return resumoParaModelo(r);
    }
    case 'cotar_lista': {
      const itens = (Array.isArray(e.itens) ? e.itens : []).slice(0, 15).map(i => {
        const p = cat.porId.get(i && i.produto_id);
        if (p && p.unidade === 'kit') return { productId: i.produto_id, quantidade: Number.isInteger(i.kits) ? i.kits : 1, unidade: 'kit' };
        return { productId: i && i.produto_id, quantidade: Number.isInteger(i && i.gramas) ? i.gramas : 0, unidade: 'kg' };
      });
      const restr = mesclar(e.restricoes);
      estado.ultimasRestricoes = restr;
      const p = montarProposta(cat, {
        titulo: typeof e.titulo === 'string' && e.titulo.trim() ? e.titulo.trim().slice(0, 60) : 'Sua lista ajustada',
        itens, restricoes: restr, orcamentoCentavos: reaisParaCentavos(e.orcamento_reais), premissas: textos(e.premissas, 6)
      });
      if (!p.ok) return { erro: p.erros };
      if (p.restrictionViolations.length) return { erro: ['A lista viola as restrições do cliente; não pode ser oferecida.'], violacoes: p.restrictionViolations };
      if (!p.withinBudget) return { erro: ['A lista passa do orçamento; não pode ser apresentada como aprovada.'], totalCents: p.totalCents, budgetCents: p.budgetCents };
      estado.propostas.set(p.id, p); estado.novas && estado.novas.push(p.id);
      return resumoParaModelo({ propostas: [p], observacoes: [] });
    }
    case 'consultar_complementos': {
      const p = estado.propostas.get(e.proposta_id);
      return complementos(cat, p ? p.items.map(i => ({ productId: i.productId, quantidade: i.quantidade })) : []);
    }
    case 'preparar_lista': {
      const ids = (Array.isArray(e.proposta_ids) ? e.proposta_ids : []).filter(id => estado.propostas.has(id)).slice(0, 2);
      estado.mostrar = ids;
      return { ok: true, mostradas: ids, ignoradas: (e.proposta_ids || []).filter(id => !ids.includes(id)) };
    }
    case 'responder':
      estado.final = {
        mensagem: typeof e.mensagem === 'string' ? e.mensagem : '',
        pergunta: typeof e.pergunta === 'string' ? e.pergunta : '',
        sugestoes: textos(e.sugestoes_rapidas, 4).map(s => s.slice(0, 40)),
        solicitacoes: textos(e.solicitacoes_para_equipe, 4).map(t => t.slice(0, 160)),
        acoes: (Array.isArray(e.acoes) ? e.acoes : []).filter(a => ['adicionar', 'trocar', 'ajustar_orcamento', 'falar_equipe', 'revisar_whatsapp'].includes(a))
      };
      return { ok: true };
    default:
      return { erro: ['Ferramenta desconhecida.'] };
  }
}

function resumoParaModelo(r) {
  return {
    propostas: r.propostas.map(p => ({
      id: p.id, titulo: p.title,
      itens: p.items.map(i => `${i.unidade === 'kit' ? i.quantidade + ' kit(s)' : i.quantidade + ' g'} ${i.nome} = ${(i.subtotalCents / 100).toFixed(2)} reais`),
      total_reais: (p.totalCents / 100).toFixed(2), carne_sem_osso_g: p.meatWeightGrams, com_osso_g: p.boneInGrams,
      saldo_reais: p.budgetRemainingCents == null ? null : (p.budgetRemainingCents / 100).toFixed(2),
      premissas: p.assumptions, pendencias: p.pendingConfirmations
    })),
    observacoes: r.observacoes || [], inviavel: r.inviavel || null
  };
}
