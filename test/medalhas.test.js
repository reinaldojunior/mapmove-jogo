import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/medalhas.js';

test('pódio dá medalha e Move$ (distância longa vale mais); fora do pódio não', () => {
  let r = M.registrarMedalha({ moves: 0 }, '10K', 1);
  assert.equal(r.tipo, 'ouro');
  assert.equal(r.perfil.moves, 120);
  r = M.registrarMedalha(r.perfil, '21K', 3);
  assert.equal(r.perfil.moves, 120 + 75);
  assert.deepEqual(M.estoque(r.perfil), { ouro: 1, prata: 0, bronze: 1 });
  assert.equal(M.registrarMedalha(r.perfil, '6K', 4).tipo, null);
});

test('marcos a cada 5: Move$ crescente, kit, item exclusivo no 10º e bônus por distância', () => {
  let p = { moves: 0 };
  const linhas = [];
  for (let i = 0; i < 10; i++) { const r = M.registrarMedalha(p, i < 5 ? '6K' : '10K', 3); p = r.perfil; linhas.push(...r.linhas); }
  assert.equal(p.medalhasGanhas, 10);
  assert.equal(p.consumiveis.gel, 3); // kit no 5º
  assert.ok(p.inventario['viseira-dourada']); // item exclusivo no 10º
  assert.ok(linhas.some((t) => t.includes('5 pódios no 6K')));
  assert.ok(linhas.some((t) => t.includes('5 pódios no 10K')));
  assert.equal(p.consumiveis.isotonico, 1 + 2); // kit + bônus do 10K
});

test('troca 5 medalhas iguais por Move$', () => {
  let p = { moves: 0 };
  for (let i = 0; i < 6; i++) p = M.registrarMedalha(p, i % 2 ? '6K' : '10K', 2).perfil;
  const antes = p.moves;
  const r = M.trocarMedalhas(p, 'prata');
  assert.equal(r.perfil.moves, antes + M.TROCA.prata);
  assert.equal(M.estoque(r.perfil).prata, 1);
  assert.equal(M.trocarMedalhas(r.perfil, 'prata').erro, 'faltam');
});
