// Novo desenho das ruas a partir do grafo OSM (projeto de percursos, etapa 4) — contas puras, sem Three.js.
// Cada rua uma vez só, com a largura real; cruzamento = um polígono só; ruas que cruzam o percurso com 50 m.
// Coordenadas locais do jogo: x = leste, z = sul (conversorLocal de src/pista.js), em metros.
//
// No jogo só com ?ruas=osm e o percurso ajustado (?percurso=ajustado); sem isso o desenho é o de sempre.
// Etapa 4b: ruas do percurso e avenidas de pista dupla (montarRuas, a partir de public/ruas/<slug>.json). Etapa 4c:
// cruzamentos (polígono único, cantos arredondados) e ruas que cruzam (50 m, somem no terreno). Ponte e pintura: 4d–4e. O desenho NUNCA muda a corrida: a pista
// (eixo, s, d, penalidade) é a mesma; aqui só se lê a pista.
import { direita } from './pista.js';
import { posicaoEstendida } from './faixas.js';

// ─── largura do asfalto ──────────────────────────────────────────────────────
// padrão por categoria [mão única, mão dupla] quando o OSM não tem width nem lanes
const PADRAO = {
  motorway: [7.5, 15], trunk: [7.5, 14], primary: [7, 10], secondary: [7, 9], tertiary: [6.5, 8],
  residential: [5.5, 7], unclassified: [5.5, 7], living_street: [5, 6], service: [4, 4.5], pedestrian: [5, 5],
  footway: [3, 3], cycleway: [2.5, 2.5], path: [2.5, 2.5], track: [3, 3], steps: [2, 2],
};
export const FAIXA_M = 3.3;
export const CALCADA_M = 2.5;
export const TOCO_M = 50; // ruas que cruzam: 50 m para cada lado
export const SUMIR_M = 15; // últimos metros do toco somem no terreno
export const RAIO_CANTO = 3; // raio do canto do cruzamento (meio-fio), etapa 4c
// ruas que cruzam o percurso e entram no desenho (as de carro; serviço só com nome)
const TOCO_TIPOS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street']);
const base = (t) => (t || '').replace(/_link$/, '');

export function larguraAresta(a) {
  if (a.largura >= 3 && a.largura <= 20 && !['footway', 'cycleway', 'path'].includes(a.tipo)) return { w: a.largura, fonte: 'OSM width' };
  if (a.faixas >= 1 && a.faixas <= 6) return { w: a.faixas * FAIXA_M, fonte: 'OSM lanes' };
  const p = /_link$/.test(a.tipo || '') ? [5.5, 7] : PADRAO[a.tipo] || [5.5, 7];
  return { w: p[a.mao === 'dupla' ? 1 : 0], fonte: 'padrão da categoria' };
}

// ─── vetores ─────────────────────────────────────────────────────────────────
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const perp = (a) => [-a[1], a[0]];
const cruz = (a, b) => a[0] * b[1] - a[1] * b[0];
export function comprimento(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += len(sub(pts[i], pts[i - 1])); return L; }

// corta a polilinha: do metro `de` ao metro `ate` (a partir do começo)
export function trecho(pts, de, ate) {
  const out = []; let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = len(sub(b, a));
    if (L < 1e-9) continue;
    const s0 = s, s1 = s + L;
    if (s1 >= de && s0 <= ate) {
      const f0 = Math.max(0, (de - s0) / L), f1 = Math.min(1, (ate - s0) / L);
      const p0 = add(a, mul(sub(b, a), f0)), p1 = add(a, mul(sub(b, a), f1));
      if (!out.length) out.push(p0);
      out.push(p1);
    }
    s = s1;
  }
  return out;
}

// pontos a cada ≤ passo m (para a altura acompanhar o relevo do percurso, como as amostras de 4 m do desenho atual)
export function densificar(pts, passo = 4) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.ceil(len(sub(b, a)) / passo);
    for (let k = 1; k <= n; k++) out.push(add(a, mul(sub(b, a), k / n)));
  }
  return out;
}

// borda deslocada `d` (positivo = lado perp(u), "esquerda" na ordem anti-horária do plano x,z) com quina em esquadria
// limitada (acima de 3× o deslocamento vira chanfro)
export function deslocar(pts, d) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const t0 = i > 0 ? nrm(sub(pts[i], pts[i - 1])) : null, t1 = i < n - 1 ? nrm(sub(pts[i + 1], pts[i])) : null;
    if (!t0 || !t1) { out.push(add(pts[i], mul(perp(t0 || t1), d))); continue; }
    const m = nrm(add(perp(t0), perp(t1))), c = m[0] * perp(t0)[0] + m[1] * perp(t0)[1];
    if (c < 0.34) { out.push(add(pts[i], mul(perp(t0), d)), add(pts[i], mul(perp(t1), d))); continue; } // chanfro
    out.push(add(pts[i], mul(m, d / c)));
  }
  return out;
}

