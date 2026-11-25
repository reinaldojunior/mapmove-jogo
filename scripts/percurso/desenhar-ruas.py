# Etapa 4a: imagens vistas de cima, desenho ATUAL (o de produção, montado com src/faixas.js) × NOVO (ruas do OSM),
# lado a lado, nos pontos que importam (largada, retornos, ponte, fallback da Alameda CIESP, avenidas, maiores
# alargamentos, degraus de altura). Não é usado pelo jogo.
# Uso: python3 scripts/percurso/desenhar-ruas.py <pasta do --atual de exportar-ruas.mjs> <pasta de saída>
import sys, os, json, math, glob
from PIL import Image, ImageDraw, ImageFont

pasta_atual, saida = sys.argv[1], sys.argv[2]
os.makedirs(saida, exist_ok=True)
RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
try:
    F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 13); FB = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 15)
except OSError:
    F = FB = ImageFont.load_default()
FUNDO = (226, 232, 220)
COR_ATUAL = {'grama': (150, 196, 120), 'calcada': (214, 205, 186), 'calcadaLisa': (214, 205, 186), 'guia': (190, 190, 190), 'canteiro': (150, 196, 120),
             'rua': (92, 96, 104), 'ruaFaixas': (92, 96, 104), 'ruaOutra': (92, 96, 104)}
ORDEM_ATUAL = ['grama', 'canteiro', 'calcada', 'calcadaLisa', 'guia', 'rua', 'ruaFaixas', 'ruaOutra']
COR_NOVO = {'calcada': (214, 205, 186), 'fitaCalcada': (200, 170, 220), 'alargamentoCalcada': (236, 190, 150), 'asfalto': (92, 96, 104), 'cruzamento': (92, 96, 104),
            'fita': (120, 90, 150), 'alargamento': (150, 82, 82), 'pintura': (245, 245, 245), 'pinturaAmarela': (240, 196, 40), 'azul': (40, 110, 240)}
ORDEM_NOVO = ['calcada', 'fitaCalcada', 'alargamentoCalcada', 'asfalto', 'cruzamento', 'alargamento', 'fita', 'pintura', 'pinturaAmarela', 'azul']
N, PAINEL = 620, 620

def painel(c, raio, desenhar):
    im = Image.new('RGB', (N, N), FUNDO); g = ImageDraw.Draw(im)
    esc = N / (2 * raio)
    tela = lambda x, z: ((x - c[0]) * esc + N / 2, (z - c[1]) * esc + N / 2)
    desenhar(g, tela, esc)
    return im

def dentro(pts, c, raio):
    return any(abs(x - c[0]) < raio * 1.1 and abs(z - c[1]) < raio * 1.1 for x, z in pts)

