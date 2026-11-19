import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  colide, coleta, desidratar, hidratar, formatarPace, formatarKm, formatarTempo,
  velocidadeAlvo, aproximarVelocidade, resultadoAgua, mps, PACE_BASE, PACE_GEL, ALTURA_EM_PE, ALTURA_AGACHADO
} from '../src/regras.js';

const cone = { s: 50, d: 0, larg: 0.8, prof: 0.8, h: 0.95 };
const galho = { s: 50, d: -2, larg: 4.2, prof: 0.6, h: 3.5, base: 1.45 };
const emPe = (s, d, y = 0) => ({ s, d, y, altura: ALTURA_EM_PE });

test('bate no cone no chão e passa pulando ou ao lado', () => {
  assert.equal(colide(emPe(50.4, 0.2), cone), true);
  assert.equal(colide(emPe(50, 0, 1.2), cone), false);
  assert.equal(colide(emPe(50, 1.6), cone), false);
});

test('galho baixo: bate em pé, passa agachado', () => {
  assert.equal(colide(emPe(50, -1), galho), true);
  assert.equal(colide({ s: 50, d: -1, y: 0, altura: ALTURA_AGACHADO }, galho), false);
});

test('pega moeda na mesma posição', () => {
  assert.equal(coleta(emPe(10, 0.5), { s: 10.3, d: 0 }), true);
  assert.equal(coleta(emPe(10, 2.5), { s: 10, d: 0 }), false);
});

test('ritmo: 7:30 correndo sozinho, 6:30 com gel, mais lento na subida e na calçada', () => {
  assert.equal(formatarPace(velocidadeAlvo()), '7:30');
  assert.equal(formatarPace(velocidadeAlvo({ gel: true })), '6:30');
  assert.ok(velocidadeAlvo({ inclinacao: 0.05 }) < mps(PACE_BASE));
  assert.ok(velocidadeAlvo({ inclinacao: -0.05 }) > mps(PACE_BASE));
  assert.ok(velocidadeAlvo({ naCalcada: true }) < mps(PACE_BASE));
});

test('quando o gel acaba ele volta aos poucos para 7:30', () => {
  let v = mps(PACE_GEL);
  v = aproximarVelocidade(v, mps(PACE_BASE), 0.5);
  assert.ok(v < mps(PACE_GEL) && v > mps(PACE_BASE));
  for (let i = 0; i < 100; i++) v = aproximarVelocidade(v, mps(PACE_BASE), 0.1);
  assert.equal(v, mps(PACE_BASE));
});

test('hidratação fica entre 0 e 100', () => {
  assert.equal(desidratar(0.2, 1), 0);
  assert.equal(hidratar(95), 100);
});

test('formatos brasileiros', () => {
  assert.equal(formatarKm(3240), '3,24');
  assert.equal(formatarTempo(1567), '26:07');
  assert.equal(formatarTempo(9725), '2:42:05');
});

test('pegar água: só no verde e encostado do lado da mesa', () => {
  const mesa = { s: 100, lado: 1 };
  assert.equal(resultadoAgua(99, 2, mesa), 'pegou');
  assert.equal(resultadoAgua(90, 2, mesa), 'cedo');
  assert.equal(resultadoAgua(104, 2, mesa), 'tarde');
  assert.equal(resultadoAgua(100, -2, mesa), 'longe');
});