// faixa entre os deslocamentos d0 < d1 da polilinha → triângulos [[x,z],[x,z],[x,z]]
export function faixaTriangulos(pts, d0, d1) {
  const a = deslocar(pts, d0), b = deslocar(pts, d1), tri = [];
  const n = Math.min(a.length, b.length);
  if (a.length !== b.length) { // chanfro de um lado só: triangula em leque simples (raro)
    const pol = [...a, ...b.slice().reverse()];
    return poligonoTriangulos(pol);
  }
  for (let i = 0; i < n - 1; i++) { tri.push([a[i], b[i], a[i + 1]]); tri.push([b[i], b[i + 1], a[i + 1]]); }
  return tri;
}

// triangulação por orelhas (polígono simples, qualquer sentido)
export function poligonoTriangulos(pol) {
  const p = pol.filter((q, i) => i === 0 || len(sub(q, pol[i - 1])) > 1e-6);
  if (p.length > 2 && len(sub(p[0], p[p.length - 1])) < 1e-6) p.pop();
  if (p.length < 3) return [];
  let area = 0; for (let i = 0; i < p.length; i++) area += cruz(p[i], p[(i + 1) % p.length]);
  const idx = p.map((_, i) => i); if (area < 0) idx.reverse();
  const tri = [];
  const dentro = (q, a, b, c) => cruz(sub(b, a), sub(q, a)) > 1e-9 && cruz(sub(c, b), sub(q, b)) > 1e-9 && cruz(sub(a, c), sub(q, c)) > 1e-9;
  let guarda = 0;
  while (idx.length > 3 && guarda++ < 10000) {
    let cortou = false;
    for (let k = 0; k < idx.length; k++) {
      const a = p[idx[(k + idx.length - 1) % idx.length]], b = p[idx[k]], c = p[idx[(k + 1) % idx.length]];
      if (cruz(sub(b, a), sub(c, b)) <= 1e-9) continue;
      if (idx.some((j) => { const q = p[j]; return q !== a && q !== b && q !== c && dentro(q, a, b, c); })) continue;
      tri.push([a, b, c]); idx.splice(k, 1); cortou = true; break;
    }
    if (!cortou) break; // polígono degenerado: o resto vira leque
  }
  for (let k = 1; k < idx.length - 1; k++) tri.push([p[idx[0]], p[idx[k]], p[idx[k + 1]]]);
  return tri;
}

// ─── rede de ruas a desenhar ─────────────────────────────────────────────────
// grafo: o grafo OSM exportado (scripts de percurso); conv(lat, lon) → {x, z}; rota: Set de ids de aresta do percurso
// minimo(ramo) → {w, calcada}: largura mínima de desenho das ruas do percurso (faixa do corredor; ver exportar-ruas)
export function montarRede(grafo, conv, rota, minimo = null) {
  const P = {}; for (const [id, [la, lo]] of Object.entries(grafo.nos)) { const q = conv(la, lo); P[id] = [q.x, q.z]; }
  const porId = new Map(grafo.arestas.map((a) => [a.id, a]));
  const nosRota = new Set(); for (const id of rota) { const a = porId.get(id); if (a) { nosRota.add(a.nos[0]); nosRota.add(a.nos[a.nos.length - 1]); } }
  const pedacos = []; // {a, pts, nos:[ini, fim], rota, toco}
  for (const a of grafo.arestas) {
    const pts = a.nos.map((n) => P[n]), ini = a.nos[0], fim = a.nos[a.nos.length - 1];
    if (rota.has(a.id)) { pedacos.push({ a, pts, nos: [ini, fim], rota: true, toco: false }); continue; }
    const desenhavel = TOCO_TIPOS.has(base(a.tipo)) || (a.tipo === 'service' && a.nome);
    if (!desenhavel) continue;
    const L = comprimento(pts), em0 = nosRota.has(ini), em1 = nosRota.has(fim);
    if (em0 && em1 && L <= 120) { pedacos.push({ a, pts, nos: [ini, fim], rota: false, toco: false }); continue; } // liga dois pontos do percurso
    if (em0) pedacos.push({ a, pts: trecho(pts, 0, TOCO_M), nos: [ini, `fim:${a.id}:0`], rota: false, toco: L > TOCO_M });
    if (em1) pedacos.push({ a, pts: trecho(pts.slice().reverse(), 0, TOCO_M), nos: [fim, `fim:${a.id}:1`], rota: false, toco: L > TOCO_M });
  }
  for (const p of pedacos) {
    const l = larguraAresta(p.a); p.wReal = l.w; p.w = l.w; p.fonte = l.fonte; p.camada = p.a.camada || 0; p.calc = null;
    const m = p.rota && minimo ? minimo(p.a) : null;
    if (m) { p.w = Math.max(l.w, m.w); p.calc = m.calcada(p.w); }
  }
  // junta pedaços seguidos da mesma rua (nó com só dois pedaços, mesma largura e camada): sem cruzamento à toa
  const inc = new Map(); const liga = (n, p) => { if (!inc.has(n)) inc.set(n, []); inc.get(n).push(p); };
  for (const p of pedacos) { liga(p.nos[0], p); liga(p.nos[1], p); }
  const junta = (n) => { const l = inc.get(n); return l.length === 2 && l[0] !== l[1] && Math.abs(l[0].w - l[1].w) < 0.3 && l[0].camada === l[1].camada && l[0].rota === l[1].rota && !l[0].toco && !l[1].toco && !String(n).startsWith('fim:'); };
  const usado = new Set(), ramos = [];
  for (const p0 of pedacos) {
    if (usado.has(p0)) continue;
    usado.add(p0);
    let pts = p0.pts.slice(), nos = [...p0.nos], grupo = [p0];
    for (const lado of [1, 0]) {
      for (;;) {
        const n = nos[lado];
        if (!junta(n)) break;
        const q = inc.get(n).find((x) => !grupo.includes(x));
        if (!q || usado.has(q)) break;
        usado.add(q); grupo.push(q);
        const qp = q.nos[0] === n ? q.pts : q.pts.slice().reverse(), outro = q.nos[0] === n ? q.nos[1] : q.nos[0];
        if (lado === 1) { pts = [...pts, ...qp.slice(1)]; nos[1] = outro; } else { pts = [...qp.slice().reverse(), ...pts.slice(1)]; nos[0] = outro; }
      }
    }
    const a = p0.a;
    ramos.push({ pts, nos, w: p0.w, wReal: p0.wReal, calc: p0.calc, fonte: p0.fonte, camada: p0.camada, ponte: !!a.ponte, rota: p0.rota, toco: grupo.some((g) => g.toco),
      nome: a.nome || null, tipo: a.tipo, mao: a.mao, faixas: a.faixas || null, arestas: grupo.map((g) => g.a.id) });
  }
  return { P, ramos, info: grafo.nosInfo || {} };
}

