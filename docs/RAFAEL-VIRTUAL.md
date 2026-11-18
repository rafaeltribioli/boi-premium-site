# Rafael Virtual — assistente com IA da Boi Premium

Implementação da SPEC 1.0 (17/11/2026) no site www.premiumcarnes.com.br.

## Como funciona

```
navegador (GitHub Pages, premiumcarnes.com.br)
   └─ POST https://boi-premium-assistente.<subdominio>.workers.dev/api/assistente
         └─ Cloudflare Worker (servidor/worker.js) ── chave ANTHROPIC_API_KEY só aqui
               └─ Claude (claude-haiku-5-5) com ferramentas restritas
                     └─ motor determinístico (assistente/motor.js) + catálogo (dados/catalogo.json)
               ◄─ resposta estruturada: mensagem, pergunta, propostas validadas pelo servidor
```

- **Por que um Worker?** O GitHub Pages só serve arquivos estáticos; a chave da IA não pode ficar no navegador. O site, o domínio e o provedor do site **não mudam**. O Worker é um serviço separado, no plano gratuito da Cloudflare.
- **O modelo não decide preço.** Ele só escolhe quais ferramentas chamar. Preço, arredondamento (100 g), orçamento, restrições, osso e kits são calculados pelo motor com o catálogo do servidor. Mensagem do modelo sem proposta validada nunca vira item da lista.
- **Adicionar à lista exige clique** do cliente e usa a mesma lista dos kits (`window.BoiLista` no `index.html`). O WhatsApp só abre com o texto para o cliente revisar e enviar.
- **Sem configuração** (ou com erro/tempo esgotado): aparece "Assistente com IA temporariamente indisponível" e uma **Calculadora Boi Premium (sem IA)**, com o mesmo motor e os mesmos preços. Ela nunca é chamada de IA.

## Arquivos

| Arquivo | Para quê |
|---|---|
| `index.html` | Bloco "Seu churrasco começa com uma boa escolha." no topo; lista em centavos/gramas; ponte `BoiLista` |
| `assistente/config.js` | Configuração pública: WhatsApp e **endereço do Worker** (`endpoint`) |
| `assistente/rafael-virtual.js` / `.css` | Interface (chat, propostas, calculadora, revisão do WhatsApp) |
| `assistente/motor.js` | Cálculo determinístico (usado no servidor e na calculadora) |
| `dados/catalogo.json` | Catálogo enriquecido (gerado por `scripts/gerar-catalogo.mjs`) |
| `dados/importado/` | Arquivos recebidos: JSON/CSV de 17/11/2026 e PDF de 29/10/2026 |
| `servidor/` | Worker: `worker.js` (HTTP, validação, limites), `ia.js` (laço com o modelo), `ferramentas.js`, `prompt.js`, `wrangler.toml` |
| `assets/avatar-rafael.png` | Avatar aprovado (original, intacto) + versões WebP otimizadas |
| `.github/workflows/assistente.yml` | Testes e publicação automática do Worker (quando os segredos existirem) |
| `.env.example` | Nomes das configurações, sem valores |

## O que falta para a IA real funcionar (passo a passo)

Nada disso pode ser feito por mim: são contas e chaves suas. Não mande chaves pelo chat.

1. **Chave da Anthropic** — em https://platform.claude.com, crie uma conta de API, cadastre forma de pagamento (é cobrança separada da assinatura do Claude), crie uma API key e defina um limite mensal de gasto.
2. **Conta na Cloudflare** (grátis) — em https://dash.cloudflare.com. Anote o *Account ID* (aparece na página Workers & Pages) e crie um *API Token* com o modelo "Edit Cloudflare Workers".
3. **Segredos no GitHub** — no repositório `boi-premium-site` → Settings → Secrets and variables → Actions → *New repository secret*: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` e `ANTHROPIC_API_KEY`.
4. **Publicar o Worker** — Actions → "Rafael Virtual — testes e publicação do serviço de IA" → *Run workflow* (na branch main). O log mostra o endereço `https://boi-premium-assistente.<subdominio>.workers.dev`.
5. **Ligar o site ao Worker** — em `assistente/config.js`, preencher `endpoint: 'https://boi-premium-assistente.<subdominio>.workers.dev'` e publicar (commit na main).
6. **Verificar** — abrir `https://boi-premium-assistente.<subdominio>.workers.dev/api/saude`: deve mostrar `"ia_configurada":true`. Depois testar no site com "10 adultos, 4 crianças, até R$ 350 e sem porco".

Alternativa sem GitHub Actions (no Mac): `cd servidor && npx wrangler login && npx wrangler deploy && npx wrangler secret put ANTHROPIC_API_KEY`.

## Modelo e custo

- Modelo padrão: `claude-haiku-5-5` (mais rápido e barato da linha atual; troque em `MODELO_IA`). Preço oficial consultado em 17/11/2026: a partir de US$ 0,10 por milhão de tokens de entrada e US$ 0,50 de saída (prompts até 100 mil tokens).
- Estimativa por mensagem do cliente: 2 a 5 chamadas ao modelo, ~15–30 mil tokens de entrada e ~1–2 mil de saída → **cerca de US$ 0,002 a 0,004**. Mil conversas de 5 mensagens ≈ US$ 10–20. É estimativa; acompanhe o consumo real no console da Anthropic.
- Chamada direta à Messages API via `fetch` (sem SDK, sem dependências no Worker).

