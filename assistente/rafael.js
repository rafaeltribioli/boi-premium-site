/*
 * Rafael — assistente virtual do açougue Boi Premium (página inicial).
 * Interpreta a conversa, usa o cálculo fixo (500 g por pessoa: 50% fraldinha, 25% coxinha, 25% linguiça),
 * mostra a sugestão para revisão e só então adiciona à lista ou abre o WhatsApp.
 */
(function (w, d) {
  'use strict';
  var C = w.BoiCalc, esc = w.BoiChat.esc, CFG = w.BOI_ASSISTENTES || {};
  var produtos = C.produtosAcougue(w.BOI_CATALOGO_ACOUGUE);
  var raiz = d.getElementById('rafael');
  if (!raiz) return;
  var avatar = raiz.querySelector('.assist-avatar');
  var painel = d.getElementById('rafael-sugestao');
  var WHATS = CFG.whatsapp || '5519993497099';

  var OPCOES = {
    principal: ['Fraldinha', 'Picanha', 'Contrafilé', 'Bife de chorizo', 'Bife ancho', 'Maminha', 'Miolo da alcatra', 'Cupim', 'Assado de tira', 'Costela bovina'],
    frango: ['Coxinha da asa', 'Tulipa - meio da asa', 'Coração de frango', 'Sobrecoxa desossada', 'Asa inteira'],
    linguica: ['Linguiça', 'Panceta', 'Costelinha suína', 'Picanha suína', 'Barriga suína']
  };
  function nomeExibido(n) { return /^fraldinha$/i.test(n) ? 'Fraldinha Premium' : n.replace(' - ', ' — '); }

  var st = { pessoas: null, slots: C.slotsIniciais(), extras: {}, orcamentoCentavos: null, ofereceuExtras: false, revisando: false };
  var aplicado = {}; // chave -> nome na lista (evita duplicar se clicar de novo)
  var ultimo = null;

  function quilosFalados(g) { return (g / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + (g === 1000 ? ' quilo' : ' quilos'); }

  function responder(texto) {
    var r = C.interpretarChurrasco(texto, produtos), partes = [], entendeu = false;
    if (r.troca) {
      entendeu = true;
      var t = C.aplicarTroca(st.slots, r.troca.de, r.troca.para, produtos);
      if (t.ok) {
        st.slots.forEach(function (s) { if (s.nome === t.para) s.nome = nomeExibido(s.nome); });
        partes.push('Troquei ' + esc(t.de) + ' por ' + esc(nomeExibido(t.para)) + ', mantendo o peso.' + (t.semPreco ? ' Esse item não está na tabela do site, então a equipe confirma o preço.' : ''));
      } else partes.push('Não achei esse item na sugestão. Os itens são: ' + st.slots.map(function (s) { return esc(s.nome); }).join(', ') + '.');
    }
    if (r.retirar && !r.troca) {
      var fora = C.retirarSlot(st.slots, r.retirar);
      if (fora) { entendeu = true; partes.push('Tirei ' + esc(fora.nome) + '. A parte dele passou para ' + esc(st.slots[0].nome) + '.'); }
      else if (/fraldinha|principal/.test(C.norm(r.retirar))) { entendeu = true; partes.push('A fraldinha é a base da sugestão. Se preferir outra carne, é só falar “troca a fraldinha por picanha”.'); }
    }
    if (r.extras) {
      entendeu = true;
      Object.keys(r.extras).forEach(function (k) { st.extras[k] = r.extras[k]; });
      st.ofereceuExtras = true;
      partes.push('Coloquei à parte, fora do peso da carne: ' + Object.keys(r.extras).map(function (k) { return r.extras[k] + ' ' + (k === 'pao-de-alho' ? 'pão de alho' : 'queijo coalho'); }).join(' e ') + '.');
    }
    if (r.orcamentoCentavos) { entendeu = true; st.orcamentoCentavos = r.orcamentoCentavos; }
    var mudouPessoas = false;
    if (r.pessoas) {
      entendeu = true;
      if (r.pessoas > 500) return { texto: 'Pra mais de 500 pessoas, melhor falar direto com a equipe pelo WhatsApp que eles montam o orçamento.' };
      mudouPessoas = r.pessoas !== st.pessoas;
      st.pessoas = r.pessoas;
      st.slots.forEach(function (s) { delete s.gramasManual; });
    }
    if (!st.pessoas) {
      if (st.orcamentoCentavos) return { texto: 'Anotei o orçamento de ' + C.brl(st.orcamentoCentavos) + '. Agora me fala: quantas pessoas vão?' };
      return { texto: entendeu ? partes.join(' ') + ' Quantas pessoas vão no churrasco?' : 'Me fala quantas pessoas vão, por exemplo: “churrasco pra 20 pessoas”. Se quiser, diga também quanto quer gastar.' };
    }
    if (!entendeu) {
      return { texto: 'Posso ajustar assim: “muda pra 30 pessoas”, “troca a linguiça por panceta”, “até R$ 600” ou “com 2 pães de alho”. Você também pode mexer direto na lista abaixo.' };
    }
    var res = desenhar(true);
    var princ = res.linhas.find(function (l) { return l.papel === 'principal'; });
    if (mudouPessoas || r.troca || r.retirar) {
      var nomeP = princ ? princ.nome : '';
      var frase = 'Pra ' + res.pessoas + ' pessoas, recomendo começar com ' + quilosFalados(princ ? princ.gramas : 0) + ' da nossa ' + nomeP +
        ', num total de ' + quilosFalados(res.carneG) + ' de carne com os acompanhamentos de carne que eu sugeri.';
      if (!/fraldinha/i.test(nomeP)) frase = 'Pra ' + res.pessoas + ' pessoas, ficam ' + quilosFalados(princ.gramas) + ' de ' + nomeP + ', num total de ' + quilosFalados(res.carneG) + ' de carne.';
      partes.push(frase);
    }
    if (res.orcamentoCentavos) {
      if (res.saldoCentavos < 0) partes.push('Com os itens que têm preço, passa ' + C.brl(-res.saldoCentavos) + ' do seu orçamento de ' + C.brl(res.orcamentoCentavos) + '.' +
        (res.pessoasNoOrcamento ? ' Dá pra cerca de ' + res.pessoasNoOrcamento + ' pessoas nesse valor — quer que eu ajuste?' : ''));
      else partes.push('Fica dentro do orçamento: sobram ' + C.brl(res.saldoCentavos) + (res.pendentes.length ? ', sem contar o que a equipe ainda confirma.' : '.'));
    }
    if (res.pendentes.length && (mudouPessoas || r.troca)) partes.push(res.pendentes.join(' e ') + ' ainda sem preço na tabela do site: a equipe confirma.');
    if (!st.ofereceuExtras) { st.ofereceuExtras = true; partes.push('Quer pão de alho ou queijo coalho? Eles vão à parte, fora do peso da carne.'); }
    var txt = partes.join(' ');
    return { texto: txt + ' Confira a lista abaixo antes de adicionar.', fala: txt };
  }

  // ---------- Painel da sugestão ----------
  function desenhar(apontar) {
    var res = C.montarChurrasco(st, produtos);
    ultimo = res;
    painel.hidden = false;
    var princ = res.linhas.find(function (l) { return l.papel === 'principal'; });
    var temFraldinha = princ && /fraldinha/i.test(princ.nome) && princ.gramas > 0;
    var h = '<h3>Sua sugestão de churrasco</h3>' +
      '<p class="res-lead">Regra da casa: 500 g de carne crua por pessoa. Quantidades estimadas — pode editar.</p>' +
      '<div class="res-pessoas"><label for="rf-pessoas">Pessoas</label><span class="stepper"><button type="button" data-acao="menos" aria-label="Menos uma pessoa">−</button>' +
      '<input id="rf-pessoas" type="number" inputmode="numeric" min="1" max="500" value="' + res.pessoas + '"><button type="button" data-acao="mais" aria-label="Mais uma pessoa">+</button></span>' +
      '<span>= <b>' + C.kg(res.totalEstimadoG) + '</b> de carne estimada</span></div>';
    if (temFraldinha) {
      var clip = CFG.clipeFraldinha;
      h += '<figure class="res-foto">' + (clip ? '<video src="' + esc(clip) + '" poster="assistente/img/fraldinha-premium.webp" muted playsinline autoplay loop aria-label="Fraldinha Premium na brasa"></video>' :
        '<img src="assistente/img/fraldinha-premium.webp" width="960" height="720" alt="Foto real dos produtos Boi Premium embalados: fraldinha, pão de alho e linguiça">') +
        '<figcaption><span><b>Fraldinha Premium</b><small>Foto real · Boi Premium</small></span><span class="res-qtd">' + C.kg(princ.gramas) + '</span>' +
        '<button type="button" class="btn-a ouro" data-acao="add-principal">Adicionar ao pedido</button></figcaption></figure>';
    }
    h += '<ul class="res-linhas">';
    res.linhas.forEach(function (l) {
      var s = st.slots[l.slot], ops = OPCOES[s.papel] || [];
      var preco = l.precoCentavos != null ? C.brl(l.precoCentavos) + '/kg' : 'preço a confirmar';
      h += '<li class="res-linha"><span class="res-nome">' + esc(l.nome) + '<small>' + Math.round(s.share * 100) + '% da carne · ' + preco + '</small></span>' +
        (l.subtotalCentavos != null ? '<span class="res-sub">' + C.brl(l.subtotalCentavos) + '</span>' : '<span class="res-sub pend">a equipe confirma o preço</span>') +
        '<span class="res-ctrl"><label class="sr-only" for="rf-kg-' + l.slot + '">Quilos de ' + esc(l.nome) + '</label><input id="rf-kg-' + l.slot + '" data-kg="' + l.slot + '" type="number" inputmode="decimal" min="0" step="0.05" value="' + (l.gramas / 1000) + '"> kg' +
        '<label class="sr-only" for="rf-troca-' + l.slot + '">Trocar ' + esc(l.nome) + '</label><select id="rf-troca-' + l.slot + '" data-troca="' + l.slot + '"><option value="">Trocar por…</option>' +
        ops.filter(function (n) { return nomeExibido(n) !== l.nome; }).map(function (n) { return '<option>' + esc(nomeExibido(n)) + '</option>'; }).join('') + '</select></span></li>';
    });
    res.extras.forEach(function (e) {
      h += '<li class="res-linha"><span class="res-nome">' + esc(e.nome) + '<span class="tag-fora">fora do peso</span><small>' + (e.precoCentavos != null ? C.brl(e.precoCentavos) + '/' + e.unidade : 'preço a confirmar com a equipe') + '</small></span>' +
        (e.quantidade && e.subtotalCentavos != null ? '<span class="res-sub">' + C.brl(e.subtotalCentavos) + '</span>' : '<span class="res-sub pend">' + (e.quantidade ? 'a confirmar' : '') + '</span>') +
        '<span class="res-ctrl"><span class="stepper"><button type="button" data-extra="' + e.id + '" data-d="-1" aria-label="Menos ' + esc(e.nome) + '">−</button>' +
        '<input aria-label="Pacotes de ' + esc(e.nome) + '" data-extraq="' + e.id + '" type="number" min="0" max="99" inputmode="numeric" value="' + e.quantidade + '">' +
        '<button type="button" data-extra="' + e.id + '" data-d="1" aria-label="Mais ' + esc(e.nome) + '">+</button></span> pacote(s)</span></li>';
    });
    h += '</ul><p class="res-total">Carne: <b>' + C.kg(res.carneG) + '</b>' + (res.carneG !== res.totalEstimadoG ? ' (estimado: ' + C.kg(res.totalEstimadoG) + ')' : '') +
      '<br>Total cotado: <strong>' + C.brl(res.totalCotadoCentavos) + '</strong>' +
      (res.pendentes.length ? '<br><small>+ a confirmar pela equipe: ' + esc(res.pendentes.join(', ')) + '</small>' : '') + '</p>';
    if (res.orcamentoCentavos) {
      h += '<p class="res-saldo' + (res.saldoCentavos < 0 ? ' estourou' : '') + '">' + (res.saldoCentavos < 0 ?
        'Passa ' + C.brl(-res.saldoCentavos) + ' do orçamento de ' + C.brl(res.orcamentoCentavos) + (res.pessoasNoOrcamento ? '. Nesse valor cabem cerca de ' + res.pessoasNoOrcamento + ' pessoas.' : '.') :
        'Dentro do orçamento de ' + C.brl(res.orcamentoCentavos) + ' · sobram ' + C.brl(res.saldoCentavos)) + '</p>';
    }
    h += '<div class="res-acoes"><button type="button" class="btn-a" data-acao="add-tudo">Adicionar tudo ao pedido</button>' +
      '<button type="button" class="btn-a verde" data-acao="revisar">Revisar e pedir no WhatsApp</button></div>' +
      '<div id="rf-revisao"></div>' +
      '<p class="res-nota">Preços da tabela da loja (data-base 29/10/2026). A equipe confirma disponibilidade, peso final, entrega e itens sem preço. Nada é enviado sem você tocar em enviar no WhatsApp.</p>';
    painel.innerHTML = h;
    if (apontar && avatar && !w.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      avatar.classList.add('aponta');
      clearTimeout(desenhar.t); desenhar.t = setTimeout(function () { avatar.classList.remove('aponta'); }, 2600);
    }
    return res;
  }

  function mensagemWhats(res) {
    var l = ['Olá, Boi Premium! Montei meu churrasco no site com o Rafael (assistente virtual):', '', 'Pessoas: ' + res.pessoas + ' · Carne: ' + C.kg(res.carneG)];
    res.linhas.forEach(function (x) { if (x.gramas > 0) l.push('• ' + C.kg(x.gramas) + ' — ' + x.nome + ' — ' + (x.subtotalCentavos != null ? C.brl(x.subtotalCentavos) : 'preço a confirmar')); });
    res.extras.forEach(function (e) { if (e.quantidade) l.push('• ' + e.quantidade + ' pacote(s) — ' + e.nome + ' (à parte) — ' + (e.subtotalCentavos != null ? C.brl(e.subtotalCentavos) : 'preço a confirmar')); });
    l.push('', 'Total estimado: ' + C.brl(res.totalCotadoCentavos) + (res.pendentes.length ? ' + itens a confirmar (' + res.pendentes.join(', ') + ')' : ''));
    if (res.orcamentoCentavos) l.push('Meu orçamento: ' + C.brl(res.orcamentoCentavos));
    l.push('Podem confirmar disponibilidade, peso final, entrega e forma de pagamento?');
    return l.join('\n');
  }

  function linhasParaLista(res, so) {
    var out = [];
    res.linhas.forEach(function (x) {
      if (so && so !== 'slot' + x.slot) return;
      out.push({ chave: 'slot' + x.slot, nome: x.nome, qtd: x.gramas / 1000, unidade: 'kg', precoCentavos: x.precoCentavos });
    });
    if (!so) res.extras.forEach(function (e) { out.push({ chave: e.id, nome: e.nome, qtd: e.quantidade, unidade: 'pacote', precoCentavos: e.precoCentavos }); });
    return out;
  }
  function aplicarNaLista(linhas, parcial) {
    var L = w.boiLista;
    if (!L) return;
    var chaves = {};
    linhas.forEach(function (x) { chaves[x.chave] = 1; });
    if (!parcial) Object.keys(aplicado).forEach(function (k) { if (!chaves[k]) { L.remover(aplicado[k]); delete aplicado[k]; } });
    linhas.forEach(function (x) {
      if (aplicado[x.chave] && aplicado[x.chave] !== x.nome) L.remover(aplicado[x.chave]);
      if (x.qtd > 0) { L.definir(x.nome, x.qtd, x.unidade, x.precoCentavos); aplicado[x.chave] = x.nome; }
      else { L.remover(x.nome); delete aplicado[x.chave]; }
    });
  }

  painel.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var a = b.dataset.acao;
    if (a === 'menos' || a === 'mais') {
      st.pessoas = Math.min(500, Math.max(1, (st.pessoas || 0) + (a === 'mais' ? 1 : -1)));
      st.slots.forEach(function (s) { delete s.gramasManual; });
      desenhar(); d.getElementById('rf-pessoas').focus();
    } else if (b.dataset.extra) {
      var q = Math.max(0, Math.min(99, (st.extras[b.dataset.extra] || 0) + Number(b.dataset.d)));
      st.extras[b.dataset.extra] = q; desenhar();
    } else if (a === 'add-tudo') {
      aplicarNaLista(linhasParaLista(ultimo));
      w.boiLista && w.boiLista.aviso('Sugestão do Rafael na sua lista. Se mudar algo aqui, toque de novo para atualizar.');
    } else if (a === 'add-principal') {
      var p = ultimo.linhas.find(function (l) { return l.papel === 'principal'; });
      aplicarNaLista(linhasParaLista(ultimo, 'slot' + p.slot), true);
      w.boiLista && w.boiLista.aviso(C.kg(p.gramas) + ' de ' + p.nome + ' na sua lista');
    } else if (a === 'revisar') {
      var box = d.getElementById('rf-revisao');
      box.innerHTML = '<div class="res-revisao" tabindex="-1"><h4>Revise a mensagem antes de abrir o WhatsApp</h4><pre>' + esc(mensagemWhats(ultimo)) + '</pre>' +
        '<div class="res-acoes"><button type="button" class="btn-a verde" data-acao="abrir-whats">Abrir no WhatsApp ↗</button><button type="button" class="btn-a linha" data-acao="fechar-rev">Voltar e ajustar</button></div></div>';
      box.firstChild.focus();
    } else if (a === 'abrir-whats') {
      w.open('https://wa.me/' + WHATS + '?text=' + encodeURIComponent(mensagemWhats(ultimo)), '_blank', 'noopener,noreferrer');
    } else if (a === 'fechar-rev') {
      d.getElementById('rf-revisao').innerHTML = '';
    }
  });
  painel.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'rf-pessoas') {
      var n = Math.floor(Number(t.value));
      if (n >= 1 && n <= 500) { st.pessoas = n; st.slots.forEach(function (s) { delete s.gramasManual; }); }
      desenhar();
    } else if (t.dataset.kg != null) {
      var g = Math.round(Number(String(t.value).replace(',', '.')) * 1000);
      if (Number.isFinite(g) && g >= 0 && g <= 500000) st.slots[Number(t.dataset.kg)].gramasManual = g;
      desenhar();
    } else if (t.dataset.troca != null && t.value) {
      var i = Number(t.dataset.troca), s = st.slots[i];
      st.slots[i] = { papel: s.papel, share: s.share, nome: t.value, busca: t.value.replace(' Premium', '').replace(' — ', ' - '), gramasManual: s.gramasManual };
      chat.bot('Troquei ' + esc(s.nome) + ' por ' + esc(t.value) + ' e recalculei o total.');
      desenhar(true);
    } else if (t.dataset.extraq) {
      st.extras[t.dataset.extraq] = Math.max(0, Math.min(99, Math.floor(Number(t.value)) || 0));
      desenhar();
    }
  });

  var chat = w.BoiChat.criar({
    raiz: d.getElementById('rafael-chat'),
    avatar: avatar,
    nome: 'Rafael',
    falaInicial: 'Oi! Eu sou o Rafael, assistente virtual da Boi Premium. Me fala quantas pessoas vão no seu churrasco — e, se quiser, quanto quer gastar — que eu monto a sugestão.',
    placeholder: 'Ex.: churrasco pra 20 pessoas',
    sugestoes: ['Churrasco pra 10 pessoas', 'Pra 20 pessoas', '30 pessoas até R$ 1.200'],
    voz: { tom: 0.92, preferidas: ['felipe', 'daniel', 'antonio', 'google'] },
    responder: responder
  });
})(window, document);