// ─── cruzamentos ─────────────────────────────────────────────────────────────
// Em cada nó com 2+ pontas: ordena as pontas pelo ângulo; a borda esquerda de uma e a direita da seguinte se cruzam
// num ponto X — cada ponta recua até lá (recorte) e o cruzamento é o polígono R₁ L₁ (curva por X) R₂ L₂ …
// Cantos arredondados: curva quadrática de L de uma ponta até R da seguinte com controle em X.
export function cruzamentos(rede) {
  const pontas = new Map();
  rede.ramos.forEach((r, i) => {
    for (const lado of [0, 1]) {
      const n = r.nos[lado];
      if (String(n).startsWith('fim:')) continue;
      const pts = lado === 0 ? r.pts : r.pts.slice().reverse();
      const alvo = trecho(pts, 0, Math.min(6, comprimento(pts)));
      const u = nrm(sub(alvo[alvo.length - 1], pts[0]));
      if (!pontas.has(n)) pontas.set(n, []);
      pontas.get(n).push({ ramo: i, lado, u, h: r.w / 2, c: pts[0], camada: r.camada });
    }
  });
  const recorte = rede.ramos.map(() => [0, 0]), polis = [];
  for (const [n, lista0] of pontas) {
    // cada camada à parte (rampa de ponte que encosta num nó do chão continua como junção simples)
    for (const camada of new Set(lista0.map((p) => p.camada))) {
      const lista = lista0.filter((p) => p.camada === camada);
      if (lista.length < 2) continue;
      const N = lista[0].c;
      lista.sort((a, b) => Math.atan2(a.u[1], a.u[0]) - Math.atan2(b.u[1], b.u[0]));
      const m = lista.length, cut = lista.map((p) => (m === 2 ? 0 : 0.5 * p.h)), X = new Array(m).fill(null);
      for (let k = 0; k < m; k++) {
        const a = lista[k], b = lista[(k + 1) % m];
        const pa = add(N, mul(perp(a.u), a.h)), pb = add(N, mul(perp(b.u), -b.h));
        const den = cruz(a.u, b.u);
        if (Math.abs(den) < 0.15) continue; // quase paralelas (continuação reta): sem recorte por este par
        const t = cruz(sub(pb, pa), b.u) / den, r = cruz(sub(pb, pa), a.u) / den;
        if (t < -0.5 || r < -0.5 || t > 30 || r > 30) continue;
        // + RAIO_CANTO: as pontas recuam além do encontro das guias, e o canto vira curva (meio-fio arredondado)
        cut[k] = Math.max(cut[k], Math.min(30, t + RAIO_CANTO)); cut[(k + 1) % m] = Math.max(cut[(k + 1) % m], Math.min(30, r + RAIO_CANTO));
        X[k] = add(pa, mul(a.u, t));
      }
      if (m === 2 && cut[0] < 0.6 && cut[1] < 0.6) continue; // continuação quase reta: as faixas se emendam sozinhas
      const pol = [], cantos = [];
      for (let k = 0; k < m; k++) {
        const a = lista[k], b = lista[(k + 1) % m];
        const ca = add(N, mul(a.u, cut[k])), cb = add(N, mul(b.u, cut[(k + 1) % m]));
        const Ra = add(ca, mul(perp(a.u), -a.h)), La = add(ca, mul(perp(a.u), a.h)), Rb = add(cb, mul(perp(b.u), -b.h));
        pol.push(Ra, La);
        if (X[k]) {
          // canto arredondado (meio-fio): curva de La até Rb com controle em X; a calçada acompanha por fora
          const curva = [La];
          for (let q = 1; q < 6; q++) { const t = q / 6, u1 = 1 - t; const c = add(add(mul(La, u1 * u1), mul(X[k], 2 * u1 * t)), mul(Rb, t * t)); pol.push(c); curva.push(c); }
          curva.push(Rb); cantos.push(curva);
        }
      }
      polis.push({ no: n, camada, pol, centro: N, cantos });
      lista.forEach((p, k) => { recorte[p.ramo][p.lado] = Math.max(recorte[p.ramo][p.lado], cut[k]); });
    }
  }
  return { polis, recorte };
}

