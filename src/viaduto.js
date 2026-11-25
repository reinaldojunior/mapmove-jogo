// Viaduto / ponte urbana onde o percurso passa por cima de outro trecho dele (ex.: ponte Dom José Melhado Campos, em
// Sorocaba, sobre o rio e as avenidas Dom Aguirre e 15 de Agosto). A altura do desenho vem de PistaReal.elevar
// (src/pista.js); aqui só se constrói a obra em volta do tabuleiro, como num viaduto urbano brasileiro:
//
//   • rampas em aterro com muro de contenção dos dois lados, até o encontro (cortina de concreto);
//   • vãos de ~25–35 m sobre pórticos (dois pilares redondos + travessa com aparelhos de apoio de neoprene);
//   • tabuleiro de vigas pré-moldadas em I sob laje de 25 cm (estrutura de 1,45 m: o fundo das vigas fica a 5,55 m
//     do chão com o viaduto a 7 m, gabarito ≥ 5,5 m sobre as avenidas de baixo);
//   • barreira New Jersey com guarda-corpo metálico na beira, juntas de dilatação, drenos e postes de iluminação;
//   • pilares sempre fora da rua de baixo (percurso no chão e ruas do mapa);
//   • o rio debaixo da ponte (polígono de água do OpenStreetMap), com margem em talude.
//
// Nada passa por cima do caminho de quem corre no tabuleiro: travessas e vigas ficam embaixo dele e o braço dos
// postes fica a 9,5 m de altura, só sobre a calçada.
//
// Leve para celular: um único material (cores por vértice) e poucas malhas — uma mesclada com toda a estrutura
// corrida, pilares/travessas/postes em InstancedMesh, juntas e água à parte. Sem texturas.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { planoFita } from './faixas.js';
import { direita } from './pista.js';
import { pontoNoPoligono } from './osm.js';
import { LIMITE_CALCADA, MEIA_RUA } from './regras.js';

// ─── MEDIDAS (metros; alturas relativas ao asfalto do tabuleiro) ─────────────
export const ATERRO = 4.2; // abaixo disso a rampa é aterro com muro de contenção; acima, vão livre sobre pilares
const LAJE = 0.25; // fundo da laje
const VIGA = 1.45; // fundo das vigas pré-moldadas (laje 0,25 + viga 1,2)
const BEIRA = LIMITE_CALCADA; // fim da calçada = face interna da barreira
const FORA = BEIRA + 0.4; // face externa da barreira / borda do tabuleiro
const VIGAS = [-6.4, -3.2, 0, 3.2, 6.4]; // eixo das vigas
const COLUNA_D = 4.6; // afastamento dos pilares do pórtico
const VAO_ALVO = 30; // espaçamento dos pórticos
const TRAVESSA_H = 1.1;
const POSTE_CADA = 32;

const COR = {
  concreto: 0xd9d4c9, concretoEscuro: 0xb9b3a7, laje: 0x86817a, viga: 0xc9c4b9, vigaAlma: 0x8f8a82, muro: 0xd2cabb, muroPe: 0x9d9686,
  barreira: 0xe6e2d9, metal: 0x7c8790, neoprene: 0x2b2b2d, poste: 0x8d969d, luminaria: 0xfff2c4, dreno: 0x55595c,
  talude: 0x86b35a, taludePe: 0x8a7b57
};
const cor = (hex) => new THREE.Color(hex);

const matObra = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.88, side: THREE.DoubleSide });
// junta de dilatação: faixa escura colada no asfalto (polygonOffset maior que o da rua)
const matJunta = new THREE.MeshStandardMaterial({ color: 0x34353a, roughness: 0.6, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -10 });

