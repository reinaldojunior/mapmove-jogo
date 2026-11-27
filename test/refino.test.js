import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encaixar, refinarDistancias, completarVolta } from '../src/refino.js';

// circuito detalhado (quadrado de ~400 m de lado, ponto a cada ~10 m) e um "42K" de 2 voltas com pontos a cada ~100 m
const LAT = -23.47, LON = -47.44, DLAT = 1 / 110540, DLON = 1 / (111320 * Math.cos((LAT * Math.PI) / 180));
const pt = (x, y) => [LAT + y * DLAT, LON + x * DLON, 550];
function quadrado(passo) {
  const p = [];
  for (let x = 0; x < 400; x += passo) p.push(pt(x, 0));
  for (let y = 0; y < 400; y += passo) p.push(pt(400, y));
  for (let x = 400; x > 0; x -= passo) p.push(pt(x, 400));
  for (let y = 400; y >= 0; y -= passo) p.push(pt(0, y));
  return p;
}
const dist = (a, b) => Math.hypot((a[0] - b[0]) / DLAT, (a[1] - b[1]) / DLON);

test('distância espaçada que segue outra mais detalhada é encaixada nela (e as voltas coincidem)', () => {
  const fina = quadrado(10);
  // duas voltas grosseiras, cortando as quinas (pontos a cada 130 m, fora das quinas)
  const grossa = [];
  for (let v = 0; v < 2; v++) for (let d = 30; d < 1600; d += 130) {
    const lado = Math.floor(d / 400), t = d % 400;
    grossa.push([pt(t, 0), pt(400, t), pt(400 - t, 400), pt(0, 400 - t)][lado]);
  }
  const [a, b] = refinarDistancias([{ rotulo: 'FINA', percurso: fina }, { rotulo: 'GROSSA', percurso: grossa }]);
  assert.equal(a.percurso, fina); // a detalhada não muda
  assert.equal(b.refinadoCom, 'FINA');
  assert.ok(b.percurso.length > grossa.length * 2);
  // as quinas voltam: existe ponto encaixado bem na quina (400, 400)
  const quina = pt(400, 400);
  assert.ok(Math.min(...b.percurso.map((q) => dist(q, quina))) < 1);
});

test('sem fonte que cubra o percurso, a distância fica como veio', () => {
  const a = quadrado(10), longe = quadrado(100).map(([la, lo, h]) => [la + 0.05, lo, h]);
  const r = refinarDistancias([{ rotulo: 'A', percurso: a }, { rotulo: 'B', percurso: longe }]);
  assert.equal(r[1].percurso, longe);
  assert.equal(r[1].refinadoCom, undefined);
});

test('encaixar respeita o sentido: ida e volta em pistas lado a lado não se trocam', () => {
  // fonte: vai para leste pela pista de baixo (y=0) e volta para oeste pela de cima (y=8)
  const fonte = [];
  for (let x = 0; x <= 600; x += 10) fonte.push(pt(x, 0));
  for (let x = 600; x >= 0; x -= 10) fonte.push(pt(x, 8));
  const alvo = [pt(590, 7), pt(450, 8), pt(300, 7), pt(150, 8), pt(10, 7)]; // só a volta, espaçado
  const r = encaixar(alvo, fonte);
  for (const q of r) assert.ok(Math.abs((q[0] - LAT) / DLAT - 8) < 0.5, 'saiu da pista de volta');
});

// volta que não fecha: duas voltas de um quadrado de ~1 km com o arquivo cortado 300 m antes da chegada
test('completarVolta: repete o trecho da volta anterior até a largada quando o GPS corta antes da chegada', () => {
  const lat0 = -23.03, lon0 = -47.19, k = Math.cos((lat0 * Math.PI) / 180);
  const ponto = (x, y) => [lat0 + y / 110540, lon0 + x / (111320 * k), 570];
  const volta = [];
  for (let m = 0; m < 1000; m += 10) { const l = Math.floor(m / 250), t = m % 250; volta.push(ponto(...[[t, 0], [250, t], [250 - t, 250], [0, 250 - t]][l])); }
  const duas = [...volta, ...volta, ponto(0, 0)];
  const cortado = duas.slice(0, duas.length - 31); // termina 300 m antes da largada
  const comp = (p) => { let t = 0; for (let i = 1; i < p.length; i++) t += Math.hypot((p[i][1] - p[i - 1][1]) * 111320 * k, (p[i][0] - p[i - 1][0]) * 110540); return t; };
  const r = completarVolta(cortado, 2);
  assert.ok(Math.abs(comp(r) - 2000) < 15, `comprimento ${comp(r)}`);
  assert.deepEqual(r[r.length - 1], cortado[0]);
  // já fechado ou sem passagem anterior: fica como veio
  assert.equal(completarVolta(duas, 2), duas);
  const parcial = volta.slice(0, 70);
  assert.equal(completarVolta(parcial, 1), parcial);
});
