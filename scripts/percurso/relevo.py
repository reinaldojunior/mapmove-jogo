# Investigação (etapa 1): altitude do GPS × modelo de terreno público, ao longo do percurso e nas pontes do grafo.
# Objetivo: saber se dá para usar um modelo de terreno para o chão SEM confundir com a altura de estruturas
# (ponte, viaduto, túnel). Não é usado pelo jogo.
#
# Uso: python3 scripts/percurso/relevo.py <dados/percursos/slug.json> <dados/grafos/slug.json> <pasta de cache> [saida.json]
# Fonte do terreno: blocos "terrarium" (AWS Open Data, elevation-tiles-prod), zoom 14 (~9 m por pixel em -23°),
# altura = R·256 + G + B/256 − 32768 (m). Por baixo é SRTM 30 m e outras fontes: mede o "teto" do terreno com
# alguma vegetação/prédio, e não enxerga tabuleiro de ponte (mostra o vale/rio) — é isso que este script confere.
import sys, os, json, math, subprocess, statistics
from PIL import Image

perc_arq, grafo_arq, cache = sys.argv[1], sys.argv[2], sys.argv[3]
saida = sys.argv[4] if len(sys.argv) > 4 else None
os.makedirs(cache, exist_ok=True)
Z = 14
blocos = {}
def bloco(tx, ty):
    k = (tx, ty)
    if k not in blocos:
        f = f'{cache}/{Z}_{tx}_{ty}.png'
        if not os.path.exists(f):
            subprocess.run(['curl', '-sS', '--max-time', '60', '-o', f, f'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{Z}/{tx}/{ty}.png'], check=False)
        blocos[k] = Image.open(f).convert('RGB')
    return blocos[k]
def terreno(lat, lon):
    n = 2 ** Z
    fx = (lon + 180) / 360 * n * 256
    fy = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n * 256
    x0, y0 = math.floor(fx - 0.5), math.floor(fy - 0.5)
    ax, ay = fx - 0.5 - x0, fy - 0.5 - y0
    def h(px, py):
        im = bloco(px // 256, py // 256)
        r, g, b = im.getpixel((px % 256, py % 256))
        return r * 256 + g + b / 256 - 32768
    return (h(x0, y0) * (1 - ax) * (1 - ay) + h(x0 + 1, y0) * ax * (1 - ay) + h(x0, y0 + 1) * (1 - ax) * ay + h(x0 + 1, y0 + 1) * ax * ay)

perc = json.load(open(perc_arq)); grafo = json.load(open(grafo_arq))
lat0 = perc['distancias'][0]['percurso'][0][0]
kx, ky = 111320 * math.cos(math.radians(lat0)), 110540
nos = grafo['nos']
pontes = [a for a in grafo['arestas'] if a.get('ponte')]
def perto_de_ponte(la, lo, lim=12):
    for a in pontes:
        g = [nos[n] for n in a['nos']]
        for p, q in zip(g, g[1:]):
            ax_, ay_, bx, by = p[1] * kx, p[0] * ky, q[1] * kx, q[0] * ky
            px, py = lo * kx, la * ky
            vx, vy = bx - ax_, by - ay_; l2 = vx * vx + vy * vy or 1
            t = max(0, min(1, ((px - ax_) * vx + (py - ay_) * vy) / l2))
            if math.hypot(px - ax_ - t * vx, py - ay_ - t * vy) < lim: return a
    return None

resultado = {}
for d in perc['distancias']:
    p = d['percurso']
    amostras, s = [], 0.0
    for i in range(len(p) - 1):
        (a1, o1, e1), (a2, o2, e2) = p[i][:3], p[i + 1][:3]
        L = math.hypot((a2 - a1) * ky, (o2 - o1) * kx); n = max(1, int(L / 25))
        for k in range(n):
            f = k / n
            amostras.append((s + L * f, a1 + (a2 - a1) * f, o1 + (o2 - o1) * f, e1 + (e2 - e1) * f))
        s += L
    linhas = []
    for (sm, la, lo, eg) in amostras:
        et = terreno(la, lo); pt = perto_de_ponte(la, lo)
        linhas.append({'km': round(sm / 1000, 3), 'gps': round(eg, 1), 'terreno': round(et, 1), 'dif': round(eg - et, 1), 'ponte': (pt.get('nome') or f"ponte sem nome (via {pt['via']})") if pt else None})
    chao = [l['dif'] for l in linhas if not l['ponte']]
    ponte = [l for l in linhas if l['ponte']]
    # deslocamento fixo entre as duas fontes (geóide/modelo): mediana da diferença no chão
    off = statistics.median(chao)
    dif_chao = [abs(v - off) for v in chao]
    def subida(vals):
        return round(sum(max(0, b - a) for a, b in zip(vals, vals[1:])), 0)
    res = {
        'amostras': len(linhas), 'deslocamentoMedianoM': round(off, 1),
        'chao': {'erroMedioM': round(statistics.mean(dif_chao), 1), 'p95M': round(sorted(dif_chao)[int(len(dif_chao) * 0.95)], 1), 'maxM': round(max(dif_chao), 1)},
        'subidaGpsM': subida([l['gps'] for l in linhas]), 'subidaTerrenoM': subida([l['terreno'] for l in linhas]),
        'faixaGps': [min(l['gps'] for l in linhas), max(l['gps'] for l in linhas)],
        'faixaTerreno': [min(l['terreno'] for l in linhas), max(l['terreno'] for l in linhas)],
        'pontes': [],
    }
    # cada passagem por ponte: GPS (tabuleiro, se o relógio gravou bem) × terreno (vale) − deslocamento
    grupos, atual = [], []
    for l in linhas:
        if l['ponte']: atual.append(l)
        elif atual: grupos.append(atual); atual = []
    if atual: grupos.append(atual)
    for gr in grupos:
        res['pontes'].append({'nome': gr[0]['ponte'], 'km': [gr[0]['km'], gr[-1]['km']],
                              'gpsMenosTerrenoM': [round(l['dif'] - off, 1) for l in gr],
                              'terrenoM': [l['terreno'] for l in gr], 'gpsM': [l['gps'] for l in gr]})
    resultado[d['rotulo']] = res
    resultado.setdefault('_linhas', {})[d['rotulo']] = linhas  # amostras a cada 25 m (para a conferência visual)
    print(d['rotulo'], json.dumps({k: v for k, v in res.items() if k != 'pontes'}, ensure_ascii=False))
    for pt in res['pontes']: print('   ponte', pt['nome'], 'km', pt['km'], 'GPS−terreno (m):', pt['gpsMenosTerrenoM'])
if saida:
    json.dump(resultado, open(saida, 'w'), ensure_ascii=False, separators=(',', ':'))