// ─── MONTADOR DE TRIÂNGULOS (sem índice, uma cor por vértice) ────────────────
class Montador {
  constructor() { this.pos = []; this.cor = []; }
  tri(a, b, c, ca, cb = ca, cc = ca) {
    this.pos.push(...a, ...b, ...c);
    for (const k of [ca, cb, cc]) this.cor.push(k.r, k.g, k.b);
  }
  // quadrilátero a-b-c-d (em volta), cores por vértice
  quad(a, b, c, d, ca, cb = ca, cc = cb, cd = ca) { this.tri(a, b, c, ca, cb, cc); this.tri(a, c, d, ca, cc, cd); }
  // caixa orientada: centro, eixo lateral (rx, rz), meia largura/altura/profundidade
  caixa([cx, cy, cz], [rx, rz], lx, ly, lz, c) {
    const fx = -rz, fz = rx; // ao longo
    const p = (sx, sy, sz) => [cx + rx * lx * sx + fx * lz * sz, cy + ly * sy, cz + rz * lx * sx + fz * lz * sz];
    const v = [p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1), p(-1, 1, -1), p(1, 1, -1), p(1, 1, 1), p(-1, 1, 1)];
    for (const [a, b, c2, d] of [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]) this.quad(v[a], v[b], v[c2], v[d], c);
  }
  geometria() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.cor, 3));
    g.computeVertexNormals();
    return g;
  }
}

// perfil transversal [[d, h, cor], ...] puxado ao longo das linhas `linhas` (cada uma { x, z, y, rx, rz })
function extrudar(m, linhas, perfil) {
  for (let i = 0; i < linhas.length - 1; i++) {
    const A = linhas[i], B = linhas[i + 1];
    const pa = perfil(A), pb = perfil(B);
    for (let k = 0; k < pa.length - 1; k++) {
      const P = (L, [d, h]) => [L.x + L.rx * d, L.y + h, L.z + L.rz * d];
      m.quad(P(A, pa[k]), P(B, pb[k]), P(B, pb[k + 1]), P(A, pa[k + 1]), pa[k][2], pb[k][2], pb[k + 1][2], pa[k + 1][2]);
    }
  }
}

// geometria com cor única por vértice (para as peças instanciadas)
function pintar(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = cor(hex), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// peças instanciadas (geometria unitária)
const GEO = (() => {
  // pilar redondo de 1,3 m, base em y = 0, altura 1 (escala y = altura)
  const coluna = pintar(new THREE.CylinderGeometry(0.65, 0.65, 1, 14, 1, true).translate(0, 0.5, 0), COR.concreto);
  // travessa do pórtico (topo em y = 0) com os aparelhos de apoio de neoprene em cima, um por viga
  const partes = [pintar(new THREE.BoxGeometry(2 * (FORA - 0.5), TRAVESSA_H, 1.7).translate(0, -TRAVESSA_H / 2, 0), COR.concretoEscuro)];
  for (const v of VIGAS) partes.push(pintar(new THREE.BoxGeometry(0.7, 0.08, 0.55).translate(v, 0.04, 0), COR.neoprene));
  const travessa = mergeGeometries(partes);
  // poste de iluminação (base em y = 0, sobre a barreira): coluna, braço para dentro (−x) e luminária
  const poste = mergeGeometries([
    pintar(new THREE.CylinderGeometry(0.07, 0.11, 9.6, 8).translate(0, 4.8, 0), COR.poste),
    pintar(new THREE.BoxGeometry(0.34, 0.12, 0.34).translate(0, 0.06, 0), COR.poste),
    pintar(new THREE.CylinderGeometry(0.045, 0.045, 1.9, 6).rotateZ(Math.PI / 2 - 0.12).translate(-0.92, 9.62, 0), COR.poste),
    pintar(new THREE.BoxGeometry(0.75, 0.16, 0.32).translate(-1.95, 9.66, 0), COR.poste),
    pintar(new THREE.BoxGeometry(0.62, 0.05, 0.26).translate(-1.95, 9.56, 0), COR.luminaria)
  ]);
  // montante do guarda-corpo
  const montante = pintar(new THREE.BoxGeometry(0.06, 0.46, 0.06).translate(0, 0.23, 0), COR.metal);
  return { coluna, travessa, poste, montante };
})();

function instancias(geo, lista) {
  if (!lista.length) return null;
  const im = new THREE.InstancedMesh(geo, matObra, lista.length);
  lista.forEach((m, i) => im.setMatrixAt(i, m));
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  im.castShadow = true; im.receiveShadow = true;
  return im;
}
const matriz = (x, y, z, rotY, sy = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)), new THREE.Vector3(1, sy, 1));

// ─── TABULEIROS PARA A CÂMERA ────────────────────────────────────────────────
// trechos do tabuleiro (amostra a amostra): a câmera não pode entrar neles quando o corredor passa por baixo
let tabuleiros = [];

