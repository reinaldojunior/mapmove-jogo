// Travessas: ruas reais (OpenStreetMap) que cruzam ou chegam no percurso.
// A parte que encontra os cruzamentos é pura e testada em test/travessas.test.js.

import { anguloDe, direita } from './pista.js';

export const VIAS_PRINCIPAIS = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'
]);

const SENO_MIN = 0.5; // ignora ruas quase paralelas ao percurso (menos de 30°): é a própria rua da prova
const DIST_T = 9; // rua que termina a menos de 9 m do percurso conta como cruzamento em T
const JUNTAR_M = 22;

function cruzamento(ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den;
  const u = ((cx - ax) * rz - (cz - az) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null;
}

// vias: [{ tipo: 'primary', pontos: [[lat, lng], ...] }]
export function encontrarTravessas(pista, vias) {
  const achados = [];
  for (const via of vias) {
    const principal = VIAS_PRINCIPAIS.has(via.tipo);
    const pts = via.pontos.map(([la, lo]) => pista.paraLocal(la, lo));
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.5) continue;
      const segs = new Set([...pista.segmentosPerto(a.x, a.z), ...pista.segmentosPerto(b.x, b.z), ...pista.segmentosPerto((a.x + b.x) / 2, (a.z + b.z) / 2)]);
      for (const i of segs) {
        const px = pista.x[i], pz = pista.z[i], qx = pista.x[i + 1], qz = pista.z[i + 1];
        const plen = Math.hypot(qx - px, qz - pz) || 1;
        const seno = Math.abs(((b.x - a.x) * (qz - pz) - (b.z - a.z) * (qx - px)) / (len * plen));
        if (seno < SENO_MIN) continue;
        const c = cruzamento(px, pz, qx, qz, a.x, a.z, b.x, b.z);
        if (c) {
          // a via atravessa a rua: dos dois lados, a menos que comece/termine bem ali
          const s = pista.s[i] + (pista.s[i + 1] - pista.s[i]) * c.t;
          const [rx, rz] = direita(anguloDe(qx - px, qz - pz));
          const lado = (p) => Math.sign((p.x - px) * rx + (p.z - pz) * rz) || 1;
          const lados = [];
          if (k > 0 || c.u * len > DIST_T) lados.push(lado(a));
          if (k < pts.length - 2 || (1 - c.u) * len > DIST_T) lados.push(lado(b));
          achados.push({ s, lados: [...new Set(lados)], principal });
        }
      }
    }
    // rua que termina encostada no percurso (cruzamento em T)
    for (const [ponta, vizinho] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]]) {
      if (!vizinho) continue;
      const q = pista.projetar(ponta.x, ponta.z, pista.total / 2, pista.total, pista.total);
      if (Math.abs(q.d) > DIST_T) continue;
      const qv = pista.projetar(vizinho.x, vizinho.z, q.s, 60, 60);
      if (Math.abs(qv.d) < DIST_T || Math.abs(qv.d - q.d) < Math.abs(qv.s - q.s) * SENO_MIN) continue;
      achados.push({ s: q.s, lados: [Math.sign(qv.d) || 1], principal });
    }
  }
  achados.sort((a, b) => a.s - b.s);
  const juntos = [];
  for (const t of achados) {
    const ult = juntos[juntos.length - 1];
    if (ult && t.s - ult.s < JUNTAR_M) {
      ult.lados = [...new Set([...ult.lados, ...t.lados])];
      ult.principal = ult.principal || t.principal;
    } else juntos.push({ ...t, lados: [...t.lados] });
  }
  return juntos.filter((t) => t.s > 15 && t.s < pista.total - 15);
}

// travessas genéricas quando o mapa de ruas não está disponível (e no treino)
export function travessasGenericas(total, inicio = 120, aleat = Math.random) {
  const lista = [];
  for (let s = inicio; s < total - 60; s += 170 + aleat() * 160) {
    const r = aleat();
    lista.push({ s, lados: r < 0.5 ? [-1, 1] : [r < 0.75 ? -1 : 1], principal: aleat() < 0.4 });
  }
  return lista;
}

const SERVIDORES = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];

// busca as ruas em volta do percurso no OpenStreetMap
export async function buscarVias(pontosLatLng) {
  let s = 90, w = 180, n = -90, e = -180;
  for (const [la, lo] of pontosLatLng) { s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, lo); e = Math.max(e, lo); }
  const m = 0.0006;
  const q = `[out:json][timeout:20];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street)(_link)?$"](${s - m},${w - m},${n + m},${e + m});out geom tags;`;
  for (const url of SERVIDORES) {
    try {
      const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: q }), signal: AbortSignal.timeout(15000) });
      if (!r.ok) continue;
      const j = await r.json();
      return (j.elements || []).filter((x) => x.geometry?.length > 1).map((x) => ({ tipo: x.tags?.highway, pontos: x.geometry.map((g) => [g.lat, g.lon]) }));
    } catch { /* tenta o próximo servidor */ }
  }
  return null;
}
