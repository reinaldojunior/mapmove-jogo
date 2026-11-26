import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mesclarPerfis, ganhoStrava } from '../src/conta.js';

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

test('Strava: 10 XP e 1 Move$ por km válido', () => {
  const g = ganhoStrava([{ km: 12, km_valido: 12 }, { km: 15, km_valido: 9 }]);
  assert.equal(g.km, 21);
  assert.equal(g.xp, 210);
  assert.equal(g.moves, 21);
});

test('prévia: sem a marca do build, a conta funciona como sempre (PREVIA false)', async () => {
  const C = await import('../src/conta.js');
  assert.equal(C.PREVIA, false);
});

test('prévia da Vercel: nenhuma gravação na conta, no ranking, no fantasma nem no Strava', async () => {
  globalThis.__MAPMOVE_PREVIA__ = true;
  try {
    const C = await import('../src/conta.js?previa');
    assert.equal(C.PREVIA, true);
    assert.equal(await C.usuarioAtual(), null);
    const u = { id: 'x', user_metadata: {} };
    for (const f of [() => C.entrarComGoogle(), () => C.salvarPerfilNuvem(u, { xp: 1 }), () => C.salvarFantasma(u, { amostras: [] }),
      () => C.registrarCorridaNuvem(u, { modo: '21K', pontos: 1, km: 1, tempo: 1, concluiu: true }),
      () => C.stravaSincronizar(), () => C.stravaConectar('c', 's'), () => C.adicionarAmigo('abc'), () => C.meuCodigo()]) {
      await assert.rejects(f, /Prévia de teste/);
    }
  } finally { delete globalThis.__MAPMOVE_PREVIA__; }
});