// fundo do tabuleiro que cobre (x, z) — o mais baixo deles —, ou Infinity
export function fundoDoTabuleiro(x, z) {
  let f = Infinity;
  for (const t of tabuleiros) {
    if (x < t.x0 || x > t.x1 || z < t.z0 || z > t.z1) continue;
    const dx = t.bx - t.ax, dz = t.bz - t.az, l2 = dx * dx + dz * dz || 1;
    const u = ((x - t.ax) * dx + (z - t.az) * dz) / l2;
    if (u < -0.02 || u > 1.02) continue;
    const ex = t.ax + dx * u - x, ez = t.az + dz * u - z;
    if (ex * ex + ez * ez > (FORA + 0.6) ** 2) continue;
    f = Math.min(f, t.fa + (t.fb - t.fa) * Math.max(0, Math.min(1, u)));
  }
  return f;
}

// câmera atrás do corredor: se a linha entre a cabeça dele e a câmera passa por dentro de um tabuleiro que está
// acima do corredor (ele correndo na avenida debaixo do viaduto ou ao lado dele), a câmera desce até ficar abaixo
// do fundo das vigas e chega um pouco mais perto. A conta é contínua: conforme o tabuleiro "entra" na linha, a
// altura permitida vai baixando sozinha, sem pulo.
export function ajustarCameraViaduto(pos, x, yCabeca, z) {
  if (!tabuleiros.length) return;
  const dx = pos.x - x, dy = pos.y - yCabeca, dz = pos.z - z;
  if (Math.abs(dx) + Math.abs(dz) > 80) return;
  let yMax = Infinity;
  for (let k = 1; k <= 16; k++) {
    const t = k / 16;
    const f = fundoDoTabuleiro(x + dx * t, z + dz * t);
    if (f === Infinity || f < yCabeca + 0.2) continue; // tabuleiro onde o corredor está (ou abaixo dele)
    yMax = Math.min(yMax, yCabeca + (f - 0.6 - yCabeca) / t);
  }
  if (yMax === Infinity || pos.y <= yMax) return;
  const yNovo = Math.max(yCabeca - 0.3, yMax);
  // descendo, chega mais perto (no máximo 25%) para a vista não ficar rente ao chão
  const f = 1 - Math.min(0.25, (pos.y - yNovo) / Math.max(1, dy) * 0.35);
  pos.set(x + dx * f, yNovo, z + dz * f);
}

// ─── CONSTRUÇÃO ──────────────────────────────────────────────────────────────

