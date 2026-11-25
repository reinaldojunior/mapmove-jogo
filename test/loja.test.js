import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/loja.js';
import { perfilNovo, XP_INICIO } from '../src/perfil.js';

const iniciante = (moves = 0) => ({ ...perfilNovo(), moves });
const avancado = (moves = 0) => ({ ...perfilNovo(), xp: XP_INICIO[10], moves });

test('tênis de carbono só a partir do Avançado e dá +3%', () => {
  assert.equal(L.estadoItem(iniciante(1000), 'tenis-carbono'), 'nivel');
  assert.equal(L.estadoItem(avancado(100), 'tenis-carbono'), 'sem-moves');
  const r = L.comprar(avancado(700), 'tenis-carbono');
  assert.equal(r.perfil.moves, 100);
  assert.equal(r.perfil.usando.pes, 'tenis-carbono');
  assert.equal(L.efeitos(r.perfil).velocidade, 1.03);
  assert.equal(L.estadoItem(r.perfil, 'tenis-carbono'), 'usando');
});

test('pochete dá +1 gel e relógio mostra a água', () => {
  let p = L.comprar(iniciante(300), 'pochete').perfil;
  p = L.comprar(p, 'relogio').perfil;
  const e = L.efeitos(p);
  assert.equal(e.gelMax, 1);
  assert.equal(e.distanciaAgua, true);
  // tirar a pochete tira o efeito
  assert.equal(L.efeitos(L.equipar(p, 'pochete')).gelMax, 0);
});

test('prêmios por nível; relógio comprado antes do Avançado é reembolsado', () => {
  const comRelogio = L.comprar(iniciante(200), 'relogio').perfil;
  const r = L.receberPremios({ ...comRelogio, xp: XP_INICIO[10] });
  assert.deepEqual(r.novos.map((n) => n.id).sort(), ['bone', 'relogio']);
  assert.equal(r.perfil.moves, 200);
  assert.equal(r.perfil.usando.cabeca, 'bone');
  // de novo não dá nada
  assert.equal(L.receberPremios(r.perfil).novos.length, 0);
  assert.equal(L.estadoItem(iniciante(), 'tenis-dourado'), 'premio');
});

test('um item por slot: viseira troca o boné', () => {
  let p = L.receberPremios({ ...iniciante(100), xp: XP_INICIO[5] }).perfil;
  assert.equal(p.usando.cabeca, 'bone');
  p = L.comprar(p, 'viseira').perfil;
  assert.equal(p.usando.cabeca, 'viseira');
  p = L.equipar(p, 'bone');
  assert.equal(p.usando.cabeca, 'bone');
});

test('consumíveis vão para o bolso na largada, até o limite', () => {
  let p = L.comprar(iniciante(200), 'kit-geis').perfil;
  p = L.comprar(p, 'kit-geis').perfil;
  p = L.comprar(p, 'isotonico').perfil;
  assert.equal(p.consumiveis.gel, 6);
  const r = L.usarConsumiveis(p, { gelMax: 5, prova: true });
  assert.equal(r.geis, 5);
  assert.equal(r.perfil.consumiveis.gel, 6); // continuam na mochila até serem usados
  assert.equal(r.isotonicos, 1); // fica na mochila até tomar
  const t = L.tomarIsotonico(r.perfil);
  assert.equal(t.ok, true);
  assert.equal(t.perfil.consumiveis.isotonico, 0);
  assert.equal(L.tomarIsotonico(t.perfil).ok, false);
});

test('conquistas da prova: medalha da distância e camiseta finisher, uma vez', () => {
  const r = L.conquistasDaProva(iniciante(), '10K');
  assert.deepEqual(r.novas, ['medalha-10k', 'camiseta-finisher']);
  assert.deepEqual(L.conquistasDaProva(r.perfil, '10K').novas, []);
  assert.equal(L.estadoItem(r.perfil, 'medalha-10k'), 'conquistado');
  assert.equal(L.comprar(iniciante(1000), 'medalha-6k').erro, 'bloqueado');
});

test('gel comprado só sai da mochila quando é usado; sem gel, não gasta', () => {
  let p = L.comprar(iniciante(200), 'kit-geis').perfil;
  assert.equal(p.consumiveis.gel, 3);
  const largada = L.usarConsumiveis(p, { gelMax: 5 });
  assert.equal(largada.perfil.consumiveis.gel, 3); // largou e não usou: nada some
  let g = L.gastarGel(largada.perfil);
  assert.equal(g.ok, true);
  assert.equal(g.perfil.consumiveis.gel, 2);
  g = L.gastarGel(L.gastarGel(g.perfil).perfil);
  assert.equal(g.perfil.consumiveis.gel, 0);
  assert.equal(L.gastarGel(g.perfil).ok, false);
});
