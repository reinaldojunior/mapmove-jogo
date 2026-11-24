import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../src/fantasma.js';

const f = { passo: 10, tempo: 40, amostras: [0, 30, 60, 90, 100] };

test('posição do fantasma no tempo (interpolada) e parado no fim', () => {
  assert.equal(F.posicaoFantasma(f, 0), 0);
  assert.equal(F.posicaoFantasma(f, 15), 45);
  assert.equal(F.posicaoFantasma(f, 999), 100);
});

test('tempo do fantasma num ponto e diferença para o jogador', () => {
  assert.equal(F.tempoNoPonto(f, 45), 15);
  assert.equal(F.diferenca(f, 45, 20), 5); // jogador 5 s atrás
  assert.equal(F.diferenca(f, 45, 12), -3); // 3 s na frente
  assert.match(F.textoDiferenca('Rei', 5), /5 s à sua frente/);
  assert.match(F.textoDiferenca('Rei', -75), /1:15 atrás/);
});
