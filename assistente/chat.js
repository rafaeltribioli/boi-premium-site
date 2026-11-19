/*
 * Caixa de conversa dos assistentes (texto + microfone + resposta falada).
 * Usada pelo Rafael (açougue) e pela Kelly (Área do Empreendedor).
 */
(function (w, d) {
  'use strict';
  function el(tag, attrs, html) {
    var e = d.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /**
   * o: {raiz, avatar, nome, falaInicial, placeholder, sugestoes, voz:{tom,preferidas}, responder(texto)->{texto, fala}}
   */
  function criar(o) {
    var raiz = o.raiz;
    var vozLigada = false, pararMic = null;
    var log = el('ol', { class: 'chat-log', 'aria-live': 'polite', 'aria-label': 'Conversa com ' + o.nome });
    var form = el('form', { class: 'chat-form', autocomplete: 'off' });
    var id = 'chat-in-' + o.nome.toLowerCase();
    form.innerHTML =
      '<label class="sr-only" for="' + id + '">Escreva para ' + esc(o.nome) + '</label>' +
      '<input id="' + id + '" name="msg" type="text" maxlength="400" enterkeyhint="send" placeholder="' + esc(o.placeholder) + '">' +
      '<button type="button" class="chat-mic" aria-pressed="false" aria-label="Falar com ' + esc(o.nome) + ' pelo microfone" title="Falar pelo microfone">' +
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"/></svg></button>' +
      '<button type="submit" class="chat-send">Enviar</button>';
    var barra = el('div', { class: 'chat-bar' });
    var sug = el('div', { class: 'chat-sug', role: 'group', 'aria-label': 'Sugestões rápidas' });
    (o.sugestoes || []).forEach(function (s) {
      var b = el('button', { type: 'button' }, esc(s));
      b.addEventListener('click', function () { enviar(s); });
      sug.appendChild(b);
    });
    var vozBtn = el('button', { type: 'button', class: 'chat-voz', 'aria-pressed': 'false' }, '🔈 Ouvir respostas');
    var modo = el('p', { class: 'chat-modo' });
    barra.appendChild(vozBtn);
    raiz.appendChild(log);
    raiz.appendChild(sug);
    raiz.appendChild(form);
    raiz.appendChild(barra);
    raiz.appendChild(modo);
    var input = form.querySelector('input'), mic = form.querySelector('.chat-mic');

    if (!w.BoiVoz.suportaFala) vozBtn.hidden = true;
    modo.textContent = 'Assistente virtual com respostas automáticas pelo catálogo. ' +
      (w.BoiVoz.suportaDitado ? 'Voz pelo microfone do navegador.' : 'Neste navegador, use o teclado (o microfone do teclado do celular também funciona).') +
      ' Vídeo falante ainda não ativado.';

    function setVoz(v) {
      vozLigada = v;
      vozBtn.setAttribute('aria-pressed', String(v));
      vozBtn.textContent = v ? '🔊 Respostas faladas: ligadas' : '🔈 Ouvir respostas';
      if (!v) w.BoiVoz.calar();
    }
    vozBtn.addEventListener('click', function () {
      setVoz(!vozLigada);
      if (vozLigada) falar(ultimaFala || o.falaInicial);
    });

    var ultimaFala = '';
    function falar(t) {
      if (!vozLigada || !t) return;
      w.BoiVoz.falar(t, {
        tom: o.voz && o.voz.tom, preferidas: o.voz && o.voz.preferidas,
        onInicio: function () { o.avatar && o.avatar.classList.add('falando'); },
        onFim: function () { o.avatar && o.avatar.classList.remove('falando'); }
      });
    }

    function bolha(quem, html) {
      var li = el('li', { class: 'msg msg-' + quem }, html);
      log.appendChild(li);
      log.scrollTop = log.scrollHeight;
      return li;
    }
    function bot(texto, fala) {
      bolha('bot', '<span class="sr-only">' + esc(o.nome) + ': </span>' + texto);
      ultimaFala = fala || texto.replace(/<[^>]+>/g, '');
      falar(ultimaFala);
    }
    function enviar(texto) {
      texto = String(texto || '').trim();
      if (!texto) return;
      bolha('cli', '<span class="sr-only">Você: </span>' + esc(texto));
      input.value = '';
      var r = o.responder(texto) || {};
      if (r.texto) bot(r.texto, r.fala);
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); enviar(input.value); });

    function micParado() { mic.classList.remove('ouvindo'); mic.setAttribute('aria-pressed', 'false'); pararMic = null; }
    mic.addEventListener('click', function () {
      if (pararMic) { pararMic(); return; }
      if (!w.BoiVoz.suportaDitado) {
        bot('Por aqui o ditado por voz não funciona neste navegador. Pode digitar — no celular, o microfone do teclado também serve.');
        input.focus();
        return;
      }
      w.BoiVoz.calar();
      pararMic = w.BoiVoz.ouvir({
        onInicio: function () { mic.classList.add('ouvindo'); mic.setAttribute('aria-pressed', 'true'); input.placeholder = 'Ouvindo… pode falar'; },
        onParcial: function (t) { input.value = t; },
        onFim: function (t) {
          micParado(); input.placeholder = o.placeholder;
          if (t) { setVoz(true); enviar(t); }
          else bot('Não consegui ouvir. Toque no microfone e fale de novo, ou digite aqui embaixo.');
        },
        onErro: function (e) {
          micParado(); input.placeholder = o.placeholder;
          if (e === 'not-allowed' || e === 'service-not-allowed') bot('Sem acesso ao microfone, tudo bem: é só digitar aqui embaixo que eu continuo.');
          else if (e === 'no-speech') bot('Não ouvi nada. Toque no microfone e fale de novo, ou digite.');
          else if (e !== 'aborted') bot('O microfone não funcionou agora. Pode digitar que eu continuo.');
          input.focus();
        }
      });
    });

    bot(o.falaInicial);
    return { enviar: enviar, bot: bot, input: input };
  }
  w.BoiChat = { criar: criar, esc: esc };
})(window, document);
