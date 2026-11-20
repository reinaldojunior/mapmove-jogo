import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PistaReal } from '../src/pista.js';
import { pontoNoPoligono, areaPoligono, prepararOSM, areaEm, zonasDoPercurso, zonaEm } from '../src/osm.js';

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
