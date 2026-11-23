import test from 'node:test';
import assert from 'node:assert/strict';
import * as PL from '../src/pelotao.js';

const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('pelotão: ritmos entre 15% mais rápido e 40% mais lento', () => {
  const l = PL.criarPelotao(50, 360, seq([0, 0.5, 0.99, 0.3]));
  assert.equal(l.length, 50);
  for (const c of l) { assert.ok(c.pace >= 360 * 0.85 - 1e-9 && c.pace <= 360 * 1.4 + 1e-9); assert.ok(Math.abs(c.d) <= 3.3); }
});

test('mais rápidos andam mais e todos ficam dentro da rua', () => {
  const l = PL.criarPelotao(2, 360, seq([0, 0.99, 0.5]));
  l[0].s = l[1].s = 0;
  for (let i = 0; i < 100; i++) PL.avancarPelotao(l, 0.1, i * 0.1, { s: -100, d: 0 }, () => 0.5);
  const rapido = l.reduce((a, b) => (a.pace < b.pace ? a : b)), lento = l.find((c) => c !== rapido);
  assert.ok(rapido.s > lento.s);
  for (const c of l) assert.ok(Math.abs(c.d) <= 3.4);
});

test('colocação e ultrapassagens', () => {
  const l = [{ s: 100 }, { s: 50 }, { s: 10 }].map((c) => ({ ...c, passado: false }));
  let r = PL.colocacao(l, 60);
  assert.equal(r.posicao, 2); assert.equal(r.total, 4); assert.equal(r.ultrapassagens, 2);
  r = PL.colocacao(l, 60);
  assert.equal(r.ultrapassagens, 0); // não conta de novo
  r = PL.colocacao(l, 120);
  assert.equal(r.posicao, 1); assert.equal(r.ultrapassagens, 1);
  assert.equal(PL.lider(l, 120), 120);
});
