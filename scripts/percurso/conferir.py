# PROTÓTIPO da ferramenta de conferência visual (plano em docs/percursos/CONFERENCIA.md). Gera uma imagem de um
# trecho do percurso com: grafo OSM (ruas cinza, mão única com seta, ponte laranja, túnel roxo tracejado, caminho de
# pedestre fino), GPS original (pontos vermelhos numerados pela ordem), e embaixo o perfil de altitude GPS × terreno.
# Na etapa 2 entram o percurso ajustado e os sentidos de cada passagem. Não é usado pelo jogo.
#
# Uso: python3 scripts/percurso/conferir.py <dados/percursos/slug.json> <dados/grafos/slug.json> <rótulo> <km> <raio m>
#        <saida.png> [dados/relevo/slug.json]
import sys, json, math
from PIL import Image, ImageDraw, ImageFont

perc_arq, grafo_arq, rot, km, raio, saida = sys.argv[1:7]
relevo_arq = sys.argv[7] if len(sys.argv) > 7 and sys.argv[7] != '-' else None
casado_arq = sys.argv[8] if len(sys.argv) > 8 and sys.argv[8] != '-' else None  # dados/casados/slug.json (etapa 2)
modo = sys.argv[9] if len(sys.argv) > 9 else 'depois'  # 'antes' = traçado que o jogo usa hoje; 'depois' = ajustado ao OSM
km, raio = float(km), float(raio)
perc, grafo = json.load(open(perc_arq)), json.load(open(grafo_arq))
dist = next(d for d in perc['distancias'] if d['rotulo'] == rot)
p = dist['percurso']
lat0 = p[0][0]; kx, ky = 111320 * math.cos(math.radians(lat0)), 110540
xy = lambda la, lo: (lo * kx, la * ky)
# centro: ponto do GPS a `km` do início
s, centro = 0.0, xy(*p[0][:2])
acum = [0.0]
for i in range(1, len(p)):
    s += math.hypot(*(a - b for a, b in zip(xy(*p[i][:2]), xy(*p[i - 1][:2])))); acum.append(s)
for i in range(1, len(p)):
    if acum[i] >= km * 1000:
        f = (km * 1000 - acum[i - 1]) / ((acum[i] - acum[i - 1]) or 1)
        a, b = xy(*p[i - 1][:2]), xy(*p[i][:2]); centro = (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f); break
if km < 0:
    xs = [xy(*q[:2])[0] for q in p]; ys = [xy(*q[:2])[1] for q in p]
    centro = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2); raio = max(max(xs) - min(xs), max(ys) - min(ys)) / 2 * 1.15
W, H, MAPA = 900, 1180, 900
esc = MAPA / (2 * raio)
tela = lambda x, y: ((x - centro[0]) * esc + MAPA / 2, MAPA / 2 - (y - centro[1]) * esc)
im = Image.new('RGB', (W, H), (246, 247, 250)); g = ImageDraw.Draw(im)
try: f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14); fb = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 16)
except OSError: f = fb = ImageFont.load_default()

