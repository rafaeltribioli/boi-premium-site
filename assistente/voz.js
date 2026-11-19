/*
 * Voz dos assistentes usando o próprio navegador (sem custo, sem chave):
 *  - ditado (microfone -> texto): Web Speech API (Chrome, Edge, Safari do iPhone 14.5+)
 *  - resposta falada: speechSynthesis em português do Brasil
 * O microfone só liga quando o cliente toca no botão. Se não houver suporte ou permissão,
 * o atendimento continua por texto.
 */
(function (w) {
  'use strict';
  var Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
  var synth = w.speechSynthesis;
  var vozes = [];
  function carregarVozes() { try { vozes = synth ? synth.getVoices() : []; } catch (e) { vozes = []; } }
  if (synth) { carregarVozes(); if ('onvoiceschanged' in synth) synth.onvoiceschanged = carregarVozes; }

  function vozPt(preferidas) {
    var pt = vozes.filter(function (v) { return /^pt(-|_)?br/i.test(v.lang) || /portugu.s do brasil/i.test(v.name); });
    if (!pt.length) pt = vozes.filter(function (v) { return /^pt/i.test(v.lang); });
    for (var i = 0; i < (preferidas || []).length; i++) {
      var achou = pt.find(function (v) { return v.name.toLowerCase().indexOf(preferidas[i]) >= 0; });
      if (achou) return achou;
    }
    return pt[0] || null;
  }

  var atual = null;
  var BoiVoz = {
    suportaDitado: !!Rec,
    suportaFala: !!synth,
    /** Ouve uma frase. Retorna função para parar. */
    ouvir: function (o) {
      if (!Rec) { o.onErro && o.onErro('sem_suporte'); return function () {}; }
      BoiVoz.calar();
      var r = new Rec();
      r.lang = 'pt-BR'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
      var final = '', terminou = false;
      r.onresult = function (e) {
        var parcial = '';
        for (var i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) final += e.results[i][0].transcript; else parcial += e.results[i][0].transcript;
        }
        o.onParcial && o.onParcial((final + ' ' + parcial).trim());
      };
      r.onerror = function (e) { terminou = true; o.onErro && o.onErro(e.error || 'erro'); };
      r.onend = function () { if (!terminou) o.onFim && o.onFim(final.trim()); };
      try { r.start(); o.onInicio && o.onInicio(); } catch (e) { o.onErro && o.onErro('erro'); }
      return function () { try { r.stop(); } catch (e) {} };
    },
    /** Fala o texto em pt-BR. */
    falar: function (texto, o) {
      o = o || {};
      if (!synth || !texto) { o.onFim && o.onFim(); return; }
      BoiVoz.calar();
      var u = new SpeechSynthesisUtterance(texto);
      u.lang = 'pt-BR';
      var v = vozPt(o.preferidas);
      if (v) u.voice = v;
      u.rate = o.velocidade || 1.02;
      u.pitch = o.tom || 1;
      u.onstart = function () { o.onInicio && o.onInicio(); };
      u.onend = u.onerror = function () { if (atual === u) atual = null; o.onFim && o.onFim(); };
      atual = u;
      synth.speak(u);
    },
    calar: function () { try { if (synth) synth.cancel(); } catch (e) {} atual = null; }
  };
  w.BoiVoz = BoiVoz;
})(window);
