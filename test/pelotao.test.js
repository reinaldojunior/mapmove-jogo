import test from 'node:test';
import assert from 'node:assert/strict';
import * as PL from '../src/pelotao.js';

const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('pelotão: ritmos entre 7% mais rápido e 45% mais lento', () => {
  const l = PL.criarPelotao(50, 360, seq([0, 0.5, 0.99, 0.3]));
  assert.equal(l.length, 50);
  for (const c of l) { assert.ok(c.pace >= 360 * 0.93 - 1e-9 && c.pace <= 360 * 1.45 + 1e-9); assert.ok(Math.abs(c.d) <= 3.3); }
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

test('resultado final: pódio geral 1º a 3º; pódio por idade a partir do 4º', () => {
  // 3º geral: pódio geral (sem pódio por idade)
  const l = [{ s: 100, faixa: 1 }, { s: 90, faixa: 2 }, { s: 80, faixa: 1 }, { s: 10, faixa: 1 }];
  const r = PL.resultadoFinal(l, 85, 1);
  assert.deepEqual(r, { geral: 3, total: 5, faixa: null, totalFaixa: 4 });
  assert.deepEqual(PL.premioColocacao(r, '10K').map((i) => i.xp), [105]);
  assert.ok(PL.mensagemFinal(r).some((t) => t.includes('Pódio geral')));
  // 5º geral, faixa 1: os da faixa 1 que estão no pódio geral (1º e 3º) não contam; só o 4º (faixa 1) está na frente
  const l2 = [{ s: 100, faixa: 1 }, { s: 95, faixa: 2 }, { s: 90, faixa: 1 }, { s: 80, faixa: 1 }, { s: 10, faixa: 1 }];
  const r2 = PL.resultadoFinal(l2, 70, 1);
  assert.deepEqual(r2, { geral: 5, total: 6, faixa: 2, totalFaixa: 5 });
  const p2 = PL.premioColocacao(r2, '10K');
  assert.deepEqual(p2.map((i) => i.xp), [53]);
  assert.ok(PL.mensagemFinal(r2).some((t) => t.includes('pódio por idade')));
  const longe = PL.mensagemFinal({ geral: 80, total: 121, faixa: 5, totalFaixa: 15 });
  assert.ok(longe.some((t) => t.includes('quase pegou pódio')));
  assert.equal(PL.premioColocacao({ geral: 30, faixa: 6 }, '21K').length, 0);
  assert.deepEqual(PL.premioColocacao({ geral: 4, faixa: 1 }, "21K").map((i) => i.rotulo), ["Pódio por idade (1º na faixa)"]); // 4º geral: entra no pódio da faixa
});
