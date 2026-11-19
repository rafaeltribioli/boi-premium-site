# Assistentes virtuais Boi Premium — Rafael e Kelly

Atualizado em 19/11/2026.

## O que funciona hoje (sem custo, sem chave de API)

| Onde | Assistente | O que faz |
| --- | --- | --- |
| Página inicial (`index.html`, bloco `#rafael`) | Rafael | Monta o churrasco: 500 g de carne crua por pessoa, 50% Fraldinha Premium, 25% coxinha da asa e 25% linguiça. Recalcula quando muda o número de pessoas ou troca um item. Pão de alho e queijo coalho vão à parte, fora do peso. |
| Área do Empreendedor (`parceiros/`, bloco `#kelly`) | Kelly | Recebe a lista por voz ou texto, com produtos, quantidades e data ("50 espetinhos de fraldinha e 30 tulipas pra sexta"). Alterações pontuais ("muda pra 40 tulipas") mantêm os outros itens e a data. |

- **Conversa:** respostas automáticas e determinísticas, baseadas no catálogo (`assistente/calculo.js`). Não é IA de linguagem, e a tela diz isso.
- **Voz:** usa o microfone e a voz em português do próprio navegador (Web Speech API). Funciona no Chrome e no Safari do iPhone (iOS 14.5 ou mais novo). O microfone só liga depois que o cliente toca no botão. Se o acesso for negado ou o navegador não tiver suporte, o atendimento continua por texto.
- **Gestos:** o Rafael se inclina na direção da sugestão. A Kelly faz um aceno leve ao abrir a página. Enquanto um deles fala, uma borda dourada pulsa na foto. Quem ativa "reduzir movimento" no celular não vê essas animações.
- **Preços:** Rafael usa `assistente/catalogo-acougue.js` (tabela com data-base de 29/10/2026). Kelly usa `parceiros/data.js`. Item sem preço ou fora do cadastro aparece como "a confirmar". A linguiça, o pão de alho e o queijo coalho não estão no catálogo do açougue, então ficam para a equipe confirmar.
- **Pedido:** o cliente revisa a lista antes. "Adicionar ao pedido" atualiza a lista da página, e clicar de novo não duplica. O WhatsApp abre só depois que o cliente vê a mensagem e toca em "Abrir no WhatsApp".

## O que NÃO está ativo: vídeo falante com sincronização labial

Para o avatar mexer a boca em tempo real é preciso um serviço pago e um pequeno servidor que guarde a chave. Hoje o site é estático (GitHub Pages) e não tem servidor.

**Fornecedor sugerido:** HeyGen LiveAvatar. Ele aceita avatar criado a partir de uma foto, tem sincronização labial, expressões e gestos, e cobra créditos próprios.
Alternativas: D-ID (agentes em tempo real, a partir de foto) e Anam.
Os preços mudam com frequência. Confira a página oficial de preços antes de contratar. Como referência de novembro/2026, os planos de API ficam entre cerca de US$ 18 e US$ 99 por mês, mais o consumo por minuto de conversa.

**Atenção:** para criar o avatar de uma pessoa real (Rafael, Kelly), os fornecedores exigem o consentimento dela.

### Como ligar quando houver conta

1. Crie a conta no fornecedor e o avatar a partir de `pacote/assets/avatar-rafael.png` e `avatar-kelly.png` (originais em alta resolução, fora do site).
2. Crie uma função de servidor que gere a sessão do avatar. O Rafael já usa Netlify no sistema financeiro, então uma Netlify Function serve. A função recebe o pedido do navegador e devolve um token de sessão de curta duração.
3. Coloque as variáveis **só no painel do servidor** (nunca no código do site):
   - `AVATAR_API_KEY`: chave do fornecedor
   - `AVATAR_ID_RAFAEL` e `AVATAR_ID_KELLY`: identificadores dos avatares
   - `AVATAR_ORIGEM_PERMITIDA`: `https://premiumcarnes.com.br`
4. Em `assistente/config.js`, preencha `videoAvatar: { ativo: true, endpointSessao: 'https://.../sessao' }`.
5. Teste no celular antes de publicar. Se o serviço falhar, a foto, o texto e o cálculo continuam funcionando.

## Vídeo curto da fraldinha na brasa

Coloque o arquivo em `assistente/img/` e informe o caminho em `assistente/config.js` → `clipeFraldinha`. Enquanto ele não existir, aparece a foto real com aproximação suave.

## Testes

```
node --test tests/*.test.js
```

Os testes verificam: 20 pessoas = 10 kg (5 / 2,5 / 2,5), 30 pessoas = 15 kg (7,5 / 3,75 / 3,75), acompanhamentos fora do peso, troca de item, orçamento, a lista da Kelly com data e a mudança de 30 para 40 tulipas.
