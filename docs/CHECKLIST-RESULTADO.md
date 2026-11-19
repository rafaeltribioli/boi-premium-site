# Checklist de aceitação — resultado em 17/11/2026

Legenda: ✅ verificado por teste automático · ⏳ depende da configuração da IA real (contas/chaves do proprietário)

- ✅ Catálogo contém 81 itens e categorias 20/15/16/8/13/9; unidade correta. (`motor.test.mjs`)
- ✅ Fraldinha kit = 12990 centavos e buchada = 7990 centavos/kg.
- ✅ 500 g de picanha a R$119,90/kg = R$59,95; 1 kit fraldinha = R$129,90.
- ✅ 10 adultos + 4 crianças com acompanhamentos => 4800 g (com explicação da idade das crianças).
- ✅ 2 adultos × 5 refeições × 150 g = 1500 g.
- ✅ "Sem porco" exclui suínos, buchada/hambúrguer (ingredientes desconhecidos) e todos os kits; osso fica fora do peso de carne com aviso.
- ✅ Duas propostas distintas cotadas pelo servidor quando viável; orçamento insuficiente informado com orçamento necessário e peso máximo; "premium" não é repetida quando só cabe uma.
- ✅ Troca recota tudo; preço do cliente/modelo ignorado; kits inteiros; pesos em múltiplos de 100 g.
- ✅ Kit sem promessa de rendimento por pessoa; composição validada; trocas em kit vão como "solicitação a confirmar".
- ✅ Complemento sem preço não é adicionado; pão de alho do kit contado e não duplicado.
- ✅ Adicionar proposta atualiza a lista existente, mantém escolhas anteriores e não duplica em clique repetido. (navegador)
- ✅ WhatsApp abre texto com produtos, subtotais, total, restrições e pendências; nada enviado automaticamente; sem dados pessoais na URL.
- ✅ Avatar aprovado preservado (PNG original + WebP), bloco acima do vídeo/vídeos/catálogo, mobile utilizável (360/390/768/1440 sem rolagem horizontal), teclado e Esc.
- ✅ Credencial ausente e timeout mantêm a compra funcionando com fallback honesto. ⏳ Chamada ao serviço real com o Claude ainda não testada (falta chave/Worker publicado).
- ✅ Chave ausente de todo arquivo do navegador; histórico limitado a 12; limites por IP/sessão/dia; logs sem conteúdo.
- ✅ Tentativa de preço/desconto pelo modelo e kit com porco sob restrição são rejeitados pelo servidor. ⏳ Comportamento do Claude real diante de pedidos maliciosos: testar após configurar.
- ✅ Parceiros/, vídeos, dicas, lista, hambúrguer e botões atuais continuam funcionando (sem erros de JavaScript).
- ⏳ URL pública e chamada real verificadas — pendente: o site só deve ir ao ar com o Worker configurado (ver docs/RAFAEL-VIRTUAL.md, etapas 1–6).

Comandos executados: `node --test testes/*.test.mjs` (26/26) e `python3 testes/e2e/navegador.py` (todos OK).
