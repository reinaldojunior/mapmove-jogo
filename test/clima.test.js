import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/clima.js';

const clima = (id, extra = {}) => ({ ...C.CLIMAS.find((c) => c.id === id), ventoDe: 0, ...extra });

test('sorteio devolve um clima da lista com direção do vento', () => {
  let i = 0; const seq = [0.99, 0.5, 0.25];
  const c = C.sortearClima(() => seq[i++ % seq.length]);
  assert.ok(C.CLIMAS.some((x) => x.id === c.id));
  assert.ok(c.ventoDe >= 0 && c.ventoDe < Math.PI * 2);
});

test('calor úmido dá mais sede, frio dá menos', () => {
  assert.ok(C.fatorSede(clima('abafado')) > C.fatorSede(clima('sol')));
  assert.ok(C.fatorSede(clima('frio')) < 1);
  assert.ok(C.fatorSede(clima('calor')) <= 1.9);
});

test('energia só pesa acima de 25 °C', () => {
  assert.equal(C.fatorEnergiaClima(clima('sol')), 1);
  assert.ok(C.fatorEnergiaClima(clima('calor')) > 1.3);
});

test('vento de frente atrasa, a favor ajuda menos', () => {
  const v = clima('vento');
  const frente = C.fatorVento(v, 0), costas = C.fatorVento(v, Math.PI);
  assert.ok(frente < 0.93 && frente > 0.9);
  assert.ok(costas > 1 && costas - 1 < 1 - frente);
  assert.ok(Math.abs(C.fatorVento(v, Math.PI / 2) - 1) < 1e-9); // de lado não muda
});

test('chuva escorrega e dá bônus; bônus limitado a 25%', () => {
  assert.ok(C.aderencia(clima('chuva')) < 1);
  assert.equal(C.aderencia(clima('sol')), 1);
  assert.equal(C.bonusClima(clima('sol')), 0);
  assert.equal(C.bonusClima(clima('chuva')), 0.15);
  assert.equal(C.bonusClima({ temp: 33, umidade: 90, chuva: 1, vento: 8 }), 0.25);
});

test('explicação do clima: efeitos e cuidados de acordo com o tempo', () => {
  const calor = C.explicarClima(clima('abafado'), { isotonico: 2 });
  assert.ok(calor.efeitos.some((t) => t.includes('água acaba')));
  assert.ok(calor.cuidados.some((t) => t.includes('todos os postos')));
  assert.ok(calor.cuidados.some((t) => t.includes('2 na mochila')));
  const chuva = C.explicarClima(clima('chuva'));
  assert.ok(chuva.efeitos.some((t) => t.includes('escorrega')));
  assert.ok(chuva.cuidados.some((t) => t.includes('curvas mais cedo')));
  const frio = C.explicarClima(clima('frio'));
  assert.ok(frio.efeitos.some((t) => t.includes('dura mais')));
  const sol = C.explicarClima(clima('sol'));
  assert.ok(sol.efeitos.some((t) => t.includes('recorde')));
});
