import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../src/treinos.js';
import { perfilNovo, XP_INICIO } from '../src/perfil.js';

const DIA = 86400000;
const meioDia = (s) => Date.parse(`${s}T12:00:00`);

test('catálogo: 8 treinos por nível, com leve, forte, longo e regenerativo; iniciante sem pista', () => {
  assert.equal(T.CATALOGO.length, 40);
  for (let n = 0; n < 5; n++) {
    const doNivel = T.CATALOGO.filter((t) => t.nivel === n);
    assert.equal(doNivel.length, 8, `nível ${n}`);
    for (const tipo of ['forte', 'longo', 'regen']) assert.ok(doNivel.some((t) => t.tipo === tipo), `nível ${n} sem ${tipo}`);
  }
  assert.ok(T.CATALOGO.filter((t) => t.nivel === 0).every((t) => t.local !== 'pista' && t.fator >= 1.05));
  assert.equal(new Set(T.CATALOGO.map((t) => t.id)).size, 40);
});

test('prescrição: nunca dois fortes seguidos e sempre do nível', () => {
  for (let d = 0; d < 21; d++) {
    const dia = T.diaLocal(meioDia('2026-12-01') + d * DIA);
    for (let nivel = 0; nivel < 5; nivel++) {
      const t = T.prescrever(nivel, dia);
      assert.equal(t.nivel, nivel);
      const ant = T.prescrever(nivel, T.diaLocal(meioDia(dia) - DIA));
      assert.ok(!(ant.tipo === 'forte' && t.tipo === 'forte'), `${dia} nível ${nivel}`);
    }
  }
});

test('treino grátis uma vez por dia; comprado sem limite com Move$', () => {
  const agora = meioDia('2026-12-10');
  const r1 = T.executarTreino(perfilNovo(), { agora, aleatorio: () => 0.5 });
  assert.equal(r1.xp, 60);
  assert.equal(r1.perfil.treinoGratisEm, '2026-12-10');
  assert.ok(T.executarTreino(r1.perfil, { agora: agora + 3600000 }).erro);
  assert.ok(T.executarTreino(r1.perfil, { agora, comprado: true }).erro); // sem Move$
  const rico = { ...r1.perfil, moves: 200 };
  const r2 = T.executarTreino(rico, { agora, comprado: true });
  assert.equal(r2.perfil.moves, 110);
  assert.notEqual(r2.treino.id, r1.treino.id); // o comprado segue o ciclo
  // à meia-noite libera de novo
  assert.ok(!T.executarTreino(r1.perfil, { agora: meioDia('2026-12-11') - 11 * 3600000 }).erro);
});

test('sequência de dias dá bônus de Move$ em 3 e 7 dias; falhar um dia zera', () => {
  let p = perfilNovo(), bonus = [];
  for (let d = 0; d < 7; d++) {
    const r = T.executarTreino(p, { agora: meioDia('2026-12-01') + d * DIA });
    p = r.perfil; bonus.push(r.bonus);
  }
  assert.deepEqual(bonus, [0, 0, 10, 0, 0, 0, 30]);
  assert.equal(p.sequencia, 7);
  const r = T.executarTreino(p, { agora: meioDia('2026-12-10') });
  assert.equal(r.sequencia, 1);
});

test('XP do treino cresce menos que o custo do degrau: o topo pede mais treinos', () => {
  assert.equal(T.xpTreino(0), 60);
  assert.ok(T.xpTreino(30) < 700);
  const alto = { ...perfilNovo(), xp: XP_INICIO[30] };
  const r = T.executarTreino(alto, { agora: meioDia('2026-12-10'), aleatorio: () => 0.5 });
  assert.equal(r.treino.nivel, 4);
  assert.ok(r.paceExecutado < 260);
});
