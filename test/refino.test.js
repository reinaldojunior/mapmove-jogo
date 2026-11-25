import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encaixar, refinarDistancias } from '../src/refino.js';

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
