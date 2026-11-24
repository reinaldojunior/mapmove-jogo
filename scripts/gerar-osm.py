# Gera public/osm/<slug>.json com o entorno do percurso (OpenStreetMap): áreas, prédios, rios, vias, árvores,
# pontos de referência, semáforos, locais (igreja/escola/comércio/posto) e pontes/viadutos.
# Uso: python3 scripts/gerar-osm.py <corrida.json do Supabase> <pasta de tiles> <saida.json>
# corrida.json = resposta de /rest/v1/corridas?slug=eq.<slug>&select=corrida_distancias(percurso)
import sys, os, json, math, time, glob, subprocess, collections
import xml.etree.ElementTree as ET

src, TD, dst = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(TD, exist_ok=True)
c = json.load(open(src))[0]
dists = [d for d in c['corrida_distancias'] if d.get('percurso')]
pts = [p for d in dists for p in d['percurso']]

# 1) baixa o mapa em blocos de ~650 m em volta do percurso (API do OpenStreetMap, com pausa entre pedidos)
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

# 2) lê tudo
nodes, ways, rels = {}, {}, {}
for f in glob.glob(f'{TD}/*.xml'):
    try: r = ET.parse(f).getroot()
    except ET.ParseError: print('xml ruim', f); continue
    for n in r.iter('node'):
        nodes[n.get('id')] = (float(n.get('lat')), float(n.get('lon')), {t.get('k'): t.get('v') for t in n.findall('tag')})
    for w in r.iter('way'):
        ways[w.get('id')] = ([nd.get('ref') for nd in w.findall('nd')], {t.get('k'): t.get('v') for t in w.findall('tag')})
    for rl in r.iter('relation'):
        rels[rl.get('id')] = ([(x.get('type'), x.get('ref'), x.get('role')) for x in rl.findall('member')], {t.get('k'): t.get('v') for t in rl.findall('tag')})
print('nós', len(nodes), 'vias', len(ways), 'relações', len(rels))

lat0 = pts[0][0]; kx = 111320 * math.cos(math.radians(lat0)); ky = 110540
dense = []
for d in dists:
    p = d['percurso']
    for i in range(len(p) - 1):
        (a1, o1), (a2, o2) = p[i][:2], p[i + 1][:2]
        n = max(1, int(math.hypot((a2 - a1) * ky, (o2 - o1) * kx) / 8))
        for k in range(n + 1): dense.append((a1 + (a2 - a1) * k / n, o1 + (o2 - o1) * k / n))
