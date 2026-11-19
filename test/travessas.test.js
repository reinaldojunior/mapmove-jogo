import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PistaReal } from '../src/pista.js';
import { encontrarTravessas, travessasGenericas } from '../src/travessas.js';

// percurso reto para o norte, ~1 km
const pista = new PistaReal(Array.from({ length: 11 }, (_, i) => [-23.1 + i * 0.0009, -47.2, 500]));
const lat = (m) => -23.1 + m / 110540;
const lng = (m) => -47.2 + m / (111320 * Math.cos((23.1 * Math.PI) / 180));

test('rua que atravessa o percurso: cruzamento dos dois lados', () => {
  const t = encontrarTravessas(pista, [{ tipo: 'residential', pontos: [[lat(300), lng(-200)], [lat(300), lng(200)]] }]);
  assert.equal(t.length, 1);
  assert.ok(Math.abs(t[0].s - 300) < 3, `s ${t[0].s}`);
  assert.deepEqual([...t[0].lados].sort(), [-1, 1]);
  assert.equal(t[0].principal, false);
});

test('rua que termina no percurso pela direita (leste): só um lado', () => {
  const t = encontrarTravessas(pista, [{ tipo: 'primary', pontos: [[lat(600), lng(3)], [lat(600), lng(150)]] }]);
  assert.equal(t.length, 1);
  assert.deepEqual(t[0].lados, [1]);
  assert.equal(t[0].principal, true);
});

test('a própria rua da prova (paralela) não vira travessa', () => {
  const t = encontrarTravessas(pista, [{ tipo: 'secondary', pontos: [[lat(100), lng(0)], [lat(900), lng(0)]] }]);
  assert.equal(t.length, 0);
});

test('travessas genéricas ficam dentro do percurso', () => {
  let x = 0.3;
  const t = travessasGenericas(2000, 120, () => (x = (x * 7.13) % 1));
  assert.ok(t.length >= 4);
  assert.ok(t.every((v) => v.s >= 120 && v.s < 1940 && v.lados.length >= 1));
});
