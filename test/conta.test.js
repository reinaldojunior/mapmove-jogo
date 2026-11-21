import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mesclarPerfis } from '../src/conta.js';

test('mesclar: fica quem evoluiu mais e somam itens e conquistas', () => {
  const local = { xp: 500, moves: 40, treinos: 2, inventario: { bone: { premio: true } }, conquistas: { 'medalha-6k': 1 }, consumiveis: { gel: 2 }, usando: { cabeca: 'bone' } };
  const nuvem = { xp: 900, moves: 10, treinos: 5, inventario: { pochete: { comprado: 150 } }, conquistas: { 'medalha-10k': 2 }, consumiveis: { gel: 1, isotonico: 1 }, usando: { cintura: 'pochete' } };
  const m = mesclarPerfis(local, nuvem);
  assert.equal(m.xp, 900);
  assert.equal(m.moves, 40);
  assert.deepEqual(Object.keys(m.inventario).sort(), ['bone', 'pochete']);
  assert.deepEqual(Object.keys(m.conquistas).sort(), ['medalha-10k', 'medalha-6k']);
  assert.deepEqual(m.consumiveis, { gel: 2, isotonico: 1 });
  assert.equal(m.usando.cabeca, 'bone');
  assert.equal(mesclarPerfis(local, null), local);
});