nos = grafo['nos']
def tracejado(pts, cor, larg, passo=10):
    for (a, b) in zip(pts, pts[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); n = max(1, int(L / passo))
        for k in range(0, n, 2):
            t0, t1 = k / n, min(1, (k + 1) / n)
            g.line([(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0), (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)], fill=cor, width=larg)
for camada in (-1, 0, 1, 2):  # desenha de baixo para cima
    for a in grafo['arestas']:
        if max(-1, min(2, a.get('camada', 0))) != camada: continue
        pts = [tela(*xy(*nos[n])) for n in a['nos']]
        if all(not (-50 < x < MAPA + 50 and -50 < y < MAPA + 50) for x, y in pts): continue
        if a.get('tunel'): tracejado(pts, (150, 90, 200), 6); continue
        cor, larg = ((240, 140, 40), 9) if a.get('ponte') else ((205, 208, 215), 3 if a.get('pe') else 8)
        g.line(pts, fill=cor, width=larg, joint='curve')
        if a['mao'] != 'dupla' and len(pts) >= 2 and km >= 0:  # seta no meio da aresta (só na visão de perto)
            i = len(pts) // 2 - (1 if len(pts) % 2 == 0 else 0); i = max(0, min(len(pts) - 2, i))
            (x1, y1), (x2, y2) = pts[i], pts[i + 1]
            if a['mao'] == 'volta': (x1, y1), (x2, y2) = (x2, y2), (x1, y1)
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2; L = math.hypot(x2 - x1, y2 - y1) or 1; ux, uy = (x2 - x1) / L, (y2 - y1) / L
            g.polygon([(mx + ux * 7, my + uy * 7), (mx - ux * 5 - uy * 5, my - uy * 5 + ux * 5), (mx - ux * 5 + uy * 5, my - uy * 5 - ux * 5)], fill=(90, 95, 110))
        if a.get('nome') and len(pts) > 1 and math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1]) > 140:
            x, y = pts[len(pts) // 2]
            if 0 < x < MAPA - 150 and 10 < y < MAPA - 10: g.text((x + 6, y - 8), a['nome'][:28], fill=(120, 124, 135), font=f)
# GPS original: linha fina + pontos numerados pela ordem
gp = [tela(*xy(*q[:2])) for q in p]
g.line(gp, fill=(230, 60, 60), width=1)
for i, (x, y) in enumerate(gp):
    if not (0 <= x <= MAPA and 0 <= y <= MAPA): continue
    if km < 0: continue
    g.ellipse([x - 4, y - 4, x + 4, y + 4], fill=(230, 60, 60))
    g.text((x + 5, y + 2), str(i), fill=(160, 30, 30), font=f)
casado = None
if casado_arq and modo == 'antes':
    hoje = json.load(open(casado_arq))['distancias'][rot]['linhaJogoHoje']
    g.line([tela(*xy(la, lo)) for la, lo in hoje], fill=(20, 150, 140), width=3 if km < 0 else 5, joint='curve')
if casado_arq and modo == 'depois':
    casado = json.load(open(casado_arq))['distancias'][rot]
    L = casado['linha']; tot = L[-1][2] or 1
    pts_c = [(tela(*xy(la, lo)), sm) for la, lo, sm in L]
    # cor pela ordem na corrida (azul no começo → magenta no fim): passagens repetidas ficam com cores diferentes
    def cor(sm):
        t = sm / tot
        return (int(30 + 200 * t), int(110 - 80 * t), int(230 - 30 * t))
    larg = 3 if km < 0 else 5
    for (a, sa), (b, sb) in zip(pts_c, pts_c[1:]):
        g.line([a, b], fill=cor(sa), width=larg)
    # setas de sentido a cada ~120 m (visão de perto) ou ~1 km (geral)
    passo = 1000 if km < 0 else 60
    prox = passo
    for (a, sa), (b, sb) in zip(pts_c, pts_c[1:]):
        if sb < prox or sb == sa: continue
        prox += passo
        L2 = math.hypot(b[0] - a[0], b[1] - a[1]) or 1; ux, uy = (b[0] - a[0]) / L2, (b[1] - a[1]) / L2
        mx, my = b; k = 9 if km >= 0 else 7
        g.polygon([(mx + ux * k, my + uy * k), (mx - ux * k - uy * k * 0.7, my - uy * k + ux * k * 0.7), (mx - ux * k + uy * k * 0.7, my - uy * k - ux * k * 0.7)], fill=cor(sa), outline=(255, 255, 255))
        if km >= 0: g.text((mx + 8, my - 18), f'{sb/1000:.2f}', fill=cor(sa), font=f)
    # trechos sem casamento (método alternativo) em vermelho tracejado
    for ps in casado['passagens']:
        if not ps.get('semCasamento'): continue
        seg = [pt for pt, sm in pts_c if ps['sDe'] * 1000 - 1 <= sm <= ps['sAte'] * 1000 + 1]
        tracejado(seg, (230, 30, 30), 8, 6)
g.rectangle([0, 0, W, 30], fill=(255, 255, 255))
titulo = {'antes': 'ANTES (jogo hoje)', 'depois': 'DEPOIS (ajustado ao OSM)'}[modo] if casado_arq else 'grafo OSM + GPS original (ordem)'
g.text((10, 6), f'{perc["slug"][:34]} · {rot} · ' + ('percurso inteiro' if km < 0 else f'km {km:.2f} · raio {raio:.0f} m') + f' · {titulo}', fill=(20, 30, 60), font=fb)
g.rectangle([0, MAPA - 30, W, MAPA], fill=(255, 255, 255))
g.text((10, MAPA - 24), 'cinza: rua OSM (seta=mão única) · laranja: ponte · vermelho: GPS' + (' · verde-água: traçado do jogo hoje' if modo == 'antes' and casado_arq else ' · azul→magenta: ajustado (seta=sentido, nº=km)' if casado_arq else ''), fill=(60, 60, 70), font=f)
# perfil de altitude. dados/elevacao/slug.json (etapa 2): três séries separadas ao longo do traçado ajustado;
# dados/relevo/slug.json (etapa 1): GPS × terreno ao longo do GPS
if relevo_arq:
    rel = json.load(open(relevo_arq))
    g.rectangle([0, MAPA, W, H], fill=(255, 255, 255))
    y0, y1 = MAPA + 40, H - 20
    if 'distancias' in rel:
        el = rel['distancias'][rot]; serie = el['serie']; res = el['resumo']
        aviso = '' if res['altitudeGpsCoerente'] else f'  ⚠ GPS INCOERENTE (erro médio {res["erroMedioM"]} m)'
        g.text((10, MAPA + 8), 'Elevação no traçado ajustado: GPS (vermelho) · terreno suavizado (verde) · terreno bruto (cinza) · ponte (laranja)', fill=(20, 30, 60), font=f)
        g.text((10, MAPA + 24), f'subida GPS {res["subidaGpsM"]} m · terreno {res["subidaTerrenoSuaveM"]} m' + aviso, fill=(200, 40, 40) if aviso else (60, 60, 70), font=fb if aviso else f)
        vals = [v for l in serie for v in (l['gps'], l['terreno'])]
        mn, mx = min(vals) - 2, max(vals) + 2; tot = serie[-1]['km'] or 1
        X = lambda k: 50 + (W - 60) * k / tot
        Y = lambda v: y1 - (y1 - y0) * (v - mn) / ((mx - mn) or 1)
        if km >= 0: g.rectangle([X(km - raio / 1000), y0 + 10, X(km + raio / 1000), y1], fill=(235, 240, 255))
        for k0, k1 in res['trechosGpsIncoerentesKm']: g.rectangle([X(k0), y0 + 10, X(k1), y0 + 16], fill=(240, 120, 120))
        for l in serie:
            if l['estrutura']: g.line([(X(l['km']), Y(l['terrenoBruto'])), (X(l['km']), Y(l['terreno']))], fill=(240, 140, 40), width=4)
        g.line([(X(l['km']), Y(l['terrenoBruto'])) for l in serie], fill=(190, 190, 195), width=1)
        g.line([(X(l['km']), Y(l['terreno'])) for l in serie], fill=(60, 160, 80), width=2)
        g.line([(X(l['km']), Y(l['gps'])) for l in serie], fill=(220, 50, 50), width=2)
        g.text((4, y0 + 6), f'{mx:.0f}', fill=(90, 90, 90), font=f); g.text((4, y1 - 16), f'{mn:.0f}', fill=(90, 90, 90), font=f)
        for k in range(0, int(tot) + 1, 5 if tot > 12 else 1): g.text((X(k) - 4, y1 + 2), str(k), fill=(120, 120, 120), font=f)
    else:
        linhas = rel.get('_linhas', {}).get(rot, [])
        g.text((10, MAPA + 8), 'Altitude: GPS (vermelho) × terreno (verde); laranja = sobre ponte do grafo', fill=(20, 30, 60), font=fb)
        if linhas:
            mn = min(min(l['gps'], l['terreno']) for l in linhas); mx = max(max(l['gps'], l['terreno']) for l in linhas)
            tot = linhas[-1]['km'] or 1
            X = lambda k: 10 + (W - 20) * k / tot
            Y = lambda v: y1 - (y1 - y0) * (v - mn) / ((mx - mn) or 1)
            g.rectangle([X(km - raio / 1000), y0, X(km + raio / 1000), y1], fill=(235, 240, 255))
            for l in linhas:
                if l['ponte']: g.line([(X(l['km']), y0), (X(l['km']), y1)], fill=(250, 200, 150), width=2)
            g.line([(X(l['km']), Y(l['terreno'])) for l in linhas], fill=(60, 160, 80), width=2)
            g.line([(X(l['km']), Y(l['gps'])) for l in linhas], fill=(220, 50, 50), width=2)
            g.text((10, y0 - 2), f'{mx:.0f} m', fill=(90, 90, 90), font=f); g.text((10, y1 - 16), f'{mn:.0f} m', fill=(90, 90, 90), font=f)
im.save(saida)
print('gravado', saida)
