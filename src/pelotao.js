// Pelotão da prova: corredores virtuais com ritmos parecidos com o do jogador (uns mais rápidos, outros mais lentos).
// Aqui só a simulação (posição ao longo do percurso, faixa lateral, ultrapassagens, colocação); o desenho fica no jogo.
// Funções puras, testadas em test/pelotao.test.js.

import { mps, ESCALA_TEMPO } from './regras.js';

// cria `n` corredores ao redor da largada; `pace` = pace base do jogador (s/km)
export function criarPelotao(n, pace, rnd = Math.random) {
  const lista = [];
  for (let i = 0; i < n; i++) {
    // fator do pace: ~30% mais rápidos que o jogador, a maioria mais lenta (até 40% mais lenta)
    const f = 0.85 + Math.pow(rnd(), 0.8) * 0.55;
    lista.push({
      id: i,
      pace: pace * f,
      s: -2 - rnd() * 18 + (f < 1 ? 4 : 0), // os mais rápidos largam mais à frente, como no pelotão real
      d: (rnd() * 2 - 1) * 3.3,
      alvoD: 0,
      fase: rnd() * 10, // variação do ritmo ao longo da prova
      modelo: i % 2,
      passado: false
    });
  }
  for (const c of lista) c.alvoD = c.d;
  return lista;
}

// avança o pelotão `dt` segundos (de jogo); desvia do jogador quando está colado nele
export function avancarPelotao(lista, dt, t, jogador, rnd = Math.random) {
  for (const c of lista) {
    const ritmo = 1 + Math.sin(t * 0.05 + c.fase) * 0.04; // às vezes acelera, às vezes cansa
    c.s += mps(c.pace) * ritmo * ESCALA_TEMPO * dt;
    if (rnd() < dt * 0.15) c.alvoD = Math.max(-3.4, Math.min(3.4, c.d + (rnd() * 2 - 1) * 1.5));
    const ds = c.s - jogador.s, dd = c.d - jogador.d;
    if (Math.abs(ds) < 2.2 && Math.abs(dd) < 1.1) c.alvoD = Math.max(-3.4, Math.min(3.4, jogador.d + (dd >= 0 ? 1.3 : -1.3)));
    c.d += Math.max(-1, Math.min(1, c.alvoD - c.d)) * 1.2 * dt;
  }
}

// colocação do jogador (1 = primeiro) e quantos ele acabou de ultrapassar
export function colocacao(lista, sJogador) {
  let frente = 0, novas = 0;
  for (const c of lista) {
    if (c.s > sJogador) { frente++; c.passado = false; }
    else if (!c.passado) { c.passado = true; if (c.s > 1) novas++; } // na largada não conta
  }
  return { posicao: frente + 1, total: lista.length + 1, ultrapassagens: novas };
}

// quem está na frente de todos (jogador ou pelotão)
export const lider = (lista, sJogador) => Math.max(sJogador, ...lista.map((c) => c.s));
