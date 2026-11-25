import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colarVoltas, folgaLateral, PistaReal, ATRAS_LARGADA } from '../src/pista.js';
import { limitarLateral, planoFita, amostrasDoPercurso } from '../src/faixas.js';
import { viadutosDoPercurso } from '../src/osm.js';

// percurso em metros: lista de [x, z] com um ponto a cada 5 m
function reamostrar(cantos) {
  const x = [], z = [], s = [];
  let acc = 0;
  for (let k = 0; k < cantos.length - 1; k++) {
    const [ax, az] = cantos[k], [bx, bz] = cantos[k + 1], L = Math.hypot(bx - ax, bz - az);
    for (let t = k ? 5 : 0; t <= L + 1e-9; t += 5) { x.push(ax + (bx - ax) * t / L); z.push(az + (bz - az) * t / L); s.push(acc + t); }
    acc += L;
  }
  return { x, z, s };
}

test('ida e volta a 8 m: a volta cola na ida, sem salto no caminho', () => {
  const { x, z, s } = reamostrar([[0, 0], [0, -600], [8, -600], [8, 0]]);
  const dup = colarVoltas(x, z, s);
  const volta = s.map((v, i) => i).filter((i) => s[i] > 900 && s[i] < 1100);
  assert.ok(volta.every((i) => dup[i]), 'meio da volta repetido (não desenhado de novo)');
  assert.ok(volta.every((i) => Math.abs(x[i]) < 0.01), 'volta em cima da ida');
  for (let i = 0; i < s.length - 1; i++) {
    const passo = Math.hypot(x[i + 1] - x[i], z[i + 1] - z[i]) / (s[i + 1] - s[i]);
    assert.ok(passo < 1.3, `passo ${passo.toFixed(2)} no s=${s[i]}`);
  }
});

test('duas passagens lado a lado (sem colar): a rua de depois encosta na de antes, calçadas não invadem', () => {
  // ida para o norte em x=0; volta para o sul em x=6 (à direita da ida): ruas de 8 m se cobririam
  const { x, z, s } = reamostrar([[0, 0], [0, -400], [6, -400], [6, 0]]);
  const dup = new Uint8Array(x.length);
  const f = folgaLateral(x, z, s, dup);
  const ida = s.findIndex((v) => v >= 200), volta = s.findIndex((v) => v >= 606 + 200);
  // a ida (desenhada antes) fica inteira; calçada do lado da volta some
  assert.equal(f.ruaD[ida], 4); assert.equal(f.ruaE[ida], 4);
  assert.ok(f.limD[ida] <= 4, `lim da ida ${f.limD[ida]}`); // calçada da ida desse lado com largura zero
  assert.equal(limitarLateral({ dup: false, ruaD: f.ruaD[ida], ruaE: f.ruaE[ida], limD: f.limD[ida], limE: f.limE[ida] }, 7.6), 4);
  // a volta (para o sul, a ida fica à direita) perde a parte coberta: beira em 6 - 4 - folga
  assert.ok(Math.abs(f.ruaD[volta] - 1.7) < 0.05, `ruaD da volta ${f.ruaD[volta]}`);
  assert.equal(f.ruaE[volta], 4);
  // e o que a faixa desenha bate com isso
  const lat = { dup: false, ruaD: f.ruaD[volta], ruaE: f.ruaE[volta], limD: f.limD[volta], limE: f.limE[volta] };
  assert.ok(Math.abs(limitarLateral(lat, 4) - 1.7) < 0.05);
  assert.ok(Math.abs(limitarLateral(lat, 7.6) - 1.7) < 0.05, 'calçada do lado da ida tem largura zero');
  assert.equal(limitarLateral(lat, -7.6), -7.6);
});

test('limitarLateral: rua coberta além do eixo e calçada encolhida', () => {
  const lat = { dup: false, ruaD: -1, ruaE: 4, limD: 0, limE: 5 };
  assert.equal(limitarLateral(lat, 4), -1); // a beira direita da rua passou do eixo
  assert.equal(limitarLateral(lat, -4), -4);
  assert.equal(limitarLateral(lat, -7.6), -5); // calçada esquerda até o limite
  assert.equal(limitarLateral(null, 9), 9);
});

test('planoFita não liga a faixa encolhida a um trecho repetido (sem cunha) e recorta a textura', () => {
  const lat = (o) => ({ dup: false, ruaD: 4, ruaE: 4, limD: 1e6, limE: 1e6, ...o });
  const montar = (l2) => [0, 4, 8, 12].map((s, i) => ({ s, x: 0, z: -s, y: 0, ang: 0, lat: lat(i === 1 ? { ruaD: 2 } : i === 2 ? l2 : i === 3 ? { dup: true, ruaD: 0, ruaE: 0 } : {}) }));
  const { xz, u, ativo } = planoFita(montar({ ruaE: 1 }), -4, 4);
  assert.deepEqual([...ativo], [1, 1, 0]);
  // emenda de ponta: rua inteira seguindo reto para cima de um trecho repetido não deixa buraco
  assert.deepEqual([...planoFita(montar({}), -4, 4).ativo], [1, 1, 1]);
  assert.ok(Math.abs(xz[1 * 4 + 2] - 2) < 1e-9, 'beira direita em x=2 na amostra encolhida');
  assert.ok(Math.abs(u[1 * 2 + 1] - 0.75) < 1e-6, 'textura recortada, não espremida');
});

