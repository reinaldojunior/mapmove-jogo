import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/regras.js';
import {
  colide, coleta, desidratar, hidratar, formatarPace, formatarKm, formatarTempo,
  velocidadeAlvo, aproximarVelocidade, resultadoAgua, mps, PACE_BASE, PACE_GEL, ALTURA_EM_PE, ALTURA_AGACHADO
} from '../src/regras.js';

const cone = { s: 50, d: 0, larg: 0.8, prof: 0.8, h: 0.95 };
const galho = { s: 50, d: -2, larg: 4.2, prof: 0.6, h: 3.5, base: 1.45 };
const emPe = (s, d, y = 0) => ({ s, d, y, altura: ALTURA_EM_PE });

test('bate no cone no chão e passa pulando ou ao lado', () => {
  assert.equal(colide(emPe(50.4, 0.2), cone), true);
  assert.equal(colide(emPe(50, 0, 1.2), cone), false);
  assert.equal(colide(emPe(50, 1.6), cone), false);
});

test('galho baixo: bate em pé, passa agachado', () => {
  assert.equal(colide(emPe(50, -1), galho), true);
  assert.equal(colide({ s: 50, d: -1, y: 0, altura: ALTURA_AGACHADO }, galho), false);
});

test('pega moeda na mesma posição', () => {
  assert.equal(coleta(emPe(10, 0.5), { s: 10.3, d: 0 }), true);
  assert.equal(coleta(emPe(10, 2.5), { s: 10, d: 0 }), false);
});

test('ritmo: 7:30 correndo sozinho, 6:30 com gel, mais lento na subida e na calçada', () => {
  assert.equal(formatarPace(velocidadeAlvo()), '7:30');
  assert.equal(formatarPace(velocidadeAlvo({ gel: true })), '6:30');
  assert.ok(velocidadeAlvo({ inclinacao: 0.05 }) < mps(PACE_BASE));
  assert.ok(velocidadeAlvo({ inclinacao: -0.05 }) > mps(PACE_BASE));
  assert.ok(velocidadeAlvo({ naCalcada: true }) < mps(PACE_BASE));
});

test('quando o gel acaba ele volta aos poucos para 7:30', () => {
  let v = mps(PACE_GEL);
  v = aproximarVelocidade(v, mps(PACE_BASE), 0.5);
  assert.ok(v < mps(PACE_GEL) && v > mps(PACE_BASE));
  for (let i = 0; i < 100; i++) v = aproximarVelocidade(v, mps(PACE_BASE), 0.1);
  assert.equal(v, mps(PACE_BASE));
});

test('hidratação fica entre 0 e 100', () => {
  assert.equal(desidratar(0.2, 1), 0);
  assert.equal(hidratar(95), 100);
});

test('formatos brasileiros', () => {
  assert.equal(formatarKm(3240), '3,24');
  assert.equal(formatarTempo(1567), '26:07');
  assert.equal(formatarTempo(9725), '2:42:05');
});

test('pegar água: só no verde e encostado do lado da mesa', () => {
  const mesa = { s: 100, lado: 1 };
  assert.equal(resultadoAgua(99, 2, mesa), 'pegou');
  assert.equal(resultadoAgua(90, 2, mesa), 'cedo');
  assert.equal(resultadoAgua(104, 2, mesa), 'tarde');
  assert.equal(resultadoAgua(100, -2, mesa), 'longe');
});

test('energia: gasta mais na subida e com sede, quase nada com gel', () => {
  const plano = 100 - R.gastarEnergia(100, 10);
  const subida = 100 - R.gastarEnergia(100, 10, { inclinacao: 0.06 });
  const sede = 100 - R.gastarEnergia(100, 10, { sede: true });
  const gel = 100 - R.gastarEnergia(100, 10, { gel: true, inclinacao: 0.06 });
  assert.ok(Math.abs(plano - R.ENERGIA_GASTO * 10) < 1e-9);
  assert.ok(subida > plano * 2 && sede > plano * 1.7 && gel < subida / 3);
  assert.equal(R.gastarEnergia(0.1, 10), 0);
});

