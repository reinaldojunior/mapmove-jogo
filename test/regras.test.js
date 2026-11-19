import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colide, coleta, desidratar, hidratar, formatarPace, formatarKm, velocidade, M_POR_UNIDADE } from '../src/regras.js';

const cone = { x: 0, z: 0, w: 0.8, d: 0.8, h: 0.8 };

test('bate no cone na mesma faixa e no chão', () => {
  assert.equal(colide({ x: 0, y: 0, z: 0.5 }, cone), true);
});

test('pulando por cima do cone não bate', () => {
  assert.equal(colide({ x: 0, y: 1.2, z: 0 }, cone), false);
});

test('em outra faixa não bate', () => {
  assert.equal(colide({ x: 2.2, y: 0, z: 0 }, cone), false);
});

test('pega o copo na mesma faixa', () => {
  assert.equal(coleta({ x: 0, y: 0, z: 0.3 }, { x: 0, y: 1, z: 0 }), true);
  assert.equal(coleta({ x: 2.2, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), false);
});

test('hidratação fica entre 0 e 100', () => {
  assert.equal(desidratar(0.2, 1), 0);
  assert.equal(hidratar(95), 100);
});

test('pace e distância em formato brasileiro', () => {
  assert.equal(formatarPace(1000 / 312), '5:12');
  assert.equal(formatarKm(3240), '3,24 km');
});

test('velocidade inicial dá um pace de corrida de rua', () => {
  const pace = 1000 / (velocidade(0) * M_POR_UNIDADE);
  assert.ok(pace > 300 && pace < 420, `pace inicial ${pace}s/km`);
});