// ─── etapa 4b: desenho no jogo a partir de public/ruas/<slug>.json ──────────
// dados de uma distância: { pistaTotal, ramos: [{ pts, w, calc, camada, faixas: [[s0, s1]…] }], zonasFita: [[s0, s1]…],
// remendos: [{ tipo: 'asfalto'|'calcada', lado, s0, s1, passada }] }. zonasFita = trechos que continuam com a fita
// do desenho atual (ponte/viaduto até a etapa 4d e o fallback da ligação que falta no OSM).
const MEIA = 4, LIMITE = 7.6;
// no jogo o asfalto é desenhado ACIMA m acima da calçada (src/main.js): diferenças menores de altura não aparecem
export const ACIMA = 0.06; // = MEIA_RUA e LIMITE_CALCADA de src/regras.js (faixa do corredor e penalidade)

function indice(C = 10) {
  const m = new Map(), k = (ix, iz) => ix * 100003 + iz;
  return {
    por(x0, z0, x1, z1, v) { for (let ix = Math.floor(x0 / C); ix <= Math.floor(x1 / C); ix++) for (let iz = Math.floor(z0 / C); iz <= Math.floor(z1 / C); iz++) { const q = k(ix, iz); if (!m.has(q)) m.set(q, []); m.get(q).push(v); } },
    perto(x, z, r = 0) { const out = new Set(); for (let ix = Math.floor((x - r) / C); ix <= Math.floor((x + r) / C); ix++) for (let iz = Math.floor((z - r) / C); iz <= Math.floor((z + r) / C); iz++) for (const v of m.get(k(ix, iz)) || []) out.add(v); return out; },
  };
}
const emZona = (s, zonas) => zonas.some(([a, b]) => s >= a && s <= b);

// eixo da pista a cada 2 m e a altura "da rua" num ponto: o ponto mais perto do eixo (interpolado), só nas passagens
// que andam nesta rua (faixas) e na mesma camada (viaduto ou chão)
export function eixoDaPista(pista) {
  const eixo = [], ix = indice(10);
  for (let s = 0; s <= pista.total; s += 2) { const q = pista.em(s); const a = { s, k: eixo.length, x: q.x, z: q.z, y: q.y, alto: (pista.elevacao?.(s) || 0) > 0.3 }; eixo.push(a); ix.por(q.x, q.z, q.x, q.z, a); }
  const alturaEm = (x, z, camada, faixas = null, raio = 40) => {
    let melhor = null, melhorQ = null;
    for (const a of ix.perto(x, z, raio)) {
      if (faixas && !faixas.some(([s0, s1]) => a.s >= s0 && a.s <= s1)) continue;
      for (const b of [eixo[a.k - 1], eixo[a.k + 1]]) {
        if (!b) continue;
        const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
        const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t), y = a.y + (b.y - a.y) * t, s = a.s + (b.s - a.s) * t;
        if ((camada == null || a.alto === camada >= 1) && (!melhor || d < melhor.d)) melhor = { d, y, s };
        if (!melhorQ || d < melhorQ.d) melhorQ = { d, y, s };
      }
    }
    const r = melhor && melhor.d < raio ? melhor : melhorQ;
    if (r) return r;
    if (faixas) return alturaEm(x, z, camada, null, raio);
    return raio < 400 ? alturaEm(x, z, camada, null, raio * 3) : { y: 0, s: -1, d: Infinity };
  };
  return { eixo, ix, alturaEm };
}

