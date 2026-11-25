// Leitura do grafo de ruas exportado por exportar-grafo.py (dados/grafos/<slug>.json) e consultas espaciais.
// Base do map matching (etapa 2). Não é usado pelo jogo.
//
// Coordenadas locais em metros: x para leste, y para norte, a partir de uma origem (lat0, lon0).

const KY = 110540;
export function projecao(lat0, lon0) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  return {
    paraXY: (lat, lon) => ({ x: (lon - lon0) * kx, y: (lat - lat0) * KY }),
    paraLatLon: (x, y) => ({ lat: lat0 + y / KY, lon: lon0 + x / kx }),
  };
}

// grafo carregado: nós com x/y, arestas com a polilinha em metros, comprimento e sentidos permitidos
export function carregarGrafo(dados, { origem } = {}) {
  const ids = Object.keys(dados.nos);
  const [lat0, lon0] = origem || dados.nos[ids[0]];
  const P = projecao(lat0, lon0);
  const nos = new Map();
  for (const id of ids) { const [lat, lon] = dados.nos[id]; nos.set(id, { id, lat, lon, ...P.paraXY(lat, lon), arestas: [], info: dados.nosInfo?.[id] }); }
  const arestas = dados.arestas.map((a) => {
    const pts = a.nos.map((n) => nos.get(n));
    const acum = [0];
    for (let i = 1; i < pts.length; i++) acum.push(acum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    return { ...a, pts, acum, comprimento: acum[acum.length - 1], de: a.nos[0], para: a.nos[a.nos.length - 1] };
  });
  for (const a of arestas) { nos.get(a.de).arestas.push(a); if (a.para !== a.de) nos.get(a.para).arestas.push(a); }
  // índice espacial: células de 50 m com os segmentos (aresta, índice do segmento)
  const C = 50, grade = new Map();
  for (const a of arestas) for (let i = 0; i < a.pts.length - 1; i++) {
    const p = a.pts[i], q = a.pts[i + 1];
    for (let cx = Math.floor(Math.min(p.x, q.x) / C); cx <= Math.floor(Math.max(p.x, q.x) / C); cx++)
      for (let cy = Math.floor(Math.min(p.y, q.y) / C); cy <= Math.floor(Math.max(p.y, q.y) / C); cy++) {
        const k = cx + ',' + cy;
        if (!grade.has(k)) grade.set(k, []);
        grade.get(k).push([a, i]);
      }
  }
  const porId = new Map(arestas.map((a) => [a.id, a]));

  // arestas a até `raio` m do ponto: a melhor projeção em cada aresta, com a posição ao longo dela (m) e a direção
  // do segmento (unitária, no sentido da lista de nós)
  function proximas(x, y, raio = 30) {
    const r = Math.ceil(raio / C), cx = Math.floor(x / C), cy = Math.floor(y / C), melhor = new Map();
    for (let i = cx - r; i <= cx + r; i++) for (let j = cy - r; j <= cy + r; j++) for (const [a, k] of grade.get(i + ',' + j) || []) {
      const p = a.pts[k], q = a.pts[k + 1], vx = q.x - p.x, vy = q.y - p.y, l2 = vx * vx + vy * vy || 1, l = Math.sqrt(l2);
      const t = Math.max(0, Math.min(1, ((x - p.x) * vx + (y - p.y) * vy) / l2));
      const d = Math.hypot(x - p.x - t * vx, y - p.y - t * vy);
      if (d > raio) continue;
      const atual = melhor.get(a);
      if (!atual || d < atual.dist) melhor.set(a, { aresta: a, dist: d, pos: a.acum[k] + t * l, dir: [vx / l, vy / l], x: p.x + t * vx, y: p.y + t * vy });
    }
    return [...melhor.values()].sort((u, v) => u.dist - v.dist);
  }
  // ponto a `pos` m do início da aresta
  function emAresta(a, pos) {
    pos = Math.max(0, Math.min(a.comprimento, pos));
    let k = 1; while (k < a.acum.length - 1 && a.acum[k] < pos) k++;
    const f = (pos - a.acum[k - 1]) / ((a.acum[k] - a.acum[k - 1]) || 1);
    return { x: a.pts[k - 1].x + (a.pts[k].x - a.pts[k - 1].x) * f, y: a.pts[k - 1].y + (a.pts[k].y - a.pts[k - 1].y) * f };
  }
  // sentido de corrida permitido pelo trânsito (prova fecha a rua: o matching pode ignorar, mas a informação fica)
  const permite = (a, sentido) => a.mao === 'dupla' || (a.mao === 'ida' && sentido > 0) || (a.mao === 'volta' && sentido < 0);
  return { nos, arestas, porId, proximas, emAresta, permite, projecao: P, origem: [lat0, lon0] };
}

// validação estrutural do grafo exportado: erros que quebrariam o matching
export function validarGrafo(dados) {
  const erros = [];
  const nos = dados.nos, uso = new Map();
  for (const a of dados.arestas) {
    if (!Array.isArray(a.nos) || a.nos.length < 2) erros.push(`aresta ${a.id}: menos de 2 nós`);
    for (const n of a.nos) if (!nos[n]) erros.push(`aresta ${a.id}: nó ${n} não existe`);
    if (!['dupla', 'ida', 'volta'].includes(a.mao)) erros.push(`aresta ${a.id}: mão inválida ${a.mao}`);
    a.nos.forEach((n, i) => { if (i > 0 && i < a.nos.length - 1) uso.set(n, (uso.get(n) || 0) + 1); });
  }
  // corte nas junções: nó interno de uma aresta não pode ser ponta de outra (senão a aresta atravessa um cruzamento)
  const pontas = new Set(dados.arestas.flatMap((a) => [a.nos[0], a.nos[a.nos.length - 1]]));
  for (const [n, q] of uso) if (pontas.has(n) || q > 1) erros.push(`nó ${n} é interno de aresta e também junção`);
  const ids = new Set();
  for (const a of dados.arestas) { if (ids.has(a.id)) erros.push(`id repetido ${a.id}`); ids.add(a.id); }
  return erros;
}
