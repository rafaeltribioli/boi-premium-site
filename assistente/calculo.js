/*
 * Boi Premium — cálculo e leitura de pedidos dos assistentes virtuais (Rafael e Kelly).
 * Tudo aqui é determinístico: a mesma entrada sempre dá o mesmo resultado.
 * Trabalha com gramas e centavos inteiros. Nenhum preço vem do cliente: sempre do catálogo.
 */
(function (root) {
  'use strict';

  // ---------- Regra fixa do churrasco ----------
  var REGRA = {
    gramasPorPessoa: 500,
    // papel "principal" recebe o que sobrar dos arredondamentos e a parte de itens retirados
    divisao: [
      { papel: 'principal', share: 0.5, nome: 'Fraldinha Premium', busca: 'fraldinha' },
      { papel: 'frango', share: 0.25, nome: 'Coxinha da asa', busca: 'coxinha da asa' },
      { papel: 'linguica', share: 0.25, nome: 'Linguiça', busca: 'linguica' }
    ],
    extras: [
      { id: 'pao-de-alho', nome: 'Pão de alho', busca: 'pao de alho', unidade: 'pacote' },
      { id: 'queijo-coalho', nome: 'Queijo coalho', busca: 'queijo coalho', unidade: 'pacote' }
    ]
  };

  // ---------- Texto ----------
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[—–-]/g, ' ').replace(/[^a-z0-9,.\/$ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  var STOP = { de: 1, da: 1, do: 1, das: 1, dos: 1, com: 1, e: 1, o: 1, a: 1, os: 1, as: 1, pra: 1, para: 1, em: 1, no: 1, na: 1, um: 1, uma: 1, meio: 0 };
  function singular(t) {
    if (t === 'paes') return 'pao';
    if (/oes$/.test(t)) return t.replace(/oes$/, 'ao');
    if (/[^s]s$/.test(t) && t.length > 3) return t.slice(0, -1);
    return t;
  }
  function tokens(s) {
    return norm(s).split(' ').filter(function (t) { return t && !STOP[t] && !/^\d/.test(t); }).map(singular);
  }
  var DISTINTIVOS = ['espetinho', 'espeto', 'moido', 'kit', 'temperado', 'pacote'];

  function pontuar(textoTokens, nomeProduto) {
    var pt = tokens(nomeProduto);
    if (!pt.length) return 0;
    var hit = 0;
    pt.forEach(function (t) { if (textoTokens.indexOf(t) >= 0) hit++; });
    if (!hit) return 0;
    var score = hit * 10 + hit / pt.length;
    DISTINTIVOS.forEach(function (d) {
      var naoTexto = textoTokens.indexOf(d) < 0, noProd = pt.indexOf(d) >= 0;
      if (noProd && naoTexto) score -= 15;
      if (!noProd && !naoTexto) score -= 15;
    });
    // o primeiro termo do produto pesa mais (ex.: "Tulipa — meio da asa")
    if (textoTokens.indexOf(pt[0]) >= 0) score += 2;
    return score;
  }

  /** Procura o produto mais parecido. produtos: [{id,nome,unidade,precoCentavos}] */
  function acharProduto(produtos, texto) {
    var tt = tokens(texto), melhor = null, mScore = 0;
    produtos.forEach(function (p) {
      var s = pontuar(tt, p.nome);
      if (s > mScore) { mScore = s; melhor = p; }
    });
    return mScore >= 10 ? melhor : null;
  }

  // ---------- Números ----------
  var NUM = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, quinze: 15, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100, cento: 100, duzentos: 200, trezentos: 300, quinhentos: 500, mil: 1000 };
  var NUM_RE = '(?:\\d+(?:[.,]\\d+)?|' + Object.keys(NUM).join('|') + ')';
  function numero(s) {
    s = norm(s);
    if (NUM[s] != null) return NUM[s];
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '');
    var n = Number(s.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  function trocarPalavrasPorNumeros(t) {
    // "vinte e cinco" -> 25 ; "meio quilo" -> 0,5 kg
    t = t.replace(/\bmeio (quilo|kg)\b/g, '0,5 kg');
    t = t.replace(/\b(vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa) e (um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove)\b/g,
      function (_, a, b) { return String(NUM[a] + NUM[b]); });
    t = t.replace(new RegExp('\\b(' + Object.keys(NUM).join('|') + ')\\b(?= ?(pessoa|convidad|adult|kg|quilo|kilo|grama|g\\b|pacote|unidade|un\\b|espet|[a-z]))', 'g'),
      function (m) { return String(NUM[m]); });
    return t;
  }

  // ---------- Dinheiro ----------
  function brl(centavos) {
    return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function kg(gramas) {
    var v = gramas / 1000;
    return v.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) + ' kg';
  }
  function subtotal(precoCentavosKg, gramas) {
    return Math.round(precoCentavosKg * gramas / 1000);
  }

  // ---------- Catálogos ----------
  function produtosAcougue(cat) {
    return (cat.produtos || []).filter(function (p) { return p.ativo !== false; }).map(function (p) {
      return { id: p.id, nome: p.nome, unidade: p.unidade, precoCentavos: p.preco_centavos, categoria: p.categoria };
    });
  }
  function produtosParceiro(lista) {
    return lista.map(function (p, i) {
      return { id: 'P' + i, idx: i, nome: p.n, unidade: p.u, precoCentavos: Math.round(p.v * 100), categoria: p.c };
    });
  }

  // ---------- Churrasco ----------
  /** Cria os "espaços" da sugestão a partir da regra (preservados ao mudar o nº de pessoas). */
  function slotsIniciais() {
    return REGRA.divisao.map(function (d) { return { papel: d.papel, share: d.share, nome: d.nome, busca: d.busca }; });
  }

  /**
   * Monta a sugestão. estado: {pessoas, slots, extras:{id:qtd}, orcamentoCentavos}
   * Retorna linhas de carne, extras (fora do peso), totais e pendências.
   */
  function montarChurrasco(estado, produtos) {
    var pessoas = Math.max(0, Math.floor(estado.pessoas || 0));
    var totalG = pessoas * REGRA.gramasPorPessoa;
    var slots = estado.slots;
    var linhas = [], soma = 0, iPrincipal = -1;
    slots.forEach(function (s, i) {
      if (s.papel === 'principal') iPrincipal = i;
      var g = s.papel === 'principal' ? 0 : Math.round(totalG * s.share);
      soma += g;
      linhas.push({ slot: i, papel: s.papel, gramas: g });
    });
    // principal recebe o restante (inclui parte de itens retirados e arredondamento)
    if (iPrincipal < 0 && linhas.length) iPrincipal = 0;
    if (iPrincipal >= 0) linhas[iPrincipal].gramas += totalG - soma;
    linhas.forEach(function (l) {
      var s = slots[l.slot];
      if (s.gramasManual != null) l.gramas = s.gramasManual;
      var p = acharProduto(produtos, s.busca || s.nome);
      l.nome = s.nome;
      l.produto = p;
      l.precoCentavos = p && p.unidade === 'kg' ? p.precoCentavos : null;
      l.subtotalCentavos = l.precoCentavos != null ? subtotal(l.precoCentavos, l.gramas) : null;
    });
    var extras = REGRA.extras.map(function (e) {
      var q = (estado.extras && estado.extras[e.id]) || 0;
      var p = acharProduto(produtos, e.busca);
      var preco = p && p.unidade === e.unidade ? p.precoCentavos : null;
      return { id: e.id, nome: e.nome, unidade: e.unidade, quantidade: q, precoCentavos: preco, subtotalCentavos: preco != null ? preco * q : null };
    });
    var carneG = linhas.reduce(function (a, l) { return a + l.gramas; }, 0);
    var cotado = 0, pendentes = [];
    linhas.forEach(function (l) { if (l.gramas > 0) { if (l.subtotalCentavos != null) cotado += l.subtotalCentavos; else pendentes.push(l.nome); } });
    extras.forEach(function (e) { if (e.quantidade > 0) { if (e.subtotalCentavos != null) cotado += e.subtotalCentavos; else pendentes.push(e.nome); } });
    var res = { pessoas: pessoas, totalEstimadoG: totalG, carneG: carneG, linhas: linhas, extras: extras, totalCotadoCentavos: cotado, pendentes: pendentes };
    if (estado.orcamentoCentavos) {
      res.orcamentoCentavos = estado.orcamentoCentavos;
      res.saldoCentavos = estado.orcamentoCentavos - cotado;
      // quantas pessoas cabem no orçamento (só com itens de preço conhecido)
      var porPessoa = 0;
      linhas.forEach(function (l) {
        if (l.precoCentavos != null && totalG > 0) porPessoa += l.precoCentavos * (l.gramas / pessoas) / 1000;
      });
      res.pessoasNoOrcamento = porPessoa > 0 ? Math.floor((estado.orcamentoCentavos - extrasConhecidos(extras)) / porPessoa) : null;
    }
    return res;
  }
  function extrasConhecidos(extras) { return extras.reduce(function (a, e) { return a + (e.subtotalCentavos || 0); }, 0); }

  /** Lê pedido do cliente do açougue: pessoas, orçamento, trocas, retiradas e extras. */
  function interpretarChurrasco(texto, produtos) {
    var t = trocarPalavrasPorNumeros(norm(texto));
    var r = {};
    var m = t.match(/(\d+)\s*(pessoas?|convidados?|adultos?|gente)/) || t.match(/\b(?:pra|para)\s+(\d+)\b(?!\s*(?:kg|quilo|reais|r\$|pacote|g\b))/);
    if (m) r.pessoas = Number(m[1]);
    var b = t.match(/r\$ ?(\d[\d.,]*)/) || t.match(/(\d[\d.,]*) ?(?:reais|conto|pila)/) || t.match(/(?:ate|orcamento de|gastar)\s+(\d[\d.,]*)/);
    if (b) { var v = numero(b[1]); if (v) r.orcamentoCentavos = Math.round(v * 100); }
    var tr = t.match(/(?:troca|trocar|muda|mudar|substitui|substituir)\s+(?:a |o |as |os )?(.+?)\s+(?:por|pela|pelo)\s+(.+)$/);
    if (tr) r.troca = { de: tr[1].trim(), para: tr[2].trim() };
    var sem = t.match(/\b(?:sem|tira|tirar|retira|nao quero)\s+(?:a |o |as |os )?([a-z ]+?)(?:$|,| e | mas )/);
    if (sem && !tr) r.retirar = sem[1].trim();
    REGRA.extras.forEach(function (e) {
      var re = new RegExp('(?:(\\d+)\\s*(?:pacotes?|un|unidades?)?\\s*(?:de\\s*)?)?(' + e.busca.split(' ').map(function (w) { return w + 's?'; }).join(' ').replace('paos?', 'pa(?:o|es)') + ')');
      var mm = t.match(re);
      if (mm) { r.extras = r.extras || {}; r.extras[e.id] = mm[1] ? Number(mm[1]) : 1; }
    });
    return r;
  }

  /** Aplica uma troca num slot: devolve true se trocou. */
  function aplicarTroca(slots, de, para, produtos) {
    var tt = tokens(de), alvo = -1, melhor = 0;
    slots.forEach(function (s, i) {
      var sc = Math.max(pontuar(tt, s.nome), s.busca ? pontuar(tt, s.busca) : 0);
      if (sc > melhor) { melhor = sc; alvo = i; }
    });
    if (alvo < 0) return { ok: false, motivo: 'nao_achei_item' };
    var p = acharProduto(produtos, para);
    var novoNome = p ? p.nome : capitalizar(para);
    var anterior = slots[alvo].nome;
    slots[alvo] = { papel: slots[alvo].papel, share: slots[alvo].share, nome: novoNome, busca: p ? p.nome : para };
    return { ok: true, de: anterior, para: novoNome, semPreco: !p };
  }
  function retirarSlot(slots, texto) {
    var tt = tokens(texto), alvo = -1, melhor = 0;
    slots.forEach(function (s, i) {
      var sc = Math.max(pontuar(tt, s.nome), s.busca ? pontuar(tt, s.busca) : 0);
      if (sc > melhor) { melhor = sc; alvo = i; }
    });
    if (alvo < 0 || slots[alvo].papel === 'principal') return null;
    return slots.splice(alvo, 1)[0];
  }
  function capitalizar(s) { s = String(s).trim(); return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---------- Datas ----------
  var DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
  function fmtData(d) {
    var dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0');
    var nomes = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    return nomes[d.getDay()] + ', ' + dd + '/' + mm + '/' + d.getFullYear();
  }
  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  /** Acha a data no texto e devolve {data, iso, rotulo, resto} (resto = texto sem a data). */
  function extrairData(texto, hoje) {
    var t = norm(texto), base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()), d = null, m;
    var pre = '(?:(?:pra|para|na|no|ate|entrega|entregar|dia)\\s+)*';
    var re;
    if ((m = t.match(re = new RegExp(pre + 'depois de amanha')))) d = new Date(base.getTime() + 2 * 864e5);
    else if ((m = t.match(re = new RegExp(pre + 'amanha')))) d = new Date(base.getTime() + 864e5);
    else if ((m = t.match(re = new RegExp(pre + '\\bhoje\\b')))) d = base;
    else if ((m = t.match(re = new RegExp(pre + '(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?')))) {
      var y = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : base.getFullYear();
      d = new Date(y, Number(m[2]) - 1, Number(m[1]));
      if (!m[3] && d < base) d.setFullYear(y + 1);
    } else if ((m = t.match(re = new RegExp(pre + 'dia (\\d{1,2})\\b')))) {
      d = new Date(base.getFullYear(), base.getMonth(), Number(m[1]));
      if (d < base) d = new Date(base.getFullYear(), base.getMonth() + 1, Number(m[1]));
    } else {
      re = new RegExp(pre + '(?:proxima |proximo )?(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?: feira)?');
      if ((m = t.match(re))) {
        var alvo = DIAS.indexOf(m[1]);
        var delta = (alvo - base.getDay() + 7) % 7;
        d = new Date(base.getTime() + delta * 864e5);
      }
    }
    if (!d || isNaN(d)) return { data: null, resto: t };
    return { data: d, iso: iso(d), rotulo: fmtData(d), resto: t.replace(m[0], ' ').replace(/\s+/g, ' ').trim() };
  }

  // ---------- Lista do parceiro (Kelly) ----------
  var UNID_RE = '(kg|quilos?|kilos?|g|gramas?|pacotes?|pct|unidades?|un|pecas?|caixas?)(?![a-z])';
  function lerItem(trecho, produtos) {
    var t = trecho.trim().replace(/^(?:e|mais|tambem|quero|preciso de|manda|me ve|me manda)\s+/, '');
    var m = t.match(new RegExp('^(' + NUM_RE + ')\\s*' + '(?:' + UNID_RE + ')?\\s*(?:de |do |da )?(.+)$'));
    var qtd = null, unidDita = null, nomeDito = t;
    if (m) { qtd = numero(m[1]); unidDita = m[2] || null; nomeDito = m[3]; }
    else {
      var m2 = t.match(new RegExp('^(.+?)\\s+(' + NUM_RE + ')\\s*' + '(?:' + UNID_RE + ')?$'));
      if (m2) { nomeDito = m2[1]; qtd = numero(m2[2]); unidDita = m2[3] || null; }
    }
    nomeDito = nomeDito.trim();
    if (!nomeDito || tokens(nomeDito).length === 0) return null;
    var p = acharProduto(produtos, nomeDito);
    var it = montarItem({ dito: nomeDito, quantidadeDita: qtd, unidadeDita: unidDita }, p);
    if (p) {
      var pt = tokens(p.nome);
      var sobra = tokens(nomeDito).filter(function (x) { return pt.indexOf(x) < 0; });
      if (sobra.length) it.conferir = true; // entendeu só parte do nome: pedir conferência
    }
    return it;
  }
  function tipoUnidade(u) {
    if (!u) return null;
    if (/^(kg|quilo|kilo)/.test(u)) return 'kg';
    if (/^(g|grama)/.test(u)) return 'g';
    if (/^(pacote|pct)/.test(u)) return 'pacote';
    return 'un';
  }
  function montarItem(base, p) {
    var it = { dito: base.dito, quantidadeDita: base.quantidadeDita, unidadeDita: base.unidadeDita, produto: p || null };
    var tu = tipoUnidade(base.unidadeDita), q = base.quantidadeDita;
    it.status = 'ok';
    if (!p) { it.status = 'sem_cadastro'; it.quantidade = q; it.unidade = tu === 'g' ? 'kg' : (tu || 'un'); if (tu === 'g') it.quantidade = q / 1000; }
    else if (q == null) { it.status = 'sem_quantidade'; it.unidade = p.unidade; }
    else if (p.unidade === 'kg') {
      if (tu === 'kg') { it.quantidade = q; it.unidade = 'kg'; }
      else if (tu === 'g') { it.quantidade = q / 1000; it.unidade = 'kg'; }
      else { it.quantidade = q; it.unidade = 'un'; it.status = 'peso_a_confirmar'; }
    } else {
      // pacote / unidade: quantidade inteira
      it.unidade = p.unidade;
      it.quantidade = q;
      if (tu === 'kg' || tu === 'g') it.status = 'unidade_diferente';
      else if (!Number.isInteger(q)) it.status = 'quantidade_invalida';
    }
    if (it.status === 'ok' && p) {
      it.precoCentavos = p.precoCentavos;
      it.subtotalCentavos = p.unidade === 'kg' ? subtotal(p.precoCentavos, Math.round(it.quantidade * 1000)) : p.precoCentavos * it.quantidade;
    } else { it.precoCentavos = p ? p.precoCentavos : null; it.subtotalCentavos = null; }
    return it;
  }
  function dividirLista(t) {
    var sep = new RegExp('\\s*(?:[,;\\n]|\\s(?:e|mais)\\s(?=' + NUM_RE + '\\b))\\s*');
    return t.split(sep).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function totais(cot) {
    var c = 0, pend = 0;
    cot.itens.forEach(function (i) { if (i.subtotalCentavos != null) c += i.subtotalCentavos; else pend++; });
    cot.totalCotadoCentavos = c; cot.pendentes = pend;
    return cot;
  }

  /**
   * Kelly: interpreta uma fala/mensagem e atualiza a cotação.
   * cotacao: {itens:[], data:{iso,rotulo}|null}. Devolve {cotacao, acao, detalhes}.
   */
  function kellyProcessar(texto, cotacao, produtos, hoje) {
    cotacao = cotacao ? JSON.parse(JSON.stringify(cotacao)) : { itens: [], data: null };
    var dt = extrairData(texto, hoje || new Date());
    var t = trocarPalavrasPorNumeros(dt.resto);
    if (dt.data) cotacao.data = { iso: dt.iso, rotulo: dt.rotulo };

    // dimensionar churrasco: "churrasco pra 20 pessoas"
    var pc = t.match(/(\d+)\s*(pessoas?|convidados?)/);
    if (pc && /churrasco|pessoas|convidad/.test(t) && !/\d+\s*(kg|quilo|espet|pacote|un)/.test(t.replace(pc[0], ''))) {
      var est = montarChurrasco({ pessoas: Number(pc[1]), slots: slotsIniciais(), extras: {} }, produtos);
      est.linhas.forEach(function (l) {
        if (!l.gramas) return;
        var it = montarItem({ dito: l.nome, quantidadeDita: l.gramas / 1000, unidadeDita: 'kg' }, l.produto);
        substituirOuAdicionar(cotacao, it);
      });
      return { cotacao: totais(cotacao), acao: 'churrasco', pessoas: Number(pc[1]), carneG: est.carneG };
    }

    // retirar item: "tira a linguiça"
    var rm = t.match(/^(?:tira|tirar|retira|remove|remover|cancela|sem)\s+(?:a |o |as |os )?(.+)$/);
    if (rm && cotacao.itens.length) {
      var ix = acharNaCotacao(cotacao, rm[1]);
      if (ix >= 0) { var fora = cotacao.itens.splice(ix, 1)[0]; return { cotacao: totais(cotacao), acao: 'removeu', item: fora }; }
      return { cotacao: totais(cotacao), acao: 'nao_achei', termo: rm[1] };
    }

    // troca de produto mantendo a quantidade: "troca a fraldinha por picanha"
    var tp = t.match(/^(?:troca|trocar|substitui|substituir)\s+(?:a |o |as |os )?([a-z].*?)\s+(?:por|pela|pelo)\s+([a-z].*)$/);
    if (tp && cotacao.itens.length) {
      var it0 = acharNaCotacao(cotacao, tp[1]);
      if (it0 < 0) return { cotacao: totais(cotacao), acao: 'nao_achei', termo: tp[1] };
      var velho = cotacao.itens[it0], pNovo = acharProduto(produtos, tp[2]);
      var trocado = montarItem({ dito: tp[2], quantidadeDita: velho.quantidadeDita, unidadeDita: velho.unidadeDita }, pNovo);
      cotacao.itens[it0] = trocado;
      return { cotacao: totais(cotacao), acao: 'trocou', de: velho, para: trocado };
    }

    // alteração pontual: "muda pra 40 tulipas", "muda a tulipa pra 40", "coloca 3 kg de fraldinha"
    var alt = t.match(/^(?:muda|mude|mudar|altera|alterar|corrige|coloca|coloque|poe|ponha|faz|faca|deixa|aumenta|diminui|troca|trocar)\s+(?:a |o |as |os )?(?:quantidade\s+)?(?:(?:de|da|do)\s+)?(?:(?:pra|para)\s+)?(.+)$/);
    var corpo = alt ? alt[1] : t;
    var mais = /^(?:mais|adiciona|acrescenta|inclui|bota mais)\b/.test(t);
    var trechos = dividirLista(corpo.replace(/^(?:mais|adiciona|acrescenta|inclui|bota)\s+(?:mais\s+)?/, ''));
    var mudou = [], novos = [], semEntender = [];
    trechos.forEach(function (tr) {
      var it = lerItem(tr.replace(/\b(?:pra|para)\b/g, ' ').replace(/\s+/g, ' '), produtos);
      if (!it) { if (tr.length > 2) semEntender.push(tr); return; }
      var ix = -1;
      if (it.produto) ix = cotacao.itens.findIndex(function (x) { return x.produto && x.produto.id === it.produto.id; });
      if (ix < 0 && !it.produto && (alt || mais)) ix = acharNaCotacao(cotacao, it.dito);
      if (ix >= 0) {
        var antigo = cotacao.itens[ix];
        if (it.quantidadeDita == null) { semEntender.push(tr); return; }
        var q = it.quantidadeDita, u = it.unidadeDita || antigo.unidadeDita;
        if (mais && antigo.quantidade != null && it.quantidade != null && it.unidade === antigo.unidade) {
          q = antigo.quantidade + it.quantidade;
          u = antigo.unidade === 'kg' ? 'kg' : antigo.unidadeDita;
        }
        var novo = montarItem({ dito: antigo.dito, quantidadeDita: q, unidadeDita: u }, antigo.produto);
        cotacao.itens[ix] = novo;
        mudou.push({ de: antigo, para: novo });
      } else {
        cotacao.itens.push(it);
        novos.push(it);
      }
    });
    if (!mudou.length && !novos.length && !dt.data) return { cotacao: totais(cotacao), acao: 'nao_entendi', trechos: semEntender };
    return { cotacao: totais(cotacao), acao: mudou.length && !novos.length ? 'alterou' : 'adicionou', mudou: mudou, novos: novos, semEntender: semEntender, soData: !mudou.length && !novos.length };
  }
  function substituirOuAdicionar(cot, it) {
    var ix = it.produto ? cot.itens.findIndex(function (x) { return x.produto && x.produto.id === it.produto.id; }) : -1;
    if (ix >= 0) cot.itens[ix] = it; else cot.itens.push(it);
  }
  function acharNaCotacao(cot, texto) {
    var tt = tokens(texto), ix = -1, melhor = 0;
    cot.itens.forEach(function (x, i) {
      var s = Math.max(pontuar(tt, x.produto ? x.produto.nome : x.dito), pontuar(tt, x.dito));
      if (s > melhor) { melhor = s; ix = i; }
    });
    return melhor >= 10 ? ix : -1;
  }

  /** Muda a quantidade de um item da cotação (edição direta na lista), mantendo produto e unidade. */
  function definirQuantidade(cot, i, q) {
    cot = JSON.parse(JSON.stringify(cot));
    var it = cot.itens[i];
    if (!it || !(q > 0)) return totais(cot);
    var u = it.unidade === 'kg' ? 'kg' : it.unidade === 'pacote' ? 'pacote' : it.unidadeDita;
    var novo = montarItem({ dito: it.dito, quantidadeDita: q, unidadeDita: u }, it.produto);
    if (it.conferir) novo.conferir = true;
    cot.itens[i] = novo;
    return totais(cot);
  }
  function recalcular(cot) { return totais(JSON.parse(JSON.stringify(cot))); }

  function qtdTexto(it) {
    if (it.quantidade == null) return 'quantidade a definir';
    if (it.unidade === 'kg') return kg(Math.round(it.quantidade * 1000));
    var u = it.unidade === 'pacote' ? (it.quantidade === 1 ? 'pacote' : 'pacotes') : it.unidade === 'unidade' ? (it.quantidade === 1 ? 'unidade' : 'unidades') : 'un.';
    return it.quantidade.toLocaleString('pt-BR') + ' ' + u;
  }

  var api = {
    REGRA: REGRA, norm: norm, tokens: tokens, acharProduto: acharProduto, numero: numero,
    brl: brl, kg: kg, subtotal: subtotal, produtosAcougue: produtosAcougue, produtosParceiro: produtosParceiro,
    slotsIniciais: slotsIniciais, montarChurrasco: montarChurrasco, interpretarChurrasco: interpretarChurrasco,
    aplicarTroca: aplicarTroca, retirarSlot: retirarSlot, extrairData: extrairData, lerItem: lerItem,
    kellyProcessar: kellyProcessar, definirQuantidade: definirQuantidade, recalcular: recalcular, qtdTexto: qtdTexto, fmtData: fmtData
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BoiCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);