// tira ao longo do eixo da pista (d0..d1 a partir do eixo), a cada 2 m; também antes da largada (s < 0)
export function faixaDoEixo(pista, s0, s1, d0, d1, tipo, out) {
  const pts = [];
  for (let s = Math.max(-30, s0); s <= Math.min(pista.total, s1) + 1e-9; s += 2) { const q = posicaoEstendida(pista, s); pts.push({ s, x: q.x, z: q.z, y: q.y, ang: q.ang }); }
  for (let k = 0; k < pts.length - 1; k++) {
    const A = pts[k], B = pts[k + 1], [ra, rza] = direita(A.ang), [rb, rzb] = direita(B.ang);
    const v = (P, rx, rz, d) => [P.x + rx * d, P.z + rz * d];
    const camada = A.s >= 0 && (pista.elevacao?.(A.s) || 0) > 0.3 ? 1 : 0;
    const q = [v(A, ra, rza, d0), v(A, ra, rza, d1), v(B, rb, rzb, d0), v(B, rb, rzb, d1)];
    out.push({ t: [q[0], q[1], q[2]], tipo, camada, y: [A.y, A.y, B.y] }, { t: [q[1], q[3], q[2]], tipo, camada, y: [A.y, B.y, B.y] });
  }
}

// remendo (D1): tira do eixo até a beira da faixa do corredor (asfalto) ou até a penalidade (calçada), só do lado que
// faltava; nas curvas fechadas (> 20° em 6 m) a tira dobra por dentro, então vão discos a cada 2 m
export function remendoTris(pista, r, out) {
  const m = r.passada || 1, asf = r.tipo === 'asfalto', tipo = asf ? 'alargamento' : 'alargamentoCalcada';
  // (cada lado passa 0,5 m do eixo: nas curvas fechadas as duas tiras dobram e deixariam uma fresta no meio)
  if (asf) faixaDoEixo(pista, r.s0, r.s1, r.lado < 0 ? -MEIA - 0.25 * m : -0.5, r.lado < 0 ? 0.5 : MEIA + 0.25 * m, tipo, out);
  else faixaDoEixo(pista, r.s0, r.s1, r.lado < 0 ? -LIMITE - 0.2 * m : MEIA, r.lado < 0 ? -MEIA : LIMITE + 0.2 * m, tipo, out);
  for (let s = Math.max(0, r.s0); s <= Math.min(pista.total, r.s1); s += 2) {
    let v = Math.abs(pista.em(Math.min(pista.total, s + 3)).ang - pista.em(Math.max(0, s - 3)).ang); if (v > Math.PI) v = 2 * Math.PI - v;
    if (v < (20 * Math.PI) / 180) continue;
    const q = pista.em(s), R = asf ? MEIA + 0.3 * m : LIMITE + 0.25 * m, camada = (pista.elevacao?.(s) || 0) > 0.3 ? 1 : 0;
    const anel = (r) => Array.from({ length: 14 }, (_, k) => [q.x + r * Math.cos((k * 2 * Math.PI) / 14), q.z + r * Math.sin((k * 2 * Math.PI) / 14)]);
    const fora = anel(R);
    if (asf) for (let k = 0; k < 14; k++) out.push({ t: [[q.x, q.z], fora[k], fora[(k + 1) % 14]], tipo, camada, y: [q.y, q.y, q.y] });
    else { // calçada: anel de MEIA até R (nunca dentro da faixa do corredor)
      const dentro = anel(MEIA);
      for (let k = 0; k < 14; k++) { const k1 = (k + 1) % 14; out.push({ t: [dentro[k], fora[k], fora[k1]], tipo, camada, y: [q.y, q.y, q.y] }, { t: [dentro[k], fora[k1], dentro[k1]], tipo, camada, y: [q.y, q.y, q.y] }); }
    }
  }
}

