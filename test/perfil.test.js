import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/perfil.js';

test('degraus: 34 no total, de 7:00 até 3:00, ganho por degrau diminui', () => {
  assert.equal(P.DEGRAUS.length, 34);
  assert.equal(P.DEGRAUS[0].pace, 420);
  assert.equal(P.DEGRAUS[0].nome, 'Iniciante');
  assert.equal(P.DEGRAUS.at(-1).nome, 'Elite');
  // o pace nunca piora e os degraus ficam menores
  for (let i = 1; i < P.DEGRAUS.length; i++) assert.ok(P.DEGRAUS[i].pace < P.DEGRAUS[i - 1].pace);
  assert.equal(P.DEGRAUS[1].pace - P.DEGRAUS[0].pace, -12);
  assert.ok(P.DEGRAUS.at(-1).pace - P.DEGRAUS.at(-2).pace >= -5);
  assert.equal(P.situacao(P.XP_TOTAL + 10).pace, 180);
});

test('XP: degraus cada vez mais caros e situação correta', () => {
  assert.equal(P.custoDegrau(0), 100);
  assert.ok(P.custoDegrau(20) > P.custoDegrau(10) * 3);
  assert.equal(P.situacao(0).rotulo, 'Iniciante 1');
  assert.equal(P.situacao(99).rotulo, 'Iniciante 1');
  assert.equal(P.situacao(100).rotulo, 'Iniciante 2');
  const s = P.situacao(150);
  assert.equal(s.pace, 408);
  assert.ok(Math.abs(s.progresso - 50 / 114) < 1e-9);
  assert.equal(P.situacao(P.XP_INICIO[5]).nome, 'Intermediário');
});

test('ganho: 10K completo com missões dá km + bônus + desempenho + missões', () => {
  const g = P.ganhoDaCorrida({ metros: 10000, prova: '10K', concluiu: true, penalidades: 0, tropecos: 0, copos: 3, coposPegos: 3, agua: 60 });
  // 100 (km) + 80 (prova) = 180; desempenho 30% = 54; 3 missões = 90
  assert.equal(g.xp, 180 + 54 + 90);
  assert.equal(g.moves, 10 + 20);
  assert.equal(g.missoes.filter((m) => m.ok).length, 3);
});

test('ganho: desistência só conta os km', () => {
  const g = P.ganhoDaCorrida({ metros: 4200, prova: '10K', concluiu: false, penalidades: 3, tropecos: 5, copos: 2, coposPegos: 0, agua: 20 });
  assert.equal(g.xp, 42);
  assert.equal(g.moves, 4);
});

test('perda de forma: nada até 3 dias, depois cai até no máximo 2 degraus', () => {
  const dia = 86400000, agora = 100 * dia;
  const xp = P.XP_INICIO[10] + 50;
  assert.equal(P.xpComDestreino(xp, agora - 3 * dia, agora).xp, xp);
  const umDia = P.xpComDestreino(xp, agora - 4 * dia, agora);
  assert.equal(umDia.perdido, Math.round(0.2 * P.custoDegrau(10)));
  const muito = P.xpComDestreino(xp, agora - 60 * dia, agora);
  assert.equal(muito.xp, P.XP_INICIO[8]);
});

test('registrar corrida soma XP, Move$, e avisa quando sobe de nível', () => {
  const perfil = { ...P.perfilNovo(), xp: P.XP_INICIO[5] - 10 };
  const r = P.registrarCorrida(perfil, { metros: 6000, prova: '6K', concluiu: true, penalidades: 0, tropecos: 0, copos: 2, coposPegos: 2, agua: 70 }, 1000);
  assert.ok(r.subiuDegrau && r.subiuNivel);
  assert.equal(r.depois.nome, 'Intermediário');
  assert.equal(r.perfil.corridas, 1);
  assert.equal(r.perfil.ultimaCorrida, 1000);
  assert.ok(r.perfil.moves > 0);
  assert.deepEqual(P.lerPerfil('lixo'), P.perfilNovo());
});
