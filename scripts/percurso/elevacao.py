# Etapa 2: elevação ao longo do percurso AJUSTADO (dados/casados), com três séries separadas, sem corrigir nada:
#   1. altitude do GPS (do Portal), levada para o km do traçado ajustado;
#   2. elevação do terreno (modelo público "terrarium", suavizado) — mascarada onde o percurso passa sobre ponte,
#      viaduto ou túnel (ali o modelo mostra o vale/rio ou o morro, não o chão por onde se corre);
#   3. altura da estrutura (ponte/viaduto): tabuleiro ligando as cabeceiras em linha reta, menos o terreno embaixo.
# Também mede se a altitude do GPS é coerente com o terreno; quando não é (ex.: Indaiatuba 21K) só marca o caso.
# Não é usado pelo jogo e não altera nenhuma prova.
#
# Uso: python3 scripts/percurso/elevacao.py <slug> <pasta de cache do terreno>
#   lê dados/percursos/<slug>.json e dados/casados/<slug>.json; grava dados/elevacao/<slug>.json
import sys, os, json, math, statistics, bisect, subprocess
from PIL import Image
slug, cache = sys.argv[1], sys.argv[2]
RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
os.makedirs(cache, exist_ok=True)

# terreno: mesma fonte e mesmo cache do relevo.py (blocos terrarium z14, interpolação bilinear)
Z, blocos = 14, {}
def bloco(tx, ty):
    if (tx, ty) not in blocos:
        f = f'{cache}/{Z}_{tx}_{ty}.png'
        if not os.path.exists(f):
            subprocess.run(['curl', '-sS', '--max-time', '60', '-o', f, f'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{Z}/{tx}/{ty}.png'], check=False)
        blocos[(tx, ty)] = Image.open(f).convert('RGB')
    return blocos[(tx, ty)]
