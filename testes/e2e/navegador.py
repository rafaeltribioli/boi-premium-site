"""Teste de navegador (Playwright + Chrome) do Rafael Virtual.
Pré-requisitos: site servido em http://localhost:8080 e, para o modo IA, o worker local com modelo
simulado em http://localhost:8787 (testes/e2e/servidor-local.mjs). Uso: python3 testes/e2e/navegador.py
"""
import json, re, sys, os
from playwright.sync_api import sync_playwright

SITE = 'http://localhost:8080/index.html'
SAIDA = os.environ.get('SAIDA_CAPTURAS', '/tmp/capturas')
os.makedirs(SAIDA, exist_ok=True)
falhas = []

def checar(cond, msg):
    print(('OK   ' if cond else 'FALHA ') + msg)
    if not cond: falhas.append(msg)

def config_com_endpoint(route, endpoint):
    corpo = route.fetch().text().replace("endpoint: ''", f"endpoint: '{endpoint}'")
    route.fulfill(body=corpo, headers={'content-type': 'application/javascript'})

with sync_playwright() as p:
    nav = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])

    # 1) Larguras e ordem dos blocos
    for largura in (360, 390, 768, 1440):
        pg = nav.new_page(viewport={'width': largura, 'height': 860})
        erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(SITE); pg.wait_for_load_state('networkidle')
        sw = pg.evaluate('document.documentElement.scrollWidth'); iw = pg.evaluate('innerWidth')
        checar(sw <= iw, f'{largura}px sem rolagem horizontal ({sw} <= {iw})')
        ordem = pg.evaluate("""() => { const t = id => document.querySelector(id).getBoundingClientRect().top + scrollY;
            return [t('#inicio'), t('#boi-premium'), t('#videos'), t('#kits')]; }""")
        checar(ordem == sorted(ordem), f'{largura}px: Rafael Virtual antes do vídeo, dos vídeos e do catálogo')
        cta = pg.locator('.rv-cta').bounding_box()
        checar(cta['y'] + cta['height'] <= 860, f'{largura}px: CTA visível sem rolar (y={int(cta["y"])})')
        fs = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.rv-sub')).fontSize)")
        checar(fs >= 16, f'{largura}px: texto do subtítulo >= 16px ({fs})')
        if largura <= 750:
            checar(pg.locator('.rv-rosto').is_visible(), f'{largura}px: avatar compacto com rosto visível')
        else:
            checar(pg.locator('.rv-figura img').is_visible(), f'{largura}px: avatar aprovado visível à direita')
        pg.screenshot(path=f'{SAIDA}/topo-{largura}.png')
        checar(not erros, f'{largura}px: sem erros de JavaScript {erros}')
        pg.close()

    # 2) Sem configuração: fallback honesto + calculadora sem IA + lista + WhatsApp
    pg = nav.new_page(viewport={'width': 390, 'height': 844})
    erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.add_init_script("window.__abertos=[];window.open=(u)=>{window.__abertos.push(u);return null}")
    pg.goto(SITE); pg.wait_for_load_state('networkidle')
    pg.locator('#kit-fraldinha .add').click()  # escolha anterior do cliente
    pg.keyboard.press('Tab')
    pg.locator('.rv-cta').focus(); pg.keyboard.press('Enter')
    pg.wait_for_selector('#rv-painel:not([hidden])')
    aviso = pg.locator('#rv-aviso').inner_text()
    checar('Assistente com IA temporariamente indisponível' in aviso, 'fallback mostra "Assistente com IA temporariamente indisponível"')
    checar('sem IA' in pg.locator('#rv-modo').inner_text(), 'selo indica calculadora sem IA')
    checar(pg.locator('#rv-calc').is_visible(), 'calculadora visível')
    pg.fill('#rv-c-adultos', '10'); pg.fill('#rv-c-criancas', '4'); pg.fill('#rv-c-orcamento', '350')
    pg.check('#rv-c-semporco')
    pg.click('text=Calcular sugestões (sem IA)')
    pg.wait_for_selector('.rv-prop')
    props = pg.locator('.rv-prop')
    checar(props.count() == 2, 'duas propostas na calculadora')
    titulos = [props.nth(i).locator('h3').inner_text() for i in range(props.count())]
    checar(titulos == ['Melhor custo-benefício', 'Seleção premium'], f'títulos {titulos}')
    texto_props = pg.locator('#rv-propostas').inner_text()
    checar('Panceta' not in texto_props and 'Copa-lombo' not in texto_props, 'sem porco respeitado')
    checar('4,8 kg' in texto_props, 'peso de carne 4,8 kg exibido')
    totais = [float(t.replace('R$', '').replace('.', '').replace(',', '.').strip()) for t in pg.locator('.rv-total').all_inner_texts()]
    checar(all(t <= 350 for t in totais), f'totais dentro do orçamento {totais}')
    pg.screenshot(path=f'{SAIDA}/calculadora-390.png', full_page=False)
    # trocar item recalcula
    primeiro = props.nth(0).locator('.rv-nome').first.inner_text()
    props.nth(0).locator('.rv-tirar').first.click()
    pg.wait_for_timeout(300)
    checar(primeiro.split('· ')[1] not in pg.locator('.rv-prop').nth(0).locator('.rv-itens').inner_text(), f'troca removeu "{primeiro}" e recotou')
    # adicionar sem duplicar
    pg.locator('.rv-prop').nth(0).locator('.rv-primario').click()
    pg.wait_for_timeout(300)
    btn = pg.locator('.rv-prop').nth(0).locator('.rv-primario')
    checar(btn.is_disabled(), 'botão desabilitado após adicionar (sem duplicar no retry)')
    n_lista = pg.evaluate('BoiLista.linhas().length')
    nomes = pg.evaluate('BoiLista.linhas().map(l=>l.nome)')
    checar('Kit Fraldinha' in nomes and n_lista >= 3, f'lista mantém kit anterior e recebe itens: {nomes}')
    btn.click(force=True); pg.wait_for_timeout(200)
    checar(pg.evaluate('BoiLista.linhas().length') == n_lista, 'clique repetido não duplica')
    pg.click('text=Revisar e pedir no WhatsApp')
    msg = pg.locator('#rv-fechamento textarea').input_value()
    checar('Kit Fraldinha' in msg and 'Subtotal estimado' in msg and 'sem porco' in msg, 'mensagem com produtos, total e restrição')
    checar('peso final' in msg and 'prazo e taxa' in msg, 'mensagem pede confirmação de peso, frete e prazo')
    href = pg.locator('.rv-whats').get_attribute('href')
    checar(href.startswith('https://wa.me/5519993497099?text='), 'link do WhatsApp com número da loja')
    checar(pg.evaluate('window.__abertos.length') == 0, 'nada é enviado/aberto automaticamente')
    checar(not re.search(r'endere|cpf', href, re.I), 'sem dados pessoais na URL')
    pg.click('#send')
    url = pg.evaluate('window.__abertos[0]')
    checar(url and 'Kit%20Fraldinha' in url, 'botão da lista atual continua abrindo o WhatsApp')
    pg.keyboard.press('Escape')
    checar(pg.locator('#rv-painel').is_hidden(), 'Esc fecha o painel')
    checar(pg.evaluate("document.activeElement.classList.contains('rv-cta')"), 'foco volta ao CTA')
    # hambúrguer e kits continuam funcionando
    pg.fill('#burger-weight', '0.5'); pg.click('#add-burger')
    checar('0,5 kg de Hambúrguer' in pg.locator('#selected').inner_text(), 'hambúrguer por kg continua funcionando')
    checar(pg.evaluate("BoiLista.linhas().find(l=>l.nome.startsWith('Hamb')).subtotalCentavos") == 2995, '0,5 kg × R$ 59,90 = R$ 29,95')
    checar(not erros, f'sem erros JS no fluxo de fallback {erros}')
    pg.close()

    # 3) Modo IA (worker real + modelo simulado)
    pg = nav.new_page(viewport={'width': 1440, 'height': 900})
    erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.route('**/assistente/config.js', lambda r: config_com_endpoint(r, 'http://localhost:8787'))
    pg.goto(SITE); pg.wait_for_load_state('networkidle')
    pg.click('.rv-cta')
    pg.wait_for_selector('.rv-msg.ia')
    log = pg.locator('#rv-log').inner_text()
    checar('Olá! Sou o Rafael Virtual, assistente com IA da Boi Premium. Vamos montar seu churrasco ou as carnes da semana?' in log, 'mensagem inicial da SPEC')
    checar('Assistente com IA' in pg.locator('#rv-modo').inner_text(), 'selo de IA ativo')
    pg.fill('#rv-entrada', '10 adultos, 4 crianças, até R$ 350 e sem porco')
    pg.press('#rv-entrada', 'Enter')
    pg.wait_for_selector('.rv-prop', timeout=10000)
    checar(pg.locator('.rv-prop').count() == 2, 'IA (simulada) devolve duas propostas validadas pelo servidor')
    checar('carvão' in pg.locator('#rv-log').inner_text(), 'pergunta de complemento uma vez')
    pg.screenshot(path=f'{SAIDA}/ia-1440.png')
    pg.locator('.rv-prop').nth(1).locator('.rv-primario').click(); pg.wait_for_timeout(300)
    checar(len(pg.evaluate('BoiLista.linhas()')) >= 3, 'proposta da IA entrou na lista do site')
    # timeout → fallback honesto, retry sem duplicar mensagem
    pg.fill('#rv-entrada', 'lento por favor'); pg.press('#rv-entrada', 'Enter')
    pg.wait_for_selector('.rv-retry', timeout=15000)
    checar(pg.locator('#rv-aviso').is_visible() and 'indisponível' in pg.locator('#rv-aviso').inner_text(), 'timeout mostra fallback honesto')
    antes = pg.locator('.rv-msg.cliente').count()
    pg.click('.rv-retry'); pg.wait_for_selector('.rv-retry', timeout=15000)
    checar(pg.locator('.rv-msg.cliente').count() == antes, 'tentar de novo não duplica a mensagem do cliente')
    checar(not erros, f'sem erros JS no modo IA {erros}')
    pg.close()
    nav.close()

print('\nRESULTADO:', 'tudo certo' if not falhas else f'{len(falhas)} falha(s)')
sys.exit(1 if falhas else 0)
