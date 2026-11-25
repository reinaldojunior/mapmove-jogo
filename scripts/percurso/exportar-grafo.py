# Exporta o GRAFO de ruas do OpenStreetMap em volta de uma prova (etapa 1 da arquitetura de percursos).
# Diferente de scripts/gerar-osm.py (que guarda só desenhos para decorar o jogo), aqui ficam nós com id, ligações,
# sentidos e informações estruturais: é a base do map matching (etapa 2). Não é usado pelo jogo.
#
# Uso: python3 scripts/percurso/exportar-grafo.py <percurso.json do Supabase> <pasta de cache dos blocos> <saida.json>
#   percurso.json = resposta de /rest/v1/corridas?slug=eq.<slug>&select=corrida_distancias(rotulo,km,percurso)
#   (os blocos baixados ficam na pasta de cache e são reaproveitados; a API do OSM pede no máximo ~1 pedido/s)
#
# Formato da saída (dados/grafos/<slug>.json):
#   nos:     { "<id OSM>": [lat, lon] }                       — todos os nós usados pelas arestas
#   nosInfo: { "<id OSM>": { semaforo, travessia, barreira, ... } }  — só os que têm algo relevante
#   arestas: [ { id, via, nos: [ids...], tipo, nome, mao, faixas, largura, ponte, tunel, camada, nivel, coberto,
#                superficie, pe, rotatoria, acesso, inclinacao } ]
#     · cada via do OSM é cortada em todo nó compartilhado com outra via (cruzamento) e nas pontas: uma aresta liga
#       exatamente dois "nós de junção" e nunca atravessa um cruzamento
#     · mao: 'dupla' | 'ida' (sentido da lista de nós) | 'volta' (contrário) — de oneway / junction=roundabout
#     · camada: tag layer (inteiro; ponte sem layer = 1, túnel sem layer = -1); nivel: tag level, quando existir
#     · pe: via de pedestre/ciclista (footway, path, cycleway, pedestrian, steps, track) — prova pode passar por parque
#   resumo:  contagens, componentes conexas, pontas soltas, cobertura do percurso (quanto do GPS tem rua perto)
import sys, os, json, math, time, glob, subprocess, collections, datetime
import xml.etree.ElementTree as ET

src, TD, dst = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(TD, exist_ok=True)
c = json.load(open(src))[0]
dists = [d for d in c['corrida_distancias'] if d.get('percurso')]
pts = [p for d in dists for p in d['percurso']]

# ── 1) blocos de ~650 m em volta do percurso (mesma grade do gerar-osm.py: os caches servem para os dois) ──
T, m = 0.006, 0.002
tiles = {(math.floor((la + a) / T), math.floor((lo + b) / T)) for la, lo, *_ in pts for a in (-m, 0, m) for b in (-m, 0, m)}
print(len(tiles), 'blocos')
for (a, b) in sorted(tiles):
    f = f'{TD}/{a}_{b}.xml'
    if os.path.exists(f) and os.path.getsize(f) > 500: continue
    bbox = f'{b*T:.4f},{a*T:.4f},{(b+1)*T:.4f},{(a+1)*T:.4f}'
    r = subprocess.run(['curl', '-sS', '--max-time', '90', '-A', 'MapmoveRun/1.0 (+https://mapmove.com.br)', '-o', f, '-w', '%{http_code}',
                        f'https://api.openstreetmap.org/api/0.6/map?bbox={bbox}'], capture_output=True, text=True)
    if r.stdout != '200': print('falhou', bbox, r.stdout, r.stderr[:120])
    time.sleep(1.2)

# ── 2) leitura ──
nodes, ways = {}, {}
for f in glob.glob(f'{TD}/*.xml'):
    try: r = ET.parse(f).getroot()
    except ET.ParseError: print('xml ruim', f); continue
    for n in r.iter('node'):
        nodes[n.get('id')] = (float(n.get('lat')), float(n.get('lon')), {t.get('k'): t.get('v') for t in n.findall('tag')})
    for w in r.iter('way'):
        ways[w.get('id')] = ([nd.get('ref') for nd in w.findall('nd')], {t.get('k'): t.get('v') for t in w.findall('tag')})
print('nós', len(nodes), 'vias', len(ways))