// pista: PistaReal já elevada; amostras: as do desenho (amostrasDoPercurso); osm: prepararOSM (ou null);
// matAgua: material da água do resto do mapa (ganha uma cópia que grava profundidade)
export function construirViadutos({ pista, amostras, osm = null, matAgua = null }) {
  tabuleiros = [];
  if (!pista?.elev || !amostras?.length) return null;
  const n = amostras.length;
  const elev = amostras.map((a) => (a.s >= 0 && a.s <= pista.total ? pista.elevacao(a.s) : 0));
  const usar = amostras.map((a, i) => elev[i] > 0.05 && !a.lat?.dup);
  if (!usar.some(Boolean)) return null;
  // lado só com barreira/muro onde a calçada está inteira (outro trecho colado ao lado no pé da rampa)
  const beiras = { [-1]: planoFita(amostras, -BEIRA, -BEIRA + 0.1), [1]: planoFita(amostras, BEIRA - 0.1, BEIRA) };
  const ladoInteiro = (lado, i) => {
    const b = beiras[lado], k = lado < 0 ? 0 : 2;
    return Math.hypot(b.xz[i * 4 + k] - amostras[i].x, b.xz[i * 4 + k + 1] - amostras[i].z) > BEIRA - 0.3;
  };
  // linhas transversais: uma por amostra do viaduto (direção lateral igual à de planoFita) e mais uma exatamente
  // em cada encontro (onde a elevação passa por ATERRO), que pertence ao aterro e ao vão ao mesmo tempo
  const P = [];
  for (let i = 0; i < n; i++) {
    if (!usar[i]) { P.push(null); continue; }
    const a = amostras[i], p = amostras[Math.max(0, i - 1)], q = amostras[Math.min(n - 1, i + 1)];
    const ang = Math.atan2(q.x - p.x, -(q.z - p.z));
    const [rx, rz] = direita(ang);
    const l = { x: a.x, z: a.z, y: a.y, rx, rz, ang, s: a.s, e: elev[i], chao: a.y - elev[i], vao: elev[i] >= ATERRO, i,
      lados: { [-1]: ladoInteiro(-1, i), [1]: ladoInteiro(1, i) } };
    const ant = P[P.length - 1];
    if (ant && ant.vao !== l.vao) {
      const f = (ATERRO - ant.e) / (l.e - ant.e || 1), mix = (u, v) => u + (v - u) * f;
      P.push({ x: mix(ant.x, l.x), z: mix(ant.z, l.z), y: mix(ant.y, l.y), rx: ant.rx, rz: ant.rz, ang: ant.ang, s: mix(ant.s, l.s), e: ATERRO,
        chao: mix(ant.chao, l.chao), encontro: l.vao ? 1 : -1, i: f < 0.5 ? ant.i : i,
        lados: { [-1]: ant.lados[-1] && l.lados[-1], [1]: ant.lados[1] && l.lados[1] } });
    }
    P.push(l);
  }
  const ehVao = (l) => l && (l.vao || l.encontro);
  const ehAterro = (l) => l && (!l.vao || l.encontro);
  // sequências de linhas seguidas que satisfazem `ok`
  const corridas = (ok) => {
    const out = [];
    let atual = [];
    for (const l of P) {
      if (ok(l)) atual.push(l);
      else { if (atual.length > 1) out.push(atual); atual = []; }
    }
    if (atual.length > 1) out.push(atual);
    return out;
  };
  const linhasVao = P.filter(ehVao);

  const m = new Montador();
  const C = Object.fromEntries(Object.entries(COR).map(([k, v]) => [k, cor(v)]));
  // ─ barreira New Jersey + guarda-corpo + face externa (muro no aterro, viga de borda no vão), de cada lado
  for (const lado of [-1, 1]) {
    const L = (d) => d * lado;
    for (const tipo of ['vao', 'aterro']) {
      const ok = tipo === 'vao' ? ehVao : ehAterro;
      for (const linhas of corridas((l) => ok(l) && l.lados[lado])) {
        // barreira (perfil New Jersey de 87 cm) e face externa
        extrudar(m, linhas, (l) => (tipo === 'vao'
          ? [[L(BEIRA), 0.06, C.barreira], [L(BEIRA), 0.14, C.barreira], [L(BEIRA + 0.16), 0.36, C.barreira], [L(BEIRA + 0.23), 0.87, C.barreira],
            [L(FORA - 0.02), 0.87, C.barreira], [L(FORA), 0.82, C.concreto], [L(FORA), -0.55, C.concreto], [L(FORA - 0.3), -0.55, C.laje], [L(FORA - 0.3), -LAJE, C.laje]]
          // muro de contenção do aterro até o chão (que fica 1,5 m abaixo da rua no desenho), mais escuro no pé
          : [[L(BEIRA), 0.06, C.barreira], [L(BEIRA), 0.14, C.barreira], [L(BEIRA + 0.16), 0.36, C.barreira], [L(BEIRA + 0.23), 0.87, C.barreira],
            [L(FORA - 0.02), 0.87, C.barreira], [L(FORA), 0.82, C.concreto], [L(FORA), 0.2, C.muro], [L(FORA), -l.e - 1.6, C.muroPe]]));
        // guarda-corpo: dois tubos sobre a barreira
        for (const h of [1.02, 1.24]) {
          extrudar(m, linhas, () => [[L(FORA - 0.12), h, C.metal], [L(FORA - 0.05), h, C.metal], [L(FORA - 0.05), h + 0.06, C.metal], [L(FORA - 0.12), h + 0.06, C.metal], [L(FORA - 0.12), h, C.metal]]);
        }
      }
    }
  }
  // ─ fundo da laje e vigas pré-moldadas (só nos vãos)
  for (const linhas of corridas(ehVao)) {
    extrudar(m, linhas, () => [[-(FORA - 0.3), -LAJE, C.laje], [FORA - 0.3, -LAJE, C.laje]]);
    for (const v of VIGAS) {
      // alma escura junto da laje (sombra), mesa inferior clara: as vigas aparecem para quem passa por baixo
      extrudar(m, linhas, () => [[v - 0.1, -LAJE, C.vigaAlma], [v - 0.1, -1.2, C.viga], [v - 0.32, -1.27, C.viga], [v - 0.32, -VIGA, C.viga],
        [v + 0.32, -VIGA, C.viga], [v + 0.32, -1.27, C.viga], [v + 0.1, -1.2, C.viga], [v + 0.1, -LAJE, C.vigaAlma]]);
    }
  }
  // ─ encontros: cortina de concreto onde o aterro vira vão (fecha o aterro) e o berço onde apoiam as vigas
  const encontros = P.filter((l) => l?.encontro).map((l) => ({ ...l, sentido: l.encontro }));
  for (const l of encontros) {
    const fx = -l.rz * l.sentido, fz = l.rx * l.sentido; // para o lado do vão
    const Q = (d, y, av = 0) => [l.x + l.rx * d + fx * av, y, l.z + l.rz * d + fz * av];
    m.quad(Q(-FORA, l.chao - 1.6), Q(FORA, l.chao - 1.6), Q(FORA, l.y - LAJE), Q(-FORA, l.y - LAJE), C.muroPe, C.muroPe, C.concreto, C.concreto);
    m.caixa(Q(0, l.y - VIGA - 0.43, 0.6), [l.rx, l.rz], FORA - 0.2, 0.35, 0.6, C.concretoEscuro);
  }

  // ─ pórticos (pilares + travessa) a cada ~30 m entre os encontros, fora das ruas de baixo
  const ruas = (osm?.ruas || []).filter((r) => r.pts.length > 1);
  const pertoDeRua = (x, z, raio, ang) => {
    const [fx, fz] = [Math.sin(ang), -Math.cos(ang)];
    for (const r of ruas) {
      for (let j = 0; j < r.pts.length - 1; j++) {
        const [ax, az] = r.pts[j], [bx, bz] = r.pts[j + 1];
        if (Math.min(ax, bx) > x + raio || Math.max(ax, bx) < x - raio || Math.min(az, bz) > z + raio || Math.max(az, bz) < z - raio) continue;
        const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
        // a própria ponte (rua do mapa andando junto com o tabuleiro) não conta
        if (Math.abs(dx * fx + dz * fz) / Math.sqrt(l2) > 0.8) continue;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
        if (Math.hypot(x - ax - dx * t, z - az - dz * t) < raio) return true;
      }
    }
    return false;
  };
  const pertoDoPercurso = (x, z, sRef, raio) => {
    for (const j of pista.segmentosPerto(x, z)) {
      if (Math.abs(pista.s[j] - sRef) < 60 || (pista.elev[j] > 1 && pista.elev[j + 1] > 1)) continue;
      const dx = pista.x[j + 1] - pista.x[j], dz = pista.z[j + 1] - pista.z[j], l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - pista.x[j]) * dx + (z - pista.z[j]) * dz) / l2));
      if (Math.hypot(x - pista.x[j] - dx * t, z - pista.z[j] - dz * t) < raio) return true;
    }
    return false;
  };
  const livre = (s) => {
    const p = pista.em(s), [rx, rz] = direita(p.ang);
    for (const d of [-COLUNA_D, COLUNA_D]) {
      const x = p.x + rx * d, z = p.z + rz * d;
      // pilar: fora da rua e da calçada do percurso de baixo e fora das ruas do mapa
      if (pertoDoPercurso(x, z, s, MEIA_RUA + 3.6 + 1.2) || pertoDeRua(x, z, 6.5, p.ang)) return false;
    }
    // travessa: nunca em cima da rua de baixo (gabarito)
    for (const d of [-(FORA - 0.5), 0, FORA - 0.5]) {
      const x = p.x + rx * d, z = p.z + rz * d;
      if (pertoDoPercurso(x, z, s, MEIA_RUA + 1) || pertoDeRua(x, z, 4.5, p.ang)) return false;
    }
    return true;
  };
  const colunas = [], travessas = [], estacoes = [];
  for (let k = 0; k + 1 < encontros.length; k++) {
    const e0 = encontros[k], e1 = encontros[k + 1];
    if (e0.sentido !== 1 || e1.sentido !== -1) continue; // e0 abre o vão, e1 fecha
    const L = e1.s - e0.s, nv = Math.max(1, Math.round(L / VAO_ALVO));
    let ant = e0.s;
    for (let v = 1; v < nv; v++) {
      const alvo = e0.s + (L * v) / nv;
      let achou = null;
      for (const off of [0, 2, -2, 4, -4, 6, -6, 8, -8, 10, -10, 12, -12]) {
        const s = alvo + off;
        if (s - ant < 18 || e1.s - s < 18) continue;
        if (livre(s)) { achou = s; break; }
      }
      if (achou === null) continue;
      ant = achou;
      estacoes.push(achou);
    }
  }
  for (const s of estacoes) {
    const p = pista.em(s), [rx, rz] = direita(p.ang), e = pista.elevacao(s), chao = p.y - e;
    const topo = p.y - VIGA - 0.08; // topo da travessa: embaixo dos aparelhos de apoio
    travessas.push(matriz(p.x, topo, p.z, -p.ang));
    for (const d of [-COLUNA_D, COLUNA_D]) colunas.push(matriz(p.x + rx * d, chao - 1.6, p.z + rz * d, 0, topo - TRAVESSA_H - (chao - 1.6) + 0.05));
  }

  // ─ drenos (buzinotes) sob a borda, a cada 12 m nos vãos
  for (const l of linhasVao) {
    if (l.encontro || Math.round(l.s) % 12 >= 4) continue;
    for (const lado of [-1, 1]) m.caixa([l.x + l.rx * lado * (FORA - 0.6), l.y - LAJE - 0.25, l.z + l.rz * lado * (FORA - 0.6)], [l.rx, l.rz], 0.05, 0.25, 0.05, C.dreno);
  }

  // ─ postes de iluminação sobre a barreira (alternando os lados) e montantes do guarda-corpo
  const postes = [], montantes = [];
  const altas = P.filter((l) => l && l.e > 1.2);
  if (altas.length > 1) {
    const sIni = altas[0].s, sFim = altas.at(-1).s, np = Math.max(1, Math.round((sFim - sIni) / POSTE_CADA));
    for (let k = 0; k <= np; k++) {
      const s = sIni + ((sFim - sIni) * k) / np, lado = k % 2 ? 1 : -1;
      const l = altas.reduce((b, q) => (Math.abs(q.s - s) < Math.abs(b.s - s) ? q : b));
      if (!l.lados[lado]) continue;
      const p = pista.em(s), [rx, rz] = direita(p.ang), d = lado * (FORA - 0.12);
      // braço para dentro: o modelo aponta para −x (lado direito); do lado esquerdo gira 180°
      postes.push(matriz(p.x + rx * d, p.y + 0.87, p.z + rz * d, -p.ang + (lado > 0 ? 0 : Math.PI)));
    }
  }
  for (const l of P) {
    if (!l || l.encontro || Math.round(l.s) % 2) continue;
    for (const lado of [-1, 1]) {
      if (!l.lados[lado]) continue;
      const d = lado * (FORA - 0.085);
      montantes.push(matriz(l.x + l.rx * d, l.y + 0.85, l.z + l.rz * d, -l.ang));
    }
  }

  // ─ juntas de dilatação: nos encontros e a cada dois pórticos
  const juntas = new Montador();
  const sJuntas = [...encontros.map((e) => e.s), ...estacoes.filter((_, k) => k % 2 === 1)];
  for (const s of sJuntas) {
    const p = pista.em(s), [rx, rz] = direita(p.ang), fx = -rz * 0.15, fz = rx * 0.15;
    const faixa = (d0, d1, h) => juntas.quad(
      [p.x + rx * d0 - fx, p.y + h, p.z + rz * d0 - fz], [p.x + rx * d1 - fx, p.y + h, p.z + rz * d1 - fz],
      [p.x + rx * d1 + fx, p.y + h, p.z + rz * d1 + fz], [p.x + rx * d0 + fx, p.y + h, p.z + rz * d0 + fz], C.neoprene);
    faixa(-MEIA_RUA, MEIA_RUA, 0.004); faixa(-BEIRA, -MEIA_RUA, 0.066); faixa(MEIA_RUA, BEIRA, 0.066);
  }

  // ─ tabuleiros para a câmera (fundo das vigas no vão; no aterro é tudo cheio)
  for (let k = 0; k < P.length - 1; k++) {
    const a = P[k], b = P[k + 1];
    if (!a || !b || Math.min(a.e, b.e) < 2) continue;
    const r = FORA + 0.6, fundo = (l) => (ehVao(l) ? l.y - VIGA : l.chao);
    tabuleiros.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, fa: fundo(a), fb: fundo(b),
      x0: Math.min(a.x, b.x) - r, x1: Math.max(a.x, b.x) + r, z0: Math.min(a.z, b.z) - r, z1: Math.max(a.z, b.z) + r });
  }

  // ─ montagem
  const g = new THREE.Group();
  g.name = 'viadutos';
  const geo = m.geometria();
  if (geo) { const obra = new THREE.Mesh(geo, matObra); obra.castShadow = true; obra.receiveShadow = true; g.add(obra); }
  for (const im of [instancias(GEO.coluna, colunas), instancias(GEO.travessa, travessas), instancias(GEO.poste, postes), instancias(GEO.montante, montantes)]) if (im) g.add(im);
  const gj = juntas.geometria();
  if (gj) { const mj = new THREE.Mesh(gj, matJunta); mj.receiveShadow = true; g.add(mj); }
  const rio = construirRio(osm, linhasVao, matAgua);
  if (rio) g.add(rio);
  g.userData.info = { estacoes, encontros: encontros.map((e) => e.s) };
  return g;
}