test('energia baixa deixa o corredor mais lento; gel e água repõem', () => {
  assert.equal(R.fatorEnergia(80), 1);
  assert.ok(Math.abs(R.fatorEnergia(0) - 0.72) < 1e-9);
  assert.ok(R.velocidadeAlvo({ energia: 10 }) < R.velocidadeAlvo({ energia: 50 }));
  assert.equal(R.reporEnergia(90, R.ENERGIA_GEL), 100);
  assert.equal(R.reporEnergia(20, R.ENERGIA_AGUA), 20 + R.ENERGIA_AGUA);
});

test('janela da água dura ~1 s em qualquer pace', () => {
  // ~1 s de verde: no pace inicial são ±6,7 m em volta da mesa
  assert.ok(Math.abs(R.janelaAgua(450) - 0.5 * (1000 / 450) * 6) < 1e-9);
  assert.ok(R.janelaAgua(420) > 7);
  assert.ok(Math.abs(R.janelaAgua(225) - R.janelaAgua(450) * 2) < 1e-9); // mais rápido, mais metros, mesmo tempo
  assert.equal(R.resultadoAgua(100, 2, { s: 104, lado: 1 }, R.janelaAgua(225)), 'pegou');
  assert.equal(R.resultadoAgua(100, 2, { s: 104, lado: 1 }), 'cedo');
});

test('salto sobre o carro: só com carro de 3 a 9 m à frente, e passa por cima', () => {
  assert.equal(R.carroParaSaltar(100, [{ s: 107 }]), true);
  assert.equal(R.carroParaSaltar(100, [{ s: 112 }]), false);
  assert.equal(R.carroParaSaltar(100, [{ s: 101 }, { s: 130 }]), false);
  const alturaMax = R.SALTO_CARRO.velocidade ** 2 / (2 * -R.PULO.gravidade);
  assert.ok(alturaMax > 2.2 + 0.3 && alturaMax < 3, `altura ${alturaMax}`);
});

test('deslizar para baixo reduz o ritmo e poupa energia', () => {
  assert.ok(Math.abs(R.velocidadeAlvo({ freando: true }) - R.velocidadeAlvo() * R.FREIO.fator) < 1e-9);
  const normal = 100 - R.gastarEnergia(100, 10), freando = 100 - R.gastarEnergia(100, 10, { freando: true });
  assert.ok(Math.abs(freando - normal * R.FREIO.economia) < 1e-9);
});

test('desidratação: perde ritmo aos poucos e só para depois de um tempo sem água', () => {
  assert.equal(R.fatorHidratacao(50), 1);
  assert.ok(Math.abs(R.fatorHidratacao(7.5) - 0.9) < 1e-9);
  assert.equal(R.fatorHidratacao(0, 0), 0.8);
  assert.ok(Math.abs(R.fatorHidratacao(0, 30) - 0.4) < 1e-9);
  assert.equal(R.fatorHidratacao(0, 999), 0);
});

test('pulo: passa o cavalete com folga de tempo e sobe pouco o bastante para cair logo', () => {
  const { velocidade: v, gravidade: g } = R.PULO;
  const h = 1.08 - R.FOLGA_PE; // cavalete, com a folga do pé
  // tempo acima do cavalete: raízes de v t + g t²/2 = h
  const disc = v * v + 2 * g * h, acima = (2 * Math.sqrt(disc)) / -g;
  assert.ok(acima > 0.45, `só ${acima.toFixed(2)} s acima do cavalete`);
  assert.ok((2 * v) / -g < 0.9, 'fica tempo demais no ar');
});

test('pé raspando no alto do cone não conta como batida', () => {
  assert.equal(colide(emPe(50, 0, 0.85), cone), false);
  assert.equal(colide(emPe(50, 0, 0.7), cone), true);
});

test('curva fechada: reta e curva leve sem freio, retorno bem mais devagar', () => {
  assert.equal(R.fatorCurva(0), 1);
  assert.equal(R.fatorCurva(0.3), 1);
  assert.ok(R.fatorCurva(Math.PI / 2) < 0.85 && R.fatorCurva(Math.PI / 2) > 0.6);
  assert.ok(Math.abs(R.fatorCurva(Math.PI) - R.CURVA.minimo) < 1e-9);
  assert.ok(R.fatorCurva(-Math.PI / 2) === R.fatorCurva(Math.PI / 2));
});