# ── 3) corredor: vias com algum nó a até 150 m do percurso (a via inteira entra, para manter as ligações) ──
lat0 = pts[0][0]; kx = 111320 * math.cos(math.radians(lat0)); ky = 110540
CEL = 50
grade = collections.defaultdict(list)
for d in dists:
    p = d['percurso']
    for i in range(len(p) - 1):
        (a1, o1), (a2, o2) = p[i][:2], p[i + 1][:2]
        n = max(1, int(math.hypot((a2 - a1) * ky, (o2 - o1) * kx) / 8))
        for k in range(n + 1):
            la, lo = a1 + (a2 - a1) * k / n, o1 + (o2 - o1) * k / n
            grade[(int(la * ky // CEL), int(lo * kx // CEL))].append((la, lo))
def dist_percurso(la, lo, alc=4):
    ci, cj = int(la * ky // CEL), int(lo * kx // CEL); b = 1e9
    for i in range(ci - alc, ci + alc + 1):
        for j in range(cj - alc, cj + alc + 1):
            for a, o in grade.get((i, j), ()): b = min(b, math.hypot((a - la) * ky, (o - lo) * kx))
    return b

RUAS = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service', 'road',
        'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'}
PE = {'footway', 'path', 'cycleway', 'pedestrian', 'steps', 'track', 'bridleway', 'corridor'}
CORREDOR = 150
escolhidas = {}
for wid, (refs, t) in ways.items():
    hw = t.get('highway')
    if hw not in RUAS and hw not in PE: continue
    if t.get('area') == 'yes': continue  # praça desenhada como área: não é um caminho
    validos = [r for r in refs if r in nodes]
    if len(validos) < 2: continue
    if not any(dist_percurso(*nodes[r][:2]) < CORREDOR for r in validos): continue
    escolhidas[wid] = (validos, t)
print('vias no corredor', len(escolhidas))

# ── 4) corte nas junções: nó usado por mais de uma via (ou duas vezes na mesma, laço) vira ponta de aresta ──
uso = collections.Counter()
for refs, _ in escolhidas.values():
    for r in set(refs): uso[r] += 1
    for r, q in collections.Counter(refs).items():
        if q > 1: uso[r] += 1

def inteiro(v, padrao=None):
    try: return int(float(str(v).split(';')[0]))
    except (TypeError, ValueError): return padrao
def numero(v):
    try: return float(str(v).replace(',', '.').split()[0])
    except (TypeError, ValueError, IndexError): return None
def mao(t):
    o = (t.get('oneway') or '').lower()
    if o in ('yes', 'true', '1'): return 'ida'
    if o == '-1' or o == 'reverse': return 'volta'
    if o in ('no', 'false', '0'): return 'dupla'
    if t.get('junction') in ('roundabout', 'circular') or t.get('highway') in ('motorway',): return 'ida'
    return 'dupla'

arestas = []
for wid, (refs, t) in escolhidas.items():
    hw = t['highway']
    ponte = t.get('bridge') not in (None, 'no')
    tunel = t.get('tunnel') not in (None, 'no') or t.get('covered') == 'yes' and t.get('layer', '0').startswith('-')
    camada = inteiro(t.get('layer'), 1 if ponte else -1 if tunel else 0)
    base = {
        'via': int(wid), 'tipo': hw, 'nome': t.get('name') or t.get('ref'), 'mao': mao(t),
        'faixas': inteiro(t.get('lanes')), 'largura': numero(t.get('width')),
        'ponte': ponte, 'tipoPonte': t.get('bridge') if ponte else None, 'tunel': tunel, 'camada': camada,
        'nivel': t.get('level'), 'coberto': t.get('covered') == 'yes', 'superficie': t.get('surface'),
        'pe': hw in PE, 'rotatoria': t.get('junction') in ('roundabout', 'circular'), 'acesso': t.get('access'),
        'inclinacao': t.get('incline'), 'calcada': t.get('sidewalk'),
    }
    base = {k: v for k, v in base.items() if v not in (None, False)}
    trecho, k = [refs[0]], 0
    for r in refs[1:]:
        trecho.append(r)
        if uso[r] > 1 or r == refs[-1]:
            if len(trecho) >= 2:
                arestas.append({'id': f'{wid}:{k}', 'nos': trecho, **base}); k += 1
            trecho = [r]

# ── 5) nós usados e informação dos nós (semáforo, travessia, barreira, elevação de ponto cotado) ──
usados = {r for a in arestas for r in a['nos']}
nos = {r: [round(nodes[r][0], 7), round(nodes[r][1], 7)] for r in usados}
nos_info = {}
for r in usados:
    t = nodes[r][2]
    info = {}
    if t.get('highway') == 'traffic_signals' or t.get('crossing') == 'traffic_signals': info['semaforo'] = True
    if t.get('highway') == 'crossing' or 'crossing' in t: info['travessia'] = t.get('crossing', 'sim')
    if t.get('barrier'): info['barreira'] = t['barrier']
    if t.get('ele'): info['ele'] = numero(t['ele'])
    if t.get('highway') in ('turning_circle', 'turning_loop'): info['retorno'] = True
    if t.get('highway') == 'stop' or t.get('highway') == 'give_way': info['sinal'] = t['highway']
    if info: nos_info[r] = info

# ── 6) resumo: componentes conexas, pontas soltas, cobertura do GPS de cada distância ──
pai = {}
def acha(x):
    while pai.get(x, x) != x:
        pai[x] = pai.get(pai[x], pai[x]); x = pai[x]
    return x
def une(a, b):
    ra, rb = acha(a), acha(b)
    if ra != rb: pai[ra] = rb
for a in arestas:
    for u, v in zip(a['nos'], a['nos'][1:]): une(u, v)
comp = collections.Counter(acha(r) for r in usados)
grau = collections.Counter()
for a in arestas: grau[a['nos'][0]] += 1; grau[a['nos'][-1]] += 1

# cobertura: para cada ponto do GPS (densificado a cada 10 m), distância até a aresta mais próxima
segs = collections.defaultdict(list)
for a in arestas:
    g = [nos[r] for r in a['nos']]
    for (p, q) in zip(g, g[1:]):
        for i in range(int(min(p[0], q[0]) * ky // CEL), int(max(p[0], q[0]) * ky // CEL) + 1):
            for j in range(int(min(p[1], q[1]) * kx // CEL), int(max(p[1], q[1]) * kx // CEL) + 1):
                segs[(i, j)].append((p, q, a.get('pe', False)))
def dist_grafo(la, lo, so_rua=False):
    ci, cj = int(la * ky // CEL), int(lo * kx // CEL); b = 1e9
    for i in range(ci - 1, ci + 2):
        for j in range(cj - 1, cj + 2):
            for p, q, pe in segs.get((i, j), ()):
                if so_rua and pe: continue
                ax, ay, bx, by = p[1] * kx, p[0] * ky, q[1] * kx, q[0] * ky
                px, py = lo * kx, la * ky
                vx, vy = bx - ax, by - ay; l2 = vx * vx + vy * vy or 1
                tt = max(0, min(1, ((px - ax) * vx + (py - ay) * vy) / l2))
                b = min(b, math.hypot(px - ax - tt * vx, py - ay - tt * vy))
    return b
cobertura = {}
for d in dists:
    p, amostras = d['percurso'], []
    for i in range(len(p) - 1):
        (a1, o1), (a2, o2) = p[i][:2], p[i + 1][:2]
        n = max(1, int(math.hypot((a2 - a1) * ky, (o2 - o1) * kx) / 10))
        for k in range(n): amostras.append((a1 + (a2 - a1) * k / n, o1 + (o2 - o1) * k / n))
    ds = [dist_grafo(a, o) for a, o in amostras]
    dr = [dist_grafo(a, o, True) for a, o in amostras]
    pct = lambda lst, lim: round(100 * sum(1 for v in lst if v <= lim) / len(lst), 1)
    # trechos sem rua perto (> 25 m por mais de 30 m seguidos): candidatos ao método alternativo
    buracos, ini = [], None
    for k, v in enumerate(ds + [0]):
        if v > 25 and ini is None: ini = k
        if v <= 25 and ini is not None:
            if k - ini >= 3: buracos.append([round(ini * 0.01, 2), round(k * 0.01, 2)])
            ini = None
    srt = sorted(ds)
    cobertura[d['rotulo'].upper()] = {
        'pontosGps': len(p), 'amostras10m': len(amostras),
        'ate10m': pct(ds, 10), 'ate20m': pct(ds, 20), 'ate30m': pct(ds, 30), 'soRuasAte20m': pct(dr, 20),
        'mediana': round(srt[len(srt) // 2], 1), 'p95': round(srt[int(len(srt) * 0.95)], 1), 'max': round(srt[-1], 1),
        'trechosSemRuaKm': buracos,
    }

contagem = collections.Counter(a['tipo'] for a in arestas)
resumo = {
    'arestas': len(arestas), 'nos': len(nos), 'vias': len(escolhidas),
    'componentes': len(comp), 'maiorComponente': max(comp.values()) if comp else 0,
    'pontasSoltas': sum(1 for r, g in grau.items() if g == 1),
    'maoUnica': sum(1 for a in arestas if a['mao'] != 'dupla'),
    'pontes': sum(1 for a in arestas if a.get('ponte')), 'tuneis': sum(1 for a in arestas if a.get('tunel')),
    'camadas': dict(collections.Counter(str(a.get('camada', 0)) for a in arestas)),
    'comNivel': sum(1 for a in arestas if a.get('nivel')),
    'comFaixas': sum(1 for a in arestas if a.get('faixas')), 'comLargura': sum(1 for a in arestas if a.get('largura')),
    'tipos': dict(contagem.most_common()), 'cobertura': cobertura,
}
saida = {
    'versao': 1, 'fonte': 'OpenStreetMap © colaboradores (ODbL)', 'gerado': datetime.date.today().isoformat(),
    'corredorM': CORREDOR, 'nos': nos, 'nosInfo': nos_info, 'arestas': arestas, 'resumo': resumo,
}
os.makedirs(os.path.dirname(dst) or '.', exist_ok=True)
json.dump(saida, open(dst, 'w'), ensure_ascii=False, separators=(',', ':'))
print(json.dumps(resumo, ensure_ascii=False, indent=1))
print('gravado', dst, round(os.path.getsize(dst) / 1024), 'KB')