G = collections.defaultdict(list)
for la, lo in dense: G[(int(la * ky // 50), int(lo * kx // 50))].append((la, lo))
def dist(la, lo, alc=6):
    ci, cj = int(la * ky // 50), int(lo * kx // 50); b = 1e9
    for i in range(ci - alc, ci + alc + 1):
        for j in range(cj - alc, cj + alc + 1):
            for a, o in G.get((i, j), ()): b = min(b, math.hypot((a - la) * ky, (o - lo) * kx))
    return b
geom = lambda refs: [nodes[r][:2] for r in refs if r in nodes]
perto = lambda g, lim: any(dist(a, o) < lim for a, o in g[::max(1, len(g) // 12)] + [g[-1]])
R6 = lambda g: [[round(a, 6), round(o, 6)] for a, o in g]
R5 = lambda g: [[round(a, 5), round(o, 5)] for a, o in g]

def cls(t):
    if 'building' in t: return 'predio'
    if t.get('natural') == 'water' or t.get('landuse') in ('reservoir', 'basin') or t.get('water'): return 'agua'
    if t.get('waterway') in ('river', 'stream', 'canal'): return 'rio'
    if t.get('leisure') in ('park', 'garden', 'playground', 'recreation_ground'): return 'parque'
    if t.get('leisure') in ('pitch', 'sports_centre', 'stadium', 'track'): return 'esporte'
    if t.get('landuse') in ('forest',) or t.get('natural') in ('wood', 'scrub'): return 'mata'
    if t.get('landuse') in ('grass', 'meadow', 'recreation_ground', 'village_green') or t.get('natural') == 'grassland': return 'grama'
    if t.get('landuse') in ('residential', 'commercial', 'retail', 'industrial'): return 'bairro'
    return None

out = collections.defaultdict(list)
for wid, (refs, t) in ways.items():
    k = cls(t)
    if not k: continue
    g = geom(refs)
    if len(g) < 2 or not perto(g, {'predio': 140, 'bairro': 250}.get(k, 300)): continue
    it = {'p': R6(g)}
    if k == 'predio':
        h = t.get('height') or t.get('building:height'); lv = t.get('building:levels')
        try: it['h'] = round(float(str(h).split()[0]), 1) if h else None
        except ValueError: pass
        try: it['n'] = int(float(lv)) if lv else None
        except ValueError: pass
        it['t'] = t.get('building')
    if k in ('parque', 'agua', 'mata', 'grama', 'esporte') and t.get('name'): it['nome'] = t['name']
    out[k].append({x: y for x, y in it.items() if y is not None})
for rid, (mem, t) in rels.items():
    k = cls(t)
    if k not in ('parque', 'agua', 'mata', 'grama'): continue
    for typ, ref, role in mem:
        if typ == 'way' and role in ('outer', '') and ref in ways:
            g = geom(ways[ref][0])
            if len(g) > 2 and perto(g, 300): out[k].append({'p': R6(g), 'nome': t['name']} if t.get('name') else {'p': R6(g)})
out['arvore'] = [[round(a, 6), round(o, 6)] for a, o, t in nodes.values() if t.get('natural') == 'tree' and dist(a, o) < 60]

RUAS = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street',
        'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'}
via = []
for wid, (refs, t) in ways.items():
    if t.get('highway') in RUAS:
        g = geom(refs)
        if len(g) < 2 or not any(dist(a, o) < 60 for a, o in g[::max(1, len(g) // 15)] + [g[-1]]): continue
        it = {'t': t['highway'], 'p': R5(g)}
        if t.get('name'): it['n'] = t['name']
        via.append(it)
out['via'] = via
# pontes e viadutos (rua passando por cima de rio, de outra rua ou de outro trecho do percurso)
out['ponte'] = [dict({'t': t['highway'], 'p': R5(geom(refs))}, **({'n': t['name']} if t.get('name') else {}))
                for wid, (refs, t) in ways.items()
                if t.get('highway') in RUAS and t.get('bridge') in ('yes', 'viaduct') and len(geom(refs)) > 1
                and any(dist(a, o) < 60 for a, o in geom(refs))]
out['caminho'] = [{'p': R6(geom(refs))} for wid, (refs, t) in ways.items()
                  if t.get('highway') in ('footway', 'path', 'cycleway', 'pedestrian') and len(geom(refs)) > 1 and perto(geom(refs), 200)]

def tipo(t):
    if t.get('historic'): return 'monumento'
    if t.get('tourism') in ('attraction', 'museum', 'viewpoint', 'artwork', 'gallery'): return 'turismo'
    if t.get('amenity') in ('arts_centre', 'theatre', 'townhall', 'fountain', 'library'): return 'cultura'
    if t.get('shop') == 'mall': return 'compras'
    if t.get('man_made') in ('pier', 'breakwater'): return 'pier'
    if t.get('leisure') in ('park', 'stadium', 'sports_centre'): return 'parque'
    if t.get('natural') == 'water' or t.get('sport') == 'rowing' or t.get('water'): return 'lago'
    return None
pois = {}
def add(nome, tp, a, o, d):
    k = nome.strip()
    if k not in pois or d < pois[k]['dist']: pois[k] = {'nome': k, 'tipo': tp, 'la': round(a, 5), 'lo': round(o, 5), 'dist': round(d)}
for nid, (a, o, t) in nodes.items():
    tp = tipo(t) if t.get('name') else None
    if tp:
        d = dist(a, o)
        if d < 220: add(t['name'], tp, a, o, d)
for wid, (refs, t) in ways.items():
    if not t.get('name') or 'highway' in t: continue
    tp = tipo(t)
    if not tp: continue
    g = geom(refs)
    if not g: continue
    d = min(dist(x, y) for x, y in g[::max(1, len(g) // 12)])
    if d < 220: add(t['name'], tp, sum(x for x, _ in g) / len(g), sum(y for _, y in g) / len(g), d)
out['poi'] = sorted([p for p in pois.values() if not p['nome'].lower().startswith(('parquinho', 'play ', 'playground'))], key=lambda p: p['dist'])

out['semaforo'] = sorted({n: [round(a, 6), round(o, 6)] for n, (a, o, t) in nodes.items()
                          if (t.get('highway') == 'traffic_signals' or t.get('crossing') == 'traffic_signals') and dist(a, o) < 80}.values())

COM = {'supermarket', 'bakery', 'convenience', 'hardware', 'pharmacy', 'fast_food', 'restaurant', 'ice_cream', 'pet', 'clothes',
       'beverages', 'paint', 'kiosk', 'alcohol', 'bed', 'marketplace', 'cafe', 'butcher', 'car_repair'}
def cat(t):
    if t.get('amenity') == 'place_of_worship' or t.get('building') in ('church', 'chapel'): return 'igreja'
    if t.get('amenity') in ('school', 'kindergarten', 'childcare') or t.get('building') == 'school': return 'escola'
    if t.get('amenity') == 'fuel': return 'posto'
    if t.get('shop') in COM or t.get('amenity') in COM: return 'comercio'
    return None
locais = []
for el, (la, lo, t) in [(k, v) for k, v in nodes.items()]:
    c2 = cat(t)
    if c2 and dist(la, lo) < 200: locais.append((c2, la, lo))
for wid, (refs, t) in ways.items():
    c2 = cat(t)
    if not c2: continue
    g = geom(refs)
    if not g: continue
    la = sum(p[0] for p in g) / len(g); lo = sum(p[1] for p in g) / len(g)
    if dist(la, lo) < 200: locais.append((c2, la, lo))
fin = []
for c2, la, lo in locais:
    if any(f['c'] == c2 and math.hypot((f['la'] - la) * ky, (f['lo'] - lo) * kx) < 30 for f in fin): continue
    fin.append({'c': c2, 'la': round(la, 6), 'lo': round(lo, 6)})
out['local'] = fin
out['fonte'] = '© OpenStreetMap contributors (ODbL)'
json.dump(out, open(dst, 'w'), ensure_ascii=False, separators=(',', ':'))
print({k: len(v) for k, v in out.items() if isinstance(v, list)}, os.path.getsize(dst) // 1024, 'KB')
for p in out['poi'][:25]: print(' ', p['dist'], 'm', p['tipo'], p['nome'])