def terreno(lat, lon):
    n = 2 ** Z
    fx = (lon + 180) / 360 * n * 256
    fy = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n * 256
    x0, y0 = math.floor(fx - 0.5), math.floor(fy - 0.5); ax, ay = fx - 0.5 - x0, fy - 0.5 - y0
    def h(px, py):
        r, g, b = bloco(px // 256, py // 256).getpixel((px % 256, py % 256)); return r * 256 + g + b / 256 - 32768
    return h(x0, y0) * (1 - ax) * (1 - ay) + h(x0 + 1, y0) * ax * (1 - ay) + h(x0, y0 + 1) * (1 - ax) * ay + h(x0 + 1, y0 + 1) * ax * ay

PASSO = 25          # m entre amostras
SUAVE = 150         # m: janela da mediana móvel do terreno (o modelo tem ruído de prédio/árvore)
LIMITE_COERENTE = 5 # m: erro médio GPS × terreno acima disso = altitude do GPS não confiável

perc = json.load(open(os.path.join(RAIZ, 'dados/percursos', f'{slug}.json')))
casado = json.load(open(os.path.join(RAIZ, 'dados/casados', f'{slug}.json')))
saida = {'slug': slug, 'fonteTerreno': 'terrarium z14 (AWS elevation-tiles-prod, base SRTM)', 'distancias': {}}

def interp(xs, ys, x):
    i = bisect.bisect_left(xs, x)
    if i <= 0: return ys[0]
    if i >= len(xs): return ys[-1]
    f = (x - xs[i - 1]) / ((xs[i] - xs[i - 1]) or 1)
    return ys[i - 1] + (ys[i] - ys[i - 1]) * f

for d in perc['distancias']:
    rot = d['rotulo']; c = casado['distancias'][rot]
    linha = c['linha']; L = linha[-1][2]
    sl = [q[2] for q in linha]
    # amostras a cada PASSO m do traçado ajustado
    amostras = []
    s = 0.0
    while s <= L:
        la = interp(sl, [q[0] for q in linha], s); lo = interp(sl, [q[1] for q in linha], s)
        amostras.append({'s': s, 'lat': la, 'lon': lo})
        s += PASSO
    # estrutura em cada amostra, pelas passagens casadas (ponte/túnel/camada da aresta do grafo)
    estr = [(p['sDe'] * 1000, p['sAte'] * 1000, p) for p in c['passagens'] if not p.get('semCasamento') and (p.get('ponte') or p.get('tunel') or p.get('camada'))]
    for a in amostras:
        a['estrutura'] = next(({'nome': p.get('nome'), 'ponte': bool(p.get('ponte')), 'tunel': bool(p.get('tunel')), 'camada': p.get('camada', 0)} for (s0, s1, p) in estr if s0 - 1 <= a['s'] <= s1 + 1), None)
        a['terrenoBruto'] = terreno(a['lat'], a['lon'])
    # GPS → km do traçado: cada passagem casada liga índice do GPS a km do traçado
    nos_ = sorted({(p['gpsDe'], p['sDe'] * 1000) for p in c['passagens']} | {(p['gpsAte'], p['sAte'] * 1000) for p in c['passagens']})
    gi, gs = [], []
    for i, sk in nos_:
        if gi and i == gi[-1]: gs[-1] = max(gs[-1], sk); continue
        gi.append(i); gs.append(max(sk, gs[-1] if gs else 0))
    gps = d['percurso']; desc = set(c['descartados'])
    s_gps = [(interp(gi, gs, i), gps[i][2]) for i in range(len(gps)) if i not in desc and len(gps[i]) > 2]
    s_gps.sort()
    xs, ys = [v[0] for v in s_gps], [v[1] for v in s_gps]
    for a in amostras: a['gps'] = interp(xs, ys, a['s'])
    # terreno suavizado: mediana móvel só com amostras fora de estrutura; sob estrutura, liga as cabeceiras
    livres = [a for a in amostras if not a['estrutura']]
    k = max(1, SUAVE // PASSO // 2)
    fs, fv = [], []
    for j, a in enumerate(livres):
        viz = [b['terrenoBruto'] for b in livres[max(0, j - k): j + k + 1]]
        fs.append(a['s']); fv.append(statistics.median(viz))
    for a in amostras:
        a['terreno'] = interp(fs, fv, a['s'])  # sob estrutura: reta entre as cabeceiras (tabuleiro)
        a['alturaEstrutura'] = round(a['terreno'] - a['terrenoBruto'], 1) if a['estrutura'] and a['estrutura']['ponte'] else None
    # coerência GPS × terreno (fora de estrutura), com o deslocamento fixo entre as fontes descontado
    dif = [a['gps'] - a['terreno'] for a in amostras if not a['estrutura']]
    off = statistics.median(dif)
    err = sorted(abs(v - off) for v in dif)
    subida = lambda v: round(sum(max(0, y - x) for x, y in zip(v, v[1:])))
    erro_medio = statistics.mean(err)
    # trechos onde o GPS se afasta > 10 m do terreno por mais de 200 m seguidos
    trechos, ini = [], None
    for a in amostras:
        ruim = not a['estrutura'] and abs(a['gps'] - a['terreno'] - off) > 10
        if ruim and ini is None: ini = a['s']
        if not ruim and ini is not None:
            if a['s'] - ini >= 200: trechos.append([round(ini / 1000, 2), round(a['s'] / 1000, 2)])
            ini = None
    if ini is not None and L - ini >= 200: trechos.append([round(ini / 1000, 2), round(L / 1000, 2)])
    # cada passagem por ponte: altura do tabuleiro sobre o terreno embaixo (máxima)
    pontes, atual = [], None
    for a in amostras:
        e = a['estrutura']
        if e and e['ponte']:
            if not atual or atual['nome'] != e['nome'] or a['s'] - atual['ate'] > PASSO * 1.5:
                atual = {'nome': e['nome'], 'camada': e['camada'], 'de': a['s'], 'ate': a['s'], 'alturas': []}; pontes.append(atual)
            atual['ate'] = a['s']; atual['alturas'].append(a['alturaEstrutura'])
    saida['distancias'][rot] = {
        'resumo': {
            'deslocamentoGpsTerrenoM': round(off, 1), 'erroMedioM': round(erro_medio, 1), 'p95M': round(err[int(len(err) * 0.95)], 1), 'maxM': round(err[-1], 1),
            'altitudeGpsCoerente': erro_medio <= LIMITE_COERENTE,
            'trechosGpsIncoerentesKm': trechos,
            'subidaGpsM': subida([a['gps'] for a in amostras]), 'subidaTerrenoBrutoM': subida([a['terrenoBruto'] for a in amostras]),
            'subidaTerrenoSuaveM': subida([a['terreno'] for a in amostras]),
            'faixaGpsM': [round(min(ys), 1), round(max(ys), 1)], 'faixaTerrenoM': [round(min(fv), 1), round(max(fv), 1)],
        },
        'pontes': [{'nome': p['nome'], 'camada': p['camada'], 'km': [round(p['de'] / 1000, 2), round(p['ate'] / 1000, 2)],
                    'alturaMaxM': max(v for v in p['alturas'] if v is not None)} for p in pontes],
        'serie': [{'km': round(a['s'] / 1000, 3), 'gps': round(a['gps'], 1), 'terrenoBruto': round(a['terrenoBruto'], 1), 'terreno': round(a['terreno'], 1),
                   'estrutura': (a['estrutura']['nome'] or 'sem nome') if a['estrutura'] else None, 'alturaEstrutura': a['alturaEstrutura']} for a in amostras],
    }
    r = saida['distancias'][rot]['resumo']
    print(rot, json.dumps(r, ensure_ascii=False))
    for p in saida['distancias'][rot]['pontes']: print('   ponte', p)
os.makedirs(os.path.join(RAIZ, 'dados/elevacao'), exist_ok=True)
json.dump(saida, open(os.path.join(RAIZ, 'dados/elevacao', f'{slug}.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