// triângulos do desenho novo (sem as zonas de fita, que o jogo desenha com o código de sempre)
// tipos: asfalto, calcada (ruas do mapa), alargamento, alargamentoCalcada (remendos D1)
export function montarRuas(pista, dados, { eixo = null } = {}) {
  const E = eixo || eixoDaPista(pista), out = [], zonas = dados.zonasFita || [];
  // 4d: no trecho elevado (rampa e tabuleiro) a estrutura do viaduto (src/viaduto.js) tem a barreira a LIMITE do eixo:
  // nada da rua do mapa passa dela (senão o asfalto ficaria pendurado fora da ponte)
  const foraDoTabuleiro = (t) => {
    const x = (t[0][0] + t[1][0] + t[2][0]) / 3, z = (t[0][1] + t[1][1] + t[2][1]) / 3, h = E.alturaEm(x, z, null, null, 12);
    return (pista.elevacao?.(h.s) || 0) > 0.3 && h.d > LIMITE + 0.15;
  };
  for (const r of dados.ramos) {
    const pts = densificar(r.pts, 4), tipoR = r.tipo || 'rota', rota = tipoR === 'rota';
    // altura: rua do percurso pelas próprias passagens; ligação pelas passagens dos nós; rua que cruza (toco) fica na
    // altura do ponto onde encosta no percurso e some (alfa) nos últimos SUMIR_M metros (etapa 4c)
    // (etapa 4d) rua do percurso: altura só pelas próprias passagens, sem filtrar camada — na cabeceira da ponte a
    // rampa continua da mesma passagem (filtrar "chão" pegava a altura do chão 30 m adiante e fazia degrau)
    let yDe = ([x, z]) => E.alturaEm(x, z, tipoR === 'toco' ? r.camada : null, r.faixas);
    let alfa = () => 1;
    if (tipoR === 'toco') {
      const h0 = E.alturaEm(...pts[0], r.camada, r.faixas);
      // rua que cruza não sai de trecho elevado (rampa/tabuleiro): ficaria flutuando ao lado da ponte (4d)
      if ((pista.elevacao?.(h0.s) || 0) > 0.3) continue;
      yDe = () => h0;
      const L = r.comprimento, d0 = r.recorteInicio || 0;
      alfa = ([x, z]) => { const d = d0 + Math.hypot(x - pts[0][0], z - pts[0][1]); return Math.max(0, Math.min(1, (L - d) / SUMIR_M)); };
    }
    // ligação (rua curta entre dois pontos do percurso, ex.: passagem do canteiro) é asfalto como a rua do percurso
    const tA = tipoR === 'toco' ? 'toco' : 'asfalto', tC = tipoR === 'toco' ? 'tocoCalcada' : 'calcada';
    const partes = [[tA, -r.w / 2, r.w / 2], [tC, -r.w / 2 - r.calc, -r.w / 2], [tC, r.w / 2, r.w / 2 + r.calc]];
    for (const [tipo, d0, d1] of partes) {
      for (const t of faixaTriangulos(pts, d0, d1)) {
        const hs = t.map(yDe);
        // pedaço dentro de uma zona de fita (fallback, alturas que não batem): fica com a fita de sempre
        if (r.faixas && hs.every((h) => emZona(h.s, zonas))) continue;
        if (foraDoTabuleiro(t)) continue;
        out.push({ t, tipo, camada: r.camada, y: hs.map((h) => h.y), faixas: r.faixas, a: tipoR === 'toco' ? t.map(alfa) : null });
      }
    }
  }
  // cruzamentos (etapa 4c): polígono único, cantos arredondados, um pouco maior (0,3 m) para encostar sem fresta nas
  // pontas recortadas das ruas; calçada acompanhando o meio-fio dos cantos
  for (const c of dados.cruzamentos || []) {
    const yDe = ([x, z]) => E.alturaEm(x, z, c.camada, c.faixas);
    const [cx, cz] = c.centro;
    const pol = c.pol.map(([x, z]) => { const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1; return [x + (dx / l) * 0.3, z + (dz / l) * 0.3]; });
    const tris = poligonoTriangulos(pol).map((t) => ({ t, hs: t.map(yDe) }));
    if (tris.length && tris.every((q) => q.hs.every((h) => emZona(h.s, zonas)))) continue;
    for (const q of tris) if (!foraDoTabuleiro(q.t)) out.push({ t: q.t, tipo: 'cruzamento', camada: c.camada, y: q.hs.map((h) => h.y), faixas: c.faixas });
    for (const curva of c.cantos || []) {
      const fora = curva.map(([x, z]) => { const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1; return [x + (dx / l) * CALCADA_M, z + (dz / l) * CALCADA_M]; });
      for (let k = 0; k < curva.length - 1; k++) for (const t of [[curva[k], fora[k], curva[k + 1]], [fora[k], fora[k + 1], curva[k + 1]]]) if (!foraDoTabuleiro(t)) out.push({ t, tipo: 'calcada', camada: c.camada, y: t.map((p) => yDe(p).y), faixas: c.faixas });
    }
  }
  for (const rm of dados.remendos || []) { const n0 = out.length; remendoTris(pista, rm, out); for (let k = n0; k < out.length; k++) out[k].faixas = [[rm.s0 - 30, rm.s1 + 30]]; }
  // nada por cima do corredor: pedaço de rua do mapa que fique 0,15–5,5 m acima da faixa de OUTRA passagem (ex.:
  // ligação entre duas pistas com altitudes diferentes no Portal, Indaiatuba 21K) não é desenhado
  const limpos = out.filter((q) => !cobreOutraPassagem(q, E, q.faixas));
  // calçada nunca em cima de asfalto: onde duas ruas se encontram (sem o recorte dos cruzamentos, que vem na 4c) a
  // calçada de uma passaria por cima do asfalto da outra numa rampa
  const asf = limpos.filter((q) => q.tipo === 'asfalto' || q.tipo === 'alargamento' || q.tipo === 'cruzamento'), ia = indice(8);
  asf.forEach((q, k) => { const xs = q.t.map((p) => p[0]), zs = q.t.map((p) => p[1]); ia.por(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), k); });
  // (pelo centro do triângulo, e só se a calçada ficaria ACIMA do asfalto — o asfalto é desenhado 1 cm acima dela)
  const sobreAsfalto = (q) => {
    const pts = [[(q.t[0][0] + q.t[1][0] + q.t[2][0]) / 3, (q.t[0][1] + q.t[1][1] + q.t[2][1]) / 3, (q.y[0] + q.y[1] + q.y[2]) / 3]];
    if (q.tipo === 'toco' || q.tipo === 'tocoCalcada') q.t.forEach((p, j) => pts.push([p[0], p[1], q.y[j]]));
    for (const [x, z, y] of pts) for (const k of ia.perto(x, z)) { const a = asf[k]; if (!dentroTri(x, z, a.t, -1e-3)) continue; const dy = y - alturaNoTri(x, z, a); if (dy > ACIMA && dy < 1.5) return true; }
    return false;
  };
  // (rua que cruza também nunca por cima do asfalto da rua do percurso nem do cruzamento)
  const semCobrir = limpos.filter((q) => !['calcada', 'alargamentoCalcada', 'toco', 'tocoCalcada'].includes(q.tipo) || !sobreAsfalto(q));
  // rua que cruza (toco) é plana na altura de onde sai do percurso: onde ela encontra outro asfalto (outra pista do
  // percurso, outro cruzamento, outro toco) em altura diferente (> 10 cm), ela para ali — senão vira degrau
  const base = semCobrir.filter((q) => q.tipo === 'asfalto' || q.tipo === 'alargamento' || q.tipo === 'cruzamento'), ib = indice(8);
  const poe = (q) => { const xs = q.t.map((p) => p[0]), zs = q.t.map((p) => p[1]); ib.por(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), q); };
  base.forEach(poe);
  const bate = (q) => q.t.concat([[(q.t[0][0] + q.t[1][0] + q.t[2][0]) / 3, (q.t[0][1] + q.t[1][1] + q.t[2][1]) / 3]]).some(([x, z], j) => {
    const y = j < 3 ? q.y[j] : (q.y[0] + q.y[1] + q.y[2]) / 3;
    for (const o of ib.perto(x, z)) if (dentroTri(x, z, o.t, 1e-6) && Math.abs(alturaNoTri(x, z, o) - y) > 0.1) return true;
    return false;
  });
  const fica = new Set();
  for (const q of semCobrir) if (q.tipo === 'toco' && !bate(q)) { fica.add(q); poe(q); }
  // a calçada do toco acompanha: só onde o asfalto do mesmo toco ficou (mesmo trecho de rua, pelas passagens)
  return semCobrir.filter((q) => q.tipo !== 'toco' ? (q.tipo !== 'tocoCalcada' || !bate(q)) : fica.has(q));
}
function cobreOutraPassagem(q, E, proprias) {
  for (let k = 0; k < 4; k++) {
    const [x, z] = k < 3 ? q.t[k] : [(q.t[0][0] + q.t[1][0] + q.t[2][0]) / 3, (q.t[0][1] + q.t[1][1] + q.t[2][1]) / 3];
    const y = k < 3 ? q.y[k] : (q.y[0] + q.y[1] + q.y[2]) / 3;
    for (const a of E.ix.perto(x, z, LIMITE + 1)) {
      if (proprias && proprias.some(([s0, s1]) => a.s >= s0 && a.s <= s1)) continue; // a própria passagem desta rua
      for (const b of [E.eixo[a.k - 1], E.eixo[a.k + 1]]) {
        if (!b) continue;
        const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
        const dy = y - (a.y + (b.y - a.y) * t);
        if (dy > 0.15 && dy < 5.5 && Math.hypot(x - a.x - dx * t, z - a.z - dz * t) < LIMITE + 0.5) return true;
      }
    }
  }
  return false;
}

