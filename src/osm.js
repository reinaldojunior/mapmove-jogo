// Cenário real a partir do OpenStreetMap (arquivo em public/osm/<slug>.json).
// Funções puras: conversão para metros locais, ponto dentro de polígono e zonas ao longo do percurso.

const AREAS = ['parque', 'grama', 'mata', 'esporte', 'agua', 'bairro'];

export function pontoNoPoligono(x, z, pts) {
  let dentro = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) dentro = !dentro;
  }
  return dentro;
}

export function areaPoligono(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return Math.abs(a / 2);
}

// converte os polígonos e linhas do arquivo para metros locais da pista
export function prepararOSM(dados, paraLocal) {
  const conv = (p) => p.map(([la, lo]) => { const q = paraLocal(la, lo); return [q.x, q.z]; });
  const caixa = (pts) => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    return [x0, z0, x1, z1];
  };
  const areas = [];
  for (const tipo of AREAS) {
    for (const a of dados[tipo] || []) {
      if (a.p.length < 3) continue;
      const pts = conv(a.p);
      areas.push({ tipo, nome: a.nome, pts, caixa: caixa(pts), area: areaPoligono(pts) });
    }
  }
  const predios = (dados.predio || []).filter((b) => b.p.length >= 3).map((b) => ({ ...b, pts: conv(b.p) }));
  const linhas = (lista) => (lista || []).map((l) => conv(l.p)).filter((l) => l.length > 1);
  return {
    areas, predios,
    rios: linhas(dados.rio),
    caminhos: linhas(dados.caminho),
    arvores: (dados.arvore || []).map(([la, lo]) => { const q = paraLocal(la, lo); return [q.x, q.z]; }),
    vias: (dados.via || []).map((v) => ({ tipo: v.t, pontos: v.p }))
  };
}

// tipo de área num ponto: a menor área que contém o ponto vence (um lago dentro do parque é lago)
export function areaEm(osm, x, z) {
  let melhor = null;
  for (const a of osm.areas) {
    const [x0, z0, x1, z1] = a.caixa;
    if (x < x0 || x > x1 || z < z0 || z > z1) continue;
    if (pontoNoPoligono(x, z, a.pts) && (!melhor || a.area < melhor.area)) melhor = a;
  }
  return melhor;
}

const VERDE = new Set(['parque', 'grama', 'mata', 'esporte', 'agua']);

// zona de cada lado do percurso a cada `passo` metros: 'parque' (verde/água), 'cidade' ou 'livre'
export function zonasDoPercurso(osm, pista, passo = 10, afastamento = 22) {
  const n = Math.ceil(pista.total / passo) + 1;
  const zonas = { [-1]: new Array(n), [1]: new Array(n), passo };
  const perto = osm.predios.map((b) => {
    let cx = 0, cz = 0;
    for (const [x, z] of b.pts) { cx += x; cz += z; }
    return [cx / b.pts.length, cz / b.pts.length];
  });
  for (let i = 0; i < n; i++) {
    const p = pista.em(i * passo);
    const rx = Math.cos(p.ang), rz = Math.sin(p.ang);
    for (const lado of [-1, 1]) {
      const x = p.x + rx * lado * afastamento, z = p.z + rz * lado * afastamento;
      const a = areaEm(osm, x, z);
      const temPredio = perto.some(([bx, bz]) => (bx - x) ** 2 + (bz - z) ** 2 < 35 * 35);
      zonas[lado][i] = a && VERDE.has(a.tipo) && !temPredio ? 'parque' : (temPredio || a?.tipo === 'bairro') ? 'cidade' : 'livre';
    }
  }
  return zonas;
}

export function zonaEm(zonas, s, lado) {
  if (!zonas) return 'cidade';
  const arr = zonas[lado];
  return arr[Math.max(0, Math.min(arr.length - 1, Math.round(s / zonas.passo)))];
}
