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
  const ruas = (dados.via || []).filter((v) => v.n).map((v) => ({ nome: v.n, pts: conv(v.p) }));
  const pontos = (dados.poi || []).map((p) => { const q = paraLocal(p.la, p.lo); return { nome: p.nome, tipo: p.tipo, x: q.x, z: q.z }; });
  // parques e lagos com nome que não vieram como ponto: usa o centro da área
  for (const a of areas) {
    if (!a.nome || !['parque', 'agua'].includes(a.tipo) || pontos.some((p) => p.nome === a.nome)) continue;
    let x = 0, z = 0;
    for (const [px, pz] of a.pts) { x += px; z += pz; }
    pontos.push({ nome: a.nome, tipo: a.tipo === 'agua' ? 'lago' : 'parque', x: x / a.pts.length, z: z / a.pts.length });
  }
  return {
    areas, predios, ruas, pontos,
    rios: linhas(dados.rio),
    caminhos: linhas(dados.caminho),
    semaforos: (dados.semaforo || []).map(([la, lo]) => { const q = paraLocal(la, lo); return [q.x, q.z]; }),
    arvores: (dados.arvore || []).map(([la, lo]) => { const q = paraLocal(la, lo); return [q.x, q.z]; }),
    vias: (dados.via || []).map((v) => ({ tipo: v.t, pontos: v.p, nome: v.n }))
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

// por qual rua o percurso passa em cada trecho: rua com nome paralela e a menos de 14 m
export function ruasDoPercurso(osm, pista, passo = 10) {
  const amostras = [];
  for (let s = 0; s <= pista.total; s += passo) {
    const p = pista.em(s);
    const fx = Math.sin(p.ang), fz = -Math.cos(p.ang);
    let melhor = null;
    for (const r of osm.ruas) {
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
        if (!l2) continue;
        const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / l2));
        const dist = Math.hypot(p.x - ax - dx * t, p.z - az - dz * t);
        if (dist > 14) continue;
        const alinhado = Math.abs(dx * fx + dz * fz) / Math.sqrt(l2);
        if (alinhado < 0.85) continue;
        if (!melhor || dist < melhor.dist) melhor = { dist, nome: r.nome };
      }
    }
    amostras.push(melhor?.nome || null);
  }
  // junta em trechos, tolerando falhas curtas, e descarta trechos pequenos
  const trechos = [];
  amostras.forEach((nome, i) => {
    if (!nome) return;
    const s = i * passo, ult = trechos[trechos.length - 1];
    if (ult && ult.nome === nome && s - ult.s1 <= 50) ult.s1 = s;
    else trechos.push({ nome, s0: s, s1: s });
  });
  return trechos.filter((t) => t.s1 - t.s0 >= 60);
}

// abreviações das placas de rua brasileiras
export function abreviarRua(nome) {
  return nome
    .replace(/^Avenida /, 'Av. ').replace(/^Rua /, 'R. ').replace(/^Estrada /, 'Estr. ').replace(/^Alameda /, 'Al. ')
    .replace(/^Praça /, 'Pça. ').replace(/ Engenheiro /, ' Eng. ').replace(/ Doutor /, ' Dr. ').replace(/ Professora? /, (m) => (m.includes('ora') ? ' Profa. ' : ' Prof. '))
    .replace(/ Prefeito /, ' Pref. ').replace(/ Vereador /, ' Ver. ');
}

// placas ao longo do percurso: nome da rua no começo de cada trecho (e a cada 700 m),
// nome das ruas que cruzam e pontos de referência a até 220 m
export function placasDoPercurso(osm, pista, travessas = []) {
  const placas = [];
  const trechos = ruasDoPercurso(osm, pista);
  const ruaEm = (s) => trechos.find((t) => s >= t.s0 - 20 && s <= t.s1 + 20)?.nome;
  for (const t of trechos) {
    for (let s = t.s0 + 20; s < t.s1 - 30 || s === t.s0 + 20; s += 700) placas.push({ s, lado: 1, tipo: 'rua', nome: t.nome });
  }
  // ruas que cruzam: as principais sempre; as pequenas no máximo uma a cada 180 m, senão vira um paliteiro
  const cruzam = travessas.filter((t) => t.nome && t.nome !== ruaEm(t.s)).sort((a, b) => (b.principal ? 1 : 0) - (a.principal ? 1 : 0));
  for (const t of cruzam) {
    if (!t.principal && placas.some((p) => Math.abs(p.s - t.s) < 180)) continue;
    placas.push({ s: t.s - 7 - (t.vao || 0) / 2, lado: t.lados.includes(1) ? 1 : -1, tipo: 'rua', nome: t.nome });
  }
  const PULAR = /parquinho|playground|^play /i;
  const melhores = new Map();
  for (const p of osm.pontos) {
    if (PULAR.test(p.nome)) continue;
    const perto = pista.pertoDe(p.x, p.z, 300);
    if (perto.dist > 220) continue;
    const q = pista.projetar(p.x, p.z, perto.s, 10, 10);
    const atual = melhores.get(p.nome);
    if (!atual || perto.dist < atual.dist) melhores.set(p.nome, { s: Math.max(15, perto.s - 25), sPonto: perto.s, lado: Math.sign(q.d) || 1, tipo: 'ponto', nome: p.nome, categoria: p.tipo, dist: perto.dist });
  }
  placas.push(...melhores.values());
  placas.sort((a, b) => a.s - b.s);
  // nada de placas umas em cima das outras
  const finais = [];
  for (const p of placas) {
    if (p.s < 10 || p.s > pista.total - 10) continue;
    if (finais.some((f) => f.lado === p.lado && Math.abs(f.s - p.s) < 25)) p.s += 25;
    finais.push(p);
  }
  return finais.sort((a, b) => a.s - b.s);
}
