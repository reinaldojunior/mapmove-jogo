import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirViadutos, ajustarCameraViaduto, fundoDoTabuleiro, ATERRO } from '../src/viaduto.js';
import { direita } from '../src/pista.js';

// percurso de mentira com viaduto: sobe para o norte por cima de x = 0 (s 0–400, 7 m de altura no meio), vira a
// leste, desce para o sul e volta para oeste no chão passando por baixo dele em (0, −200), no s = 1000
function pistaFalsa() {
  const s = [], x = [], z = [];
  const ponto = (v) => {
    if (v <= 400) return [0, -v];
    if (v <= 600) return [v - 400, -400];
    if (v <= 800) return [200, -400 + (v - 600)];
    return [200 - (v - 800), -200];
  };
  for (let v = 0; v <= 1200; v += 5) { const [px, pz] = ponto(v); s.push(v); x.push(px); z.push(pz); }
  const suave = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  const elev = Float32Array.from(s, (v) => 7 * (v < 200 ? suave((v - 90) / 80) : suave((310 - v) / 80)));
  const total = 1200;
  const indice = (v) => Math.max(0, Math.min(s.length - 2, Math.floor(v / 5)));
  const elevacao = (v) => { const i = indice(v), f = (v - s[i]) / 5; return elev[i] + (elev[i + 1] - elev[i]) * f; };
  const em = (v) => {
    const i = indice(v), f = (v - s[i]) / 5, dx = x[i + 1] - x[i], dz = z[i + 1] - z[i];
    return { x: x[i] + dx * f, z: z[i] + dz * f, y: elevacao(v), ang: Math.atan2(dx, -dz), inclinacao: 0 };
  };
  return { s, x, z, elev, total, elevacao, em, segmentosPerto: () => s.slice(0, -1).map((_, i) => i) };
}

function montar() {
  const pista = pistaFalsa();
  const amostras = [];
  for (let v = 0; v <= 1200; v += 4) amostras.push({ s: v, ...pista.em(v), lat: null });
  return { pista, g: construirViadutos({ pista, amostras }) };
}

test('viaduto: encontros onde a rampa passa da altura do aterro e pórticos a ~25–35 m', () => {
  const { pista, g } = montar();
  assert.ok(g, 'construiu o viaduto');
  const { estacoes, encontros } = g.userData.info;
  assert.equal(encontros.length, 2);
  for (const e of encontros) assert.ok(Math.abs(pista.elevacao(e) - ATERRO) < 0.05);
  assert.ok(estacoes.length >= 2);
  const pontos = [encontros[0], ...estacoes, encontros[1]];
  for (let k = 1; k < pontos.length; k++) assert.ok(pontos[k] - pontos[k - 1] >= 18 && pontos[k] - pontos[k - 1] <= 45, `vão ${pontos[k] - pontos[k - 1]}`);
});

test('viaduto: pilares fora da rua e da calçada de baixo, gabarito ≥ 5,5 m sobre ela', () => {
  const { pista, g } = montar();
  for (const s of g.userData.info.estacoes) {
    const p = pista.em(s), [, rz] = direita(p.ang);
    // a rua de baixo é a reta z = −200; os pilares do pórtico ficam a ±4,6 m do eixo do tabuleiro (que vai em z)
    for (const d of [-4.6, 4.6]) assert.ok(Math.abs(p.z + rz * d + 200) > 4 + 3.6, `pilar no s ${s.toFixed(0)} em cima da rua de baixo`);
  }
  // fundo das vigas em cima da rua de baixo
  for (const xx of [-6, 0, 6]) assert.ok(fundoDoTabuleiro(xx, -200) >= 5.5, `gabarito ${fundoDoTabuleiro(xx, -200)}`);
  assert.equal(fundoDoTabuleiro(40, -200), Infinity);
});

test('câmera: desce para baixo do tabuleiro quando o corredor passa por baixo, e não mexe em cima dele', () => {
  montar();
  const vec = (x, y, z) => ({ x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; } });
  // corredor na rua de baixo, logo depois do viaduto (indo para oeste), câmera afastada atrás dele, embaixo do tabuleiro
  const cam = vec(8, 7.2, -200);
  ajustarCameraViaduto(cam, -4, 1.6, -200);
  assert.ok(cam.y <= 7 - 1.45 - 0.5, `câmera em ${cam.y}`);
  // em cima do viaduto: nada muda
  const cima = vec(0, 14.2, -188);
  ajustarCameraViaduto(cima, 0, 8.6, -200);
  assert.equal(cima.y, 14.2);
  // longe do viaduto: nada muda
  const longe = vec(300, 7.2, -200);
  ajustarCameraViaduto(longe, 290, 1.6, -200);
  assert.equal(longe.y, 7.2);
});
