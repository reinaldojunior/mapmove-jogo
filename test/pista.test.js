import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PistaReal, PistaReta, difAngulo } from '../src/pista.js';

// ~1 km para o norte e depois ~1 km para o leste, subindo 20 m
const norteLeste = [[-23.1, -47.2, 500], [-23.091, -47.2, 510], [-23.091, -47.19, 520]];

test('percurso real tem o comprimento esperado e esquina arredondada', () => {
  const p = new PistaReal(norteLeste);
  assert.ok(p.total > 1800 && p.total < 2050, `total ${p.total}`);
  assert.ok(Math.abs(difAngulo(p.em(100).ang, 0)) < 0.05, 'começa para o norte (-z)');
  assert.ok(Math.abs(difAngulo(p.em(p.total - 100).ang, Math.PI / 2)) < 0.05, 'termina para o leste (+x)');
});

test('inclinação positiva na subida e negativa na descida', () => {
  const rampa = Array.from({ length: 21 }, (_, i) => [-23.1 + i * 0.00045, -47.2, 500 + (i <= 10 ? i * 2 : 40 - i * 2)]);
  const p = new PistaReal(rampa);
  assert.ok(p.em(300).inclinacao > 0.02, `subida ${p.em(300).inclinacao}`);
  assert.ok(p.em(p.total - 300).inclinacao < -0.02, `descida ${p.em(p.total - 300).inclinacao}`);
});

test('projeção devolve a posição na pista e o lado', () => {
  const p = new PistaReal(norteLeste);
  const q = p.em(400);
  const r = p.projetar(q.x + 3, q.z, 390);
  assert.ok(Math.abs(r.s - 400) < 1, `s ${r.s}`);
  assert.ok(Math.abs(r.d - 3) < 0.1, `d ${r.d}`);
});

test('reta do treino', () => {
  const p = new PistaReta();
  assert.deepEqual(p.projetar(2, -100), { s: 100, d: 2 });
  assert.equal(p.total, Infinity);
});