// para medir (node): a fita de sempre nas zonas de fita, como o jogo desenha (rua ±4 m, calçada até 7,6 m)
export function fitaDasZonas(pista, zonas, out = []) {
  for (const [a, b] of zonas) { faixaDoEixo(pista, a, b, -MEIA, MEIA, 'fita', out); faixaDoEixo(pista, a, b, -LIMITE, -MEIA, 'fitaCalcada', out); faixaDoEixo(pista, a, b, MEIA, LIMITE, 'fitaCalcada', out); }
  return out;
}

function alturaNoTri(x, z, t) {
  const [[ax, az], [bx, bz], [cx, cz]] = t.t, den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(den) < 1e-9) return (t.y[0] + t.y[1] + t.y[2]) / 3;
  const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den;
  return l1 * t.y[0] + l2 * t.y[1] + (1 - l1 - l2) * t.y[2];
}
function dentroTri(x, z, t, margem = 1e-9) {
  const [[ax, az], [bx, bz], [cx, cz]] = t;
  const d1 = (bx - ax) * (z - az) - (bz - az) * (x - ax), d2 = (cx - bx) * (z - bz) - (cz - bz) * (x - bx), d3 = (ax - cx) * (z - cz) - (az - cz) * (x - cx);
  return (d1 >= -margem && d2 >= -margem && d3 >= -margem) || (d1 <= margem && d2 <= margem && d3 <= margem);
}
const ASF = new Set(['asfalto', 'cruzamento', 'fita', 'alargamento', 'toco']), PIS = new Set([...ASF, 'calcada', 'fitaCalcada', 'alargamentoCalcada', 'tocoCalcada']);