## Segurança e limites (configuráveis em `servidor/wrangler.toml`)

- Origem permitida: `premiumcarnes.com.br`, `www.premiumcarnes.com.br`, `rafaeltribioli.github.io`.
- Limites: 20 mensagens/10 min por IP, 60/dia por conversa, 3000/dia no total (contadores em memória por instância — para limite rígido, crie também uma regra de Rate Limiting na Cloudflare). Até 6 chamadas ao modelo e 2048 tokens por resposta. Tempo máximo 20 s → fallback.
- Mensagem até 600 caracteres; histórico até 12 mensagens; corpo até 32 KB; HTML removido; tudo renderizado como texto.
- Catálogo e mensagens do cliente vão ao modelo marcados como **dados**, não instruções.
- Logs: só evento, status, duração, nº de chamadas e tokens. Nada de texto da conversa, IP ou dados pessoais. Retenção conforme a configuração de Observability da Cloudflare (pode ser desligada em `wrangler.toml`).
- Histórico do chat só na memória da página (some ao recarregar). Nenhum endereço ou telefone na URL do WhatsApp.
- Eventos de métrica (`assistant_open`, `flow_selected`, `proposal_shown`, `proposal_added`, `whatsapp_clicked`, `fallback_used`) são disparados como `CustomEvent('boi:analytics')` sem texto da conversa. O site não tem ferramenta de analytics nem banner de consentimento hoje, então nada é enviado a terceiros. Clique no WhatsApp não equivale a venda.

## Premissas comerciais (editáveis em `scripts/gerar-catalogo.mjs` → `parametros`)

Churrasco: adulto 400 g, criança 200 g de carne crua sem osso com acompanhamentos; apetite leve ×0,85 / alto ×1,2; poucos acompanhamentos ×1,15; 5 h ou mais ×1,1. Semana: 150 g por adulto por refeição (criança 75 g). Incremento 100 g, mínimo 300 g por item. Peças com osso não entram no peso de carne (não há fator de rendimento cadastrado).

## Auditoria de preços (17/11/2026)

Gerada com `node scripts/auditar-precos.mjs texto-do-pdf.txt`.

## Site atual (index.html) × catálogo

| Item no site | Site | Catálogo | Situação |
|---|---|---|---|
| Hambúrguer Gourmet de Fraldinha | R$ 59,90 | R$ 59,90 (SITE-001) | só no site (não está no PDF); mantido com preço do site |
| Kit Família | R$ 199,90 | R$ 199,90 (BP-076) | igual |
| Kit Compra do Mês | R$ 299,90 | R$ 299,90 (BP-081) | igual |
| Kit Casal | R$ 99,90 | R$ 99,90 (BP-078) | igual |
| Kit Fitness | R$ 149,90 | R$ 149,90 (BP-077) | igual |
| Kit Fraldinha | R$ 129,90 | R$ 129,90 (BP-075) | igual |
| Kit Chorizo | R$ 149,90 | R$ 149,90 (BP-074) | igual |
| Kit Picanha | R$ 199,90 | R$ 199,90 (BP-073) | igual |
| Kit Tacho Gourmet | R$ 119,90 | R$ 119,90 (BP-080) | igual |
| Kit Feijoada Gourmet Premium | R$ 99,90 | R$ 99,90 (BP-079) | igual |

## PDF (data-base 29/10/2026) × catálogo

| Produto | PDF | Catálogo | Situação |
|---|---|---|---|
| Kit Fraldinha | R$ 119,90 | R$ 129,90 | diferente — confirmação do proprietário em 17/11/2026 prevalece |

Demais 80 itens do PDF: preço igual ao catálogo.

Observações:
- **Hambúrguer Gourmet de Fraldinha (R$ 59,90/kg)** está no site mas não no PDF nem no JSON importado. Mantido fora dos 81 itens, como "extra do site", com ingredientes a confirmar (fica fora de recomendações com restrição).
- Composição dos 9 kits copiada do site e conferida: a soma bate com o total declarado em todos. Kit Família e Kit Compra do Mês têm 1 calabresa sem peso informado; o Kit Compra do Mês inclui 500 g de batata palito (não conta como carne). Todos os kits contêm porco → excluídos em "sem porco".
- "Kit do Mês" (PDF) = "Kit Compra do Mês" (site), mesmo SKU (BP-081).
- Carvão e pão de alho avulsos não têm preço cadastrado: o assistente oferece consultar a equipe.
- Estoque: `nao_integrado` em tudo → "sujeito à confirmação".

## Testes

```
node --test testes/*.test.mjs                 # motor + servidor (modelo simulado)
python3 -m http.server 8080 &                 # site local
node testes/e2e/servidor-local.mjs 8787 http://localhost:8080 &
python3 testes/e2e/navegador.py               # Chrome em 360/390/768/1440 px
```

Os testes de servidor e de navegador usam um **modelo simulado**: comprovam o encadeamento, a validação e a interface, mas não a qualidade das respostas do Claude real. Isso só pode ser testado depois da etapa 6 acima.
