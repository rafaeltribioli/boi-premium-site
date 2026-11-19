/*
 * Kelly — assistente virtual da Área do Empreendedor (parceiros/).
 * Recebe listas por voz ou texto ("50 espetinhos de fraldinha e 30 tulipas pra sexta"),
 * monta a cotação com o catálogo de parceiros e aceita alterações pontuais ("muda pra 40 tulipas")
 * sem perder os outros itens nem a data. A equipe confirma disponibilidade, peso e entrega.
 */
(function (w, d) {
  'use strict';
  var C = w.BoiCalc, esc = w.BoiChat.esc, CFG = w.BOI_ASSISTENTES || {};
  var produtos = C.produtosParceiro(w.BOI_PRODUTOS_PARCEIRO || []);
  var raiz = d.getElementById('kelly');
  if (!raiz) return;
  var avatar = raiz.querySelector('.assist-avatar');
  var painel = d.getElementById('kelly-cotacao');
  var WHATS = CFG.whatsapp || '5519993497099';
  var cot = { itens: [], data: null };
  var ofereceuComplementos = false;
  var aplicadoNoPedido = {}; // índice do produto -> quantidade colocada pela Kelly (evita duplicar)

  var STATUS = {
    peso_a_confirmar: 'vendido por kg — a equipe confirma o peso e o valor',
    sem_cadastro: 'não está no catálogo — a equipe confirma',
    sem_quantidade: 'falta a quantidade',
    unidade_diferente: 'unidade diferente do cadastro — a equipe confirma',
    quantidade_invalida: 'use quantidade inteira'
  };
  function nomeItem(it) { return it.produto ? it.produto.nome : C.norm(it.dito).replace(/^./, function (c) { return c.toUpperCase(); }); }
  function linhaTexto(it) { return C.qtdTexto(it) + ' de ' + nomeItem(it); }

  function hoje() { return new Date(); }

  function responder(texto) {
    var r = C.kellyProcessar(texto, cot, produtos, hoje());
    var antes = cot;
    cot = r.cotacao;
    var partes = [];
    if (r.acao === 'nao_entendi') {
      return { texto: 'Não consegui entender os produtos. Pode mandar assim: “50 espetinhos de fraldinha e 30 tulipas pra sexta” ou “5 kg de coxinha da asa”.' };
    }
    if (r.acao === 'nao_achei') return { texto: 'Não achei “' + esc(r.termo) + '” na sua cotação. Os itens são: ' + cot.itens.map(function (i) { return esc(nomeItem(i)); }).join(', ') + '.' };
    if (r.acao === 'removeu') partes.push('Tirei ' + esc(nomeItem(r.item)) + '. O resto continua igual.');
    if (r.acao === 'trocou') partes.push('Troquei ' + esc(nomeItem(r.de)) + ' por ' + esc(nomeItem(r.para)) + ', com a mesma quantidade.');
    if (r.acao === 'churrasco') partes.push('Pra ' + r.pessoas + ' pessoas, usando 500 g de carne crua por pessoa, coloquei ' + C.kg(r.carneG) + ': metade fraldinha, um quarto coxinha da asa e um quarto linguiça.');
    if (r.acao === 'alterou') r.mudou.forEach(function (m) { partes.push('Pronto: ' + esc(nomeItem(m.para)) + ' passou de ' + esc(C.qtdTexto(m.de)) + ' para ' + esc(C.qtdTexto(m.para)) + '. Mantive os outros itens' + (cot.data ? ' e a data.' : '.')); });
    if (r.acao === 'adicionou') {
      if (r.mudou && r.mudou.length) r.mudou.forEach(function (m) { partes.push('Atualizei ' + esc(nomeItem(m.para)) + ' para ' + esc(C.qtdTexto(m.para)) + '.'); });
      if (r.novos && r.novos.length) partes.push((antes.itens.length ? 'Incluí ' : 'Anotei ') + r.novos.map(function (i) { return esc(linhaTexto(i)); }).join(', ') + '.');
      if (r.soData) partes.push('Anotei a data.');
    }
    if (r.semEntender && r.semEntender.length) partes.push('Não entendi: “' + r.semEntender.map(esc).join('”, “') + '”.');
    if (cot.data && (r.acao === 'adicionou' || r.acao === 'churrasco') && !(r.mudou && r.mudou.length)) partes.push('Data desejada: ' + cot.data.rotulo + '.');
    if (!cot.data && cot.itens.length) partes.push('Pra quando você precisa?');
    var conferir = cot.itens.filter(function (i) { return i.status !== 'ok' || i.conferir; });
    if (conferir.length) partes.push(conferir.length === 1 ? 'Um item fica para a equipe confirmar.' : conferir.length + ' itens ficam para a equipe confirmar.');
    if (!ofereceuComplementos && cot.itens.length && cot.data) { ofereceuComplementos = true; partes.push('Quer incluir carvão, pão de alho ou palitos? É só tocar abaixo.'); }
    desenhar();
    var t = partes.join(' ');
    return { texto: t + (cot.itens.length ? ' Confira a cotação abaixo.' : ''), fala: t };
  }

  function desenhar() {
    painel.hidden = !cot.itens.length;
    if (!cot.itens.length) { painel.innerHTML = ''; return; }
    var h = '<h3>Sua cotação</h3><p class="res-lead">Catálogo da Área do Empreendedor. Você pode falar ou digitar mudanças, como “muda pra 40 tulipas”.</p>' +
      '<div class="res-data"><label for="kl-data"><b>Data desejada</b></label><input id="kl-data" type="date" value="' + (cot.data ? cot.data.iso : '') + '">' + (cot.data ? '<span>' + esc(cot.data.rotulo) + '</span>' : '<span>a combinar</span>') + '</div><ul class="res-linhas">';
    cot.itens.forEach(function (it, i) {
      var preco = it.produto ? C.brl(it.produto.precoCentavos) + '/' + it.produto.unidade : 'sem preço cadastrado';
      h += '<li class="res-linha"><span class="res-nome">' + esc(nomeItem(it)) + '<small>' + esc(C.qtdTexto(it)) + ' · ' + preco + (it.produto && C.norm(it.dito) !== C.norm(it.produto.nome) ? ' · você pediu: “' + esc(it.dito) + '”' : '') + '</small>' +
        (it.status !== 'ok' ? '<span class="tag-aviso">' + STATUS[it.status] + '</span>' : '') + (it.conferir ? '<span class="tag-aviso">confira se é este produto</span>' : '') + '</span>' +
        (it.subtotalCentavos != null ? '<span class="res-sub">' + C.brl(it.subtotalCentavos) + '</span>' : '<span class="res-sub pend">a confirmar</span>') +
        '<span class="res-ctrl"><label class="sr-only" for="kl-q-' + i + '">Quantidade de ' + esc(nomeItem(it)) + '</label><input id="kl-q-' + i + '" data-q="' + i + '" type="number" inputmode="decimal" min="0" step="any" value="' + (it.quantidade == null ? '' : it.quantidade) + '"> ' + esc(it.unidade === 'un' ? 'un.' : it.unidade || '') +
        '<button type="button" class="x" data-rm="' + i + '" aria-label="Tirar ' + esc(nomeItem(it)) + '">×</button></span></li>';
    });
    h += '</ul><p class="res-total">Total estimado: <strong>' + C.brl(cot.totalCotadoCentavos) + '</strong>' + (cot.pendentes ? '<br><small>+ ' + cot.pendentes + ' item(ns) com valor a confirmar pela equipe</small>' : '') + '</p>';
    if (ofereceuComplementos) {
      h += '<div class="chat-sug" role="group" aria-label="Complementos">' + ['Carvão 4 kg', 'Pão de alho', 'Palito — pacote com 50 unidades'].map(function (n) {
        return '<button type="button" class="btn-a linha" data-comp="' + esc(n) + '">+ ' + esc(n.split(' —')[0]) + '</button>'; }).join('') + '</div>';
    }
    h += '<div class="res-acoes"><button type="button" class="btn-a" data-acao="usar">Usar no meu pedido</button><button type="button" class="btn-a verde" data-acao="revisar">Revisar e enviar no WhatsApp</button></div><div id="kl-revisao"></div>' +
      '<p class="res-nota">Valores do catálogo de parceiros. A equipe confirma disponibilidade, peso final, entrega e pagamento. Nada é enviado sem você tocar em enviar no WhatsApp.</p>';
    painel.innerHTML = h;
  }

  function mensagem() {
    var l = ['Olá, Boi Premium! Sou parceiro empreendedor e quero uma cotação (montada com a Kelly, assistente virtual do site):', ''];
    cot.itens.forEach(function (it) {
      l.push('• ' + linhaTexto(it) + ' — ' + (it.subtotalCentavos != null ? C.brl(it.subtotalCentavos) : 'valor a confirmar') + (it.status === 'peso_a_confirmar' ? ' (pedido em unidades; peso a confirmar)' : ''));
    });
    l.push('', 'Data desejada: ' + (cot.data ? cot.data.rotulo : 'a combinar'));
    l.push('Total estimado: ' + C.brl(cot.totalCotadoCentavos) + (cot.pendentes ? ' + itens a confirmar' : ''));
    l.push('Podem confirmar disponibilidade, peso final, entrega e pagamento?');
    return l.join('\n');
  }

  function usarNoPedido() {
    // integra com o carrinho existente da página (variáveis globais cart/renderCart de parceiros/index.html)
    if (typeof w.kellyIntegrarPedido !== 'function') return;
    var linhas = [], notas = [];
    cot.itens.forEach(function (it) {
      if (it.status === 'ok' && it.produto) linhas.push({ i: it.produto.idx, q: it.quantidade });
      else notas.push(linhaTexto(it) + ' (a confirmar)');
    });
    aplicadoNoPedido = w.kellyIntegrarPedido(linhas, aplicadoNoPedido, cot.data ? cot.data.iso : '', notas);
  }

  painel.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.rm != null) {
      var fora = cot.itens.splice(Number(b.dataset.rm), 1)[0];
      cot = C.recalcular(cot);
      chat.bot('Tirei ' + esc(nomeItem(fora)) + '.');
      desenhar();
    } else if (b.dataset.comp) {
      chat.enviar('mais 1 ' + (/carv/i.test(b.dataset.comp) ? 'pacote de carvão 4 kg' : /palito/i.test(b.dataset.comp) ? 'pacote de palito' : 'pacote de pão de alho'));
    } else if (b.dataset.acao === 'usar') {
      usarNoPedido();
      var ped = d.getElementById('pedido');
      if (ped) ped.scrollIntoView({ behavior: w.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    } else if (b.dataset.acao === 'revisar') {
      var box = d.getElementById('kl-revisao');
      box.innerHTML = '<div class="res-revisao" tabindex="-1"><h4>Revise a mensagem antes de abrir o WhatsApp</h4><pre>' + esc(mensagem()) + '</pre>' +
        '<div class="res-acoes"><a class="btn-a verde" style="text-align:center;text-decoration:none" data-acao="abrir" target="_blank" rel="noopener noreferrer" href="https://wa.me/' + WHATS + '?text=' + encodeURIComponent(mensagem()) + '">Abrir no WhatsApp ↗</a><button type="button" class="btn-a linha" data-acao="fechar">Voltar e ajustar</button></div></div>';
      box.firstChild.focus();
    } else if (b.dataset.acao === 'fechar') {
      d.getElementById('kl-revisao').innerHTML = '';
    }
  });
  painel.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'kl-data') {
      if (t.value) { var p = t.value.split('-'); var dt = new Date(+p[0], +p[1] - 1, +p[2]); cot.data = { iso: t.value, rotulo: C.fmtData(dt) }; }
      else cot.data = null;
      desenhar();
    } else if (t.dataset.q != null) {
      var q = Number(String(t.value).replace(',', '.'));
      cot = C.definirQuantidade(cot, Number(t.dataset.q), q);
      desenhar();
    }
  });

  var chat = w.BoiChat.criar({
    raiz: d.getElementById('kelly-chat'),
    avatar: avatar,
    nome: 'Kelly',
    falaInicial: 'Oi, eu sou a Kelly, assistente virtual da Boi Premium. O que você precisa pro seu negócio hoje? Pode me falar os produtos e as quantidades que eu preparo sua cotação.',
    placeholder: 'Ex.: 50 espetinhos de fraldinha e 30 tulipas pra sexta',
    sugestoes: ['50 espetinhos de fraldinha e 30 tulipas pra sexta', '5 kg de coxinha da asa pra amanhã', 'Churrasco pra 20 pessoas'],
    voz: { tom: 1.12, preferidas: ['luciana', 'francisca', 'maria', 'google'] },
    responder: responder
  });

  if (avatar && !w.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setTimeout(function () { avatar.classList.add('acena'); }, 400);
    avatar.addEventListener('animationend', function () { avatar.classList.remove('acena'); });
  }
})(window, document);
