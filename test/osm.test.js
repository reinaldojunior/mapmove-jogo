import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PistaReal } from '../src/pista.js';
import { pontoNoPoligono, areaPoligono, prepararOSM, areaEm, zonasDoPercurso, zonaEm, ruasDoPercurso, abreviarRua, placasDoPercurso } from '../src/osm.js';

const quadrado = [[0, 0], [10, 0], [10, 10], [0, 10]];

test('ponto dentro e fora do polígono', () => {
  assert.equal(pontoNoPoligono(5, 5, quadrado), true);
  assert.equal(pontoNoPoligono(15, 5, quadrado), false);
  assert.equal(areaPoligono(quadrado), 100);
});

// percurso reto para o norte (~1 km); parque a leste nos primeiros 500 m, lago dentro do parque, prédios a oeste
const pista = new PistaReal(Array.from({ length: 11 }, (_, i) => [-23.1 + i * 0.0009, -47.2, 500]));
const lat = (m) => -23.1 + m / 110540;
const lng = (m) => -47.2 + m / (111320 * Math.cos((23.1 * Math.PI) / 180));
const ret = (x0, z0, x1, z1) => [[lat(z0), lng(x0)], [lat(z0), lng(x1)], [lat(z1), lng(x1)], [lat(z1), lng(x0)]];
const dados = {
  parque: [{ nome: 'Parque', p: ret(8, 0, 300, 500) }],
  agua: [{ nome: 'Lago', p: ret(60, 100, 200, 300) }],
  predio: [{ p: ret(-40, 700, -25, 715) }]
};
const osm = prepararOSM(dados, pista.paraLocal);

test('a menor área vence: lago dentro do parque', () => {
  const lago = pista.paraLocal(lat(200), lng(100));
  assert.equal(areaEm(osm, lago.x, lago.z).tipo, 'agua');
  const parque = pista.paraLocal(lat(50), lng(30));
  assert.equal(areaEm(osm, parque.x, parque.z).tipo, 'parque');
});

test('zonas de cada lado do percurso', () => {
  const zonas = zonasDoPercurso(osm, pista);
  assert.equal(zonaEm(zonas, 200, 1), 'parque');
  assert.equal(zonaEm(zonas, 200, -1), 'livre');
  assert.equal(zonaEm(zonas, 700, -1), 'cidade');
  assert.equal(zonaEm(zonas, 800, 1), 'livre');
});

test('rua com nome paralela ao percurso vira trecho; transversal não', () => {
  const comRuas = prepararOSM({
    ...dados,
    via: [
      { t: 'primary', n: 'Avenida Engenheiro Fábio Roberto Barnabé', p: [[lat(100), lng(2)], [lat(600), lng(2)]] },
      { t: 'residential', n: 'Rua Transversal', p: [[lat(800), lng(-100)], [lat(800), lng(100)]] }
    ]
  }, pista.paraLocal);
  const trechos = ruasDoPercurso(comRuas, pista);
  assert.equal(trechos.length, 1);
  assert.equal(trechos[0].nome, 'Avenida Engenheiro Fábio Roberto Barnabé');
  assert.ok(trechos[0].s0 >= 90 && trechos[0].s0 <= 110 && trechos[0].s1 >= 590, JSON.stringify(trechos[0]));
});

test('pontos de referência incluem lagos e parques com nome', () => {
  assert.ok(osm.pontos.some((p) => p.nome === 'Lago' && p.tipo === 'lago'));
  assert.ok(osm.pontos.some((p) => p.nome === 'Parque' && p.tipo === 'parque'));
});

test('abreviação de placa de rua', () => {
  assert.equal(abreviarRua('Avenida Engenheiro Fábio Roberto Barnabé'), 'Av. Eng. Fábio Roberto Barnabé');
  assert.equal(abreviarRua('Rua Martinho Lutero'), 'R. Martinho Lutero');
});

test('placas: rua do trecho, rua que cruza e ponto de referência', () => {
  const comRuas = prepararOSM({
    ...dados,
    via: [{ t: 'primary', n: 'Avenida Engenheiro Fábio Roberto Barnabé', p: [[lat(100), lng(2)], [lat(600), lng(2)]] }]
  }, pista.paraLocal);
  const placas = placasDoPercurso(comRuas, pista, [{ s: 800, lados: [-1, 1], nome: 'Rua Transversal' }]);
  const ruas = placas.filter((p) => p.tipo === 'rua').map((p) => p.nome);
  assert.ok(ruas.includes('Avenida Engenheiro Fábio Roberto Barnabé'));
  assert.ok(ruas.includes('Rua Transversal'));
  const lago = placas.find((p) => p.nome === 'Lago');
  assert.ok(lago && lago.lado === 1 && lago.s < lago.sPonto, JSON.stringify(lago));
});