for arq in sorted(glob.glob(os.path.join(pasta_atual, '*.json'))):
    if arq.endswith('.novo.json'): continue
    nome = os.path.basename(arq)[:-5]
    slug, rot = nome.rsplit('-', 1)
    extra = json.load(open(arq))
    novo = json.load(open(os.path.join(RAIZ, 'dados/ruas', slug, f'{rot}.json')))
    novo['triangulos'] = json.load(open(arq[:-5] + '.novo.json'))['triangulos']
    res = novo['resumo']
    eixo = extra['eixoNovo']  # [x, z, s]
    em = lambda s: min(eixo, key=lambda q: abs(q[2] - s))
    # pontos a mostrar
    pontos = [('largada', 40)]
    for k in res['cones']: pontos.append((f'retorno km {k:.2f}', k * 1000))
    for a, b in res['fallbackS']: pontos.append(('fallback (ligação que falta no OSM)', (a + b) / 2))
    for a, b in res['viadutosDoJogo']: pontos.append(('viaduto do jogo', (a + b) / 2))
    larg = sorted([x for x in novo['alargamentos'] if x['tipo'] == 'asfalto'], key=lambda x: -x['m'])[:2]
    for x in larg: pontos.append((f"alargado: {x['rua'] or '?'}", (x['s0'] + x['s1']) / 2))
    if res['degrauKm']: pontos.append(('maior degrau de altura', res['degrauKm'][len(res['degrauKm']) // 2] * 1000))
    escolhidos = []
    for rot_p, s in pontos:
        if all(abs(s - s2) > 150 for _, s2 in escolhidos): escolhidos.append((rot_p, s))
    escolhidos = escolhidos[:7]
    # triângulos
    tn = []
    for chave, v in novo['triangulos'].items():
        tipo, camada = chave.split(':')
        for i in range(0, len(v), 12):
            tn.append((tipo, int(camada), [(v[i], v[i + 1]), (v[i + 4], v[i + 5]), (v[i + 8], v[i + 9])], (v[i + 3] + v[i + 7] + v[i + 11]) / 3))
    ta = []
    for tipo, v in (extra['atual'] or {})['porTipo'].items():
        for i in range(0, len(v), 3): ta.append((tipo, [tuple(v[i]), tuple(v[i + 1]), tuple(v[i + 2])]))
    for k, (rot_p, s) in enumerate(escolhidos):
        q = em(s); c = (q[0], q[1]); raio = 95
        def contexto(g, tela, esc):
            for l in extra['grafo']:
                if dentro(l, c, raio): g.line([tela(*p) for p in l], fill=(200, 205, 195), width=1)
        def d_atual(g, tela, esc):
            contexto(g, tela, esc)
            for tipo in ORDEM_ATUAL:
                for t, pts in ta:
                    if t == tipo and dentro(pts, c, raio): g.polygon([tela(*p) for p in pts], fill=COR_ATUAL[tipo])
            ex = extra['atual']['eixo']
            g.line([tela(*p) for p in ex if abs(p[0] - c[0]) < raio * 1.3 and abs(p[1] - c[1]) < raio * 1.3], fill=(255, 255, 255), width=1)
        def d_novo(g, tela, esc):
            contexto(g, tela, esc)
            for camada in (0, 1):
                for tipo in ORDEM_NOVO:
                    for t, cam, pts, alfa in tn:
                        if t != tipo or cam != camada or not dentro(pts, c, raio): continue
                        cor = COR_NOVO[tipo]
                        if alfa < 0.999: cor = tuple(int(FUNDO[j] + (cor[j] - FUNDO[j]) * max(0, alfa)) for j in range(3))  # toco sumindo
                        if camada == 1 and tipo in ('asfalto', 'cruzamento'): cor = (70, 74, 84)
                        g.polygon([tela(*p) for p in pts], fill=cor)
            for cone in extra['cones']:
                for x, z in cone['pts']:
                    if abs(x - c[0]) < raio and abs(z - c[1]) < raio:
                        X, Z = tela(x, z); g.ellipse([X - 3, Z - 3, X + 3, Z + 3], fill=(255, 120, 0), outline=(120, 50, 0))
        A, B = painel(c, raio, d_atual), painel(c, raio, d_novo)
        im = Image.new('RGB', (2 * N + 10, N + 64), (255, 255, 255)); g = ImageDraw.Draw(im)
        im.paste(A, (0, 40)); im.paste(B, (N + 10, 40))
        titulo = f'{slug[:30]} · {rot} · km {s / 1000:.2f} · {rot_p}'
        g.text((8, 6), titulo, fill=(20, 30, 60), font=FB)
        g.text((8, 24), 'ATUAL (produção: fita de 8 m pelo GPS)', fill=(60, 60, 70), font=F)
        g.text((N + 18, 24), 'NOVO (ruas do OSM; vermelho = asfalto alargado, laranja = calçada alargada, roxo = fallback)', fill=(60, 60, 70), font=F)
        # escala
        esc = N / (2 * raio); g.line([(10, N + 52), (10 + 20 * esc, N + 52)], fill=(0, 0, 0), width=3); g.text((16 + 20 * esc, N + 44), '20 m', fill=(0, 0, 0), font=F)
        g.text((N + 18, N + 44), 'linha azul = caminho do corredor (etapa 3) · bolinhas laranja = cones do retorno · cinza claro = ruas do mapa', fill=(60, 60, 70), font=F)
        arq_img = os.path.join(saida, f"{'s' if 'sorocaba' in slug else 'i'}{rot.lower()}-{k + 1}.jpg")
        im.save(arq_img, quality=84)
        print(arq_img, '·', rot_p)