test('viaduto: trecho em cima de ponte que cruza outro trecho sobe, o terreno não', () => {
  // 1 km para o norte; volta e cruza o começo em ângulo reto passando por cima (ponte do mapa no cruzamento)
  const lat0 = -23.1, lng0 = -47.2, mLat = 1 / 110540, mLng = 1 / (111320 * Math.cos(lat0 * Math.PI / 180));
  const pt = (x, z) => [lat0 - z * mLat, lng0 + x * mLng, 500];
  const p = new PistaReal([pt(0, 0), pt(0, -1000), pt(-300, -1000), pt(-300, -300), pt(300, -300)], { exagero: 0 });
  const pontes = [{ nome: 'Ponte', pts: [[-60, -300], [60, -300]] }];
  const vi = viadutosDoPercurso({ pontes }, p);
  assert.equal(vi.length, 1);
  assert.ok(vi[0].sob.some((v) => Math.abs(v - 300) < 15), `passa por cima do km 0,3: ${vi[0].sob}`);
  p.elevar(vi, { altura: 7 });
  const sCruz = p.localizar(lat0 + 300 * mLat, lng0).s; // o ponto (0, -300) visto no trecho de cima
  const sCima = vi[0].cruz[0]; // em cima do cruzamento
  assert.ok(p.em(sCima).y > 6.9, `em cima: ${p.em(sCima).y}`);
  assert.ok(Math.abs(p.em(300).y) < 1e-6, 'o trecho de baixo continua no chão');
  assert.ok(Math.abs(p.pertoDe(0, -300).y) < 1e-6, 'terreno no chão');
  assert.ok(sCruz >= 0);
  // rampa suave (no máximo ~12%) e começando só onde não há outro trecho ao lado
  for (let i = 1; i < p.s.length; i++) assert.ok(Math.abs(p.y[i] - p.y[i - 1]) / 5 < 0.12);
  assert.ok(p.rampas[0].topo0 - p.rampas[0].s0 > 60, 'rampa de subida comprida');
});

// percurso em lat/lng a partir de cantos em metros (x leste, z sul)
function emLatLng(cantos) {
  const lat0 = -23.1, lng0 = -47.2, mLat = 1 / 110540, mLng = 1 / (111320 * Math.cos(lat0 * Math.PI / 180));
  return cantos.map(([x, z]) => [lat0 - z * mLat, lng0 + x * mLng, 500]);
}

test('largada: a rua atrás do tapete (onde o pelotão espera) fica inteira mesmo com a chegada passando ao lado', () => {
  // circuito: a chegada sobe por x=6, colada na rua atrás da largada (x=0, z de 0 a 30)
  const p = new PistaReal(emLatLng([[0, 0], [0, -500], [200, -500], [200, 300], [6, 300], [6, 5]]), { exagero: 0 });
  const am = amostrasDoPercurso(p);
  const atras = am.filter((a) => a.s >= -ATRAS_LARGADA + 2 && a.s < 0);
  assert.ok(atras.length >= 6);
  for (const a of atras) assert.ok(!a.lat.dup && a.lat.ruaD >= 3.99 && a.lat.ruaE >= 3.99, `s=${a.s}: ${JSON.stringify(a.lat)}`);
  // a chegada é que cede: perto da largada a rua dela encosta na de trás da largada
  const chegada = am.find((a) => a.s > p.total - 15 && a.s < p.total - 5 && !a.lat.dup);
  assert.ok(chegada && Math.min(chegada.lat.ruaD, chegada.lat.ruaE) < 3, `chegada: ${JSON.stringify(chegada?.lat)}`);
});

test('retorno fechado: a ponta vira leque, com a rua inteira do lado de fora (sem fiapo nem buraco)', () => {
  // vai 400 m para o norte e volta 14 m ao lado: dois retornos de 90° seguidos, cada um mais fechado que o raio da rua
  const p = new PistaReal(emLatLng([[0, 0], [0, -400], [14, -400], [14, 0]]), { exagero: 0 });
  const am = amostrasDoPercurso(p);
  const leque = am.filter((a) => a.leque);
  assert.ok(leque.length >= 3, 'há amostras em leque nas esquinas do retorno');
  const { xz } = planoFita(am, -4, 4);
  // no leque o lado de fora tem a rua inteira (4 m) e o de dentro fica no eixo
  for (const a of leque) {
    const i = am.indexOf(a), lados = [Math.hypot(xz[i * 4] - a.x, xz[i * 4 + 1] - a.z), Math.hypot(xz[i * 4 + 2] - a.x, xz[i * 4 + 3] - a.z)];
    assert.ok(Math.max(...lados) > 3.9 && Math.min(...lados) < 0.01, `s=${a.s}: ${lados}`);
  }
});