// faixa do corredor: a cada 1 m (de 25 m antes da largada, onde o pelotão espera, até a chegada) e a cada 0,5 m de
// lado — até ±4 m tem que ter asfalto e até ±7,6 m (penalidade) asfalto ou calçada, na altura do corredor (±1,5 m)
// zonas: trechos com a fita de sempre (medida pelo checador do desenho atual, scripts/checar-sobreposicao.mjs) — pulados
export function medirFaixa(pista, tris, { passo = 1, zonas = [], eixo = null } = {}) {
  // calçada encostada em outro trecho do percurso em outra altura (ex.: rampa da ponte ao lado da avenida de baixo):
  // ali ela termina onde a outra começa, como a fita de sempre faz (folgaLateral) — não precisa ir até 7,6 m
  const E = eixo || eixoDaPista(pista);
  const calcadaCompartilhada = (x, z, s, y) => {
    for (const a of E.ix.perto(x, z, LIMITE + 1)) if (Math.abs(a.s - s) > 60 && Math.abs(a.y - y) > 0.3 && Math.hypot(a.x - x, a.z - z) < LIMITE) return true;
    return false;
  };
  const it = indice(8);
  tris.forEach((t, k) => { const xs = t.t.map((q) => q[0]), zs = t.t.map((q) => q[1]); it.por(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), k); });
  const coberto = (x, z, y, tipos) => { for (const k of it.perto(x, z)) { const t = tris[k]; if (!tipos.has(t.tipo) || !dentroTri(x, z, t.t)) continue; if (Math.abs(alturaNoTri(x, z, t) - y) < 1.5) return true; } return false; };
  const falta = [], porCima = [];
  // superfície desenhada mais alta no ponto (até 5,5 m acima do corredor): é o que aparece embaixo do pé
  // calçada que aparece por cima do asfalto dentro da faixa do corredor (o asfalto é desenhado 1 cm acima)
  const superficie = (x, z, y) => {
    let asf = null, outra = null;
    for (const k of it.perto(x, z)) {
      const t = tris[k]; if (t.tipo.startsWith('fita') || !dentroTri(x, z, t.t)) continue;
      const dy = alturaNoTri(x, z, t) - y; if (dy <= -1.5 || dy >= 5.5) continue;
      // (rua que cruza conta como "outra": ela não pode aparecer por cima do asfalto da rua do percurso)
      if (ASF.has(t.tipo) && t.tipo !== 'toco') { if (!asf || dy > asf.dy) asf = { tipo: t.tipo, dy }; } else if (!outra || dy > outra.dy) outra = { tipo: t.tipo, dy };
    }
    return outra && (!asf || outra.dy > asf.dy + ACIMA) ? outra : asf || outra;
  };
  let pontos = 0;
  // algo desenhado 0,15–5,5 m acima do corredor (a fita de sempre fica de fora: ela já se encolhe sozinha)
  // 'outra': rua de outra passagem (ou remendo) por cima; 'propria': a própria rua um pouco acima na beira (inclinação
  // lateral numa curva em subida: o jogo trata o corte da rua como plano) — só a 'outra' é defeito
  const acima = (x, z, y, s) => {
    let pior = null;
    for (const k of it.perto(x, z)) {
      const t = tris[k]; if (t.tipo.startsWith('fita') || !dentroTri(x, z, t.t)) continue;
      const dy = alturaNoTri(x, z, t) - y; if (!(dy > 0.15 && dy < 5.5)) continue;
      const propria = !!t.faixas && t.faixas.some(([a, b]) => s >= a && s <= b);
      if (!propria) return { tipo: 'outra', dy };
      if (!pior || dy > pior.dy) pior = { tipo: 'propria', dy };
    }
    return pior;
  };
  for (let s = -25; s <= pista.total; s += passo) {
    if (emZona(s, zonas)) continue;
    const q = posicaoEstendida(pista, s), [rx, rz] = direita(q.ang);
    for (let d = -LIMITE; d <= LIMITE + 1e-9; d += 0.5) {
      const naRua = Math.abs(d) <= MEIA; pontos++;
      if (!coberto(q.x + rx * d, q.z + rz * d, q.y, naRua ? ASF : PIS) && (naRua || !calcadaCompartilhada(q.x + rx * d, q.z + rz * d, s, q.y))) falta.push({ s, lado: Math.sign(d) || 1, tipo: naRua ? 'asfalto' : 'calcada', d });
      const ac = s >= 0 ? acima(q.x + rx * d, q.z + rz * d, q.y, s) : null;
      if (ac) porCima.push({ s, d, ...ac });
      if (naRua && s >= 0) { const topo = superficie(q.x + rx * d, q.z + rz * d, q.y); if (topo && (!ASF.has(topo.tipo) || topo.tipo === 'toco')) porCima.push({ s, d, tipo: 'outra', dy: topo.dy, calcadaNaRua: true, tipoTopo: topo.tipo }); }
    }
  }
  return { pontos, falta, porCima };
}