// ─── RIO DEBAIXO DA PONTE ────────────────────────────────────────────────────
// polígonos de água do mapa que passam sob o tabuleiro: espelho d'água 35 cm abaixo do chão e margem em talude.
// Desenhados antes da grama da beira (renderOrder) e gravando profundidade, para os pilares "entrarem" na água.
function construirRio(osm, linhas, matAgua) {
  if (!osm?.areas || !linhas.length) return null;
  const aguas = osm.areas.filter((a) => a.tipo === 'agua' && linhas.some((l) => {
    const [x0, z0, x1, z1] = a.caixa;
    return l.x >= x0 && l.x <= x1 && l.z >= z0 && l.z <= z1 && pontoNoPoligono(l.x, l.z, a.pts);
  }));
  if (!aguas.length) return null;
  const nivel = Math.min(...linhas.map((l) => l.chao)) - 0.35;
  const pos = [];
  const margem = new Montador();
  const cTopo = cor(COR.talude), cPe = cor(COR.taludePe);
  for (const a of aguas) {
    const pts = a.pts.slice();
    if (pts.length > 3 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop();
    const faces = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []);
    for (const f of faces) for (const i of [f[0], f[2], f[1]]) pos.push(pts[i][0], nivel, pts[i][1]);
    // talude: da borda do polígono (no chão) até 3 m para dentro (no nível da água)
    const horario = THREE.ShapeUtils.isClockWise(pts.map(([x, z]) => new THREE.Vector2(x, z)));
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
      const l = Math.hypot(bx - ax, bz - az);
      if (l < 0.2) continue;
      // normal para dentro do polígono
      let nx = -(bz - az) / l, nz = (bx - ax) / l;
      if (horario) { nx = -nx; nz = -nz; }
      const w = 3;
      margem.quad([ax, nivel + 0.33, az], [bx, nivel + 0.33, bz], [bx + nx * w, nivel - 0.05, bz + nz * w], [ax + nx * w, nivel - 0.05, az + nz * w], cTopo, cTopo, cPe, cPe);
    }
  }
  const g = new THREE.Group();
  if (pos.length && matAgua) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(pos.filter((_, k) => k % 3 !== 1).map((v) => v / 9), 2));
    geo.computeVertexNormals();
    const mat = matAgua.clone();
    mat.depthWrite = true;
    const agua = new THREE.Mesh(geo, mat);
    agua.renderOrder = -1.9;
    agua.receiveShadow = true;
    g.add(agua);
  }
  const gm = margem.geometria();
  if (gm) { const mm = new THREE.Mesh(gm, matObra); mm.renderOrder = -1.9; mm.receiveShadow = true; g.add(mm); }
  return g;
}
