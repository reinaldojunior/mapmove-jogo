// Pelotão da prova: corredores virtuais com ritmos parecidos com o do jogador (uns mais rápidos, outros mais lentos).
// Aqui só a simulação (posição ao longo do percurso, faixa lateral, ultrapassagens, colocação); o desenho fica no jogo.
// Funções puras, testadas em test/pelotao.test.js.

import { mps, ESCALA_TEMPO } from './regras.js';

export const FAIXAS = 8; // faixas etárias virtuais: ninguém sabe qual é a sua, só se pegou pódio nela

// cria `n` corredores ao redor da largada; `pace` = pace base do jogador (s/km)
export function criarPelotao(n, pace, rnd = Math.random) {
  const lista = [];
  for (let i = 0; i < n; i++) {
    // fator do pace: só uns poucos mais rápidos que o jogador (até 7%), a maioria mais lenta (até ~45%):
    // o pódio é possível usando bem o gel, a água e o tênis
    const f = 0.93 + Math.pow(rnd(), 0.7) * 0.52;
    lista.push({
      id: i,
      pace: pace * f,
      s: -2 - rnd() * 18 + (f < 1 ? 4 : 0), // os mais rápidos largam mais à frente, como no pelotão real
      d: (rnd() * 2 - 1) * 3.3,
      alvoD: 0,
      fase: rnd() * 10, // variação do ritmo ao longo da prova
      modelo: i % 2,
      faixa: Math.floor(rnd() * FAIXAS), // faixa etária virtual (não dizemos qual)
      passado: false
    });
  }
  for (const c of lista) c.alvoD = c.d;
  return lista;
}

// avança o pelotão `dt` segundos (de jogo); desvia do jogador quando está colado nele
// `fator(c)` = efeito do clima naquele corredor (calor e vento), 1 = sem efeito
export function avancarPelotao(lista, dt, t, jogador, rnd = Math.random, fator = null, escala = ESCALA_TEMPO) {
  for (const c of lista) {
    const ritmo = (1 + Math.sin(t * 0.05 + c.fase) * 0.04) * (fator ? fator(c) : 1); // às vezes acelera, às vezes cansa
    c.s += mps(c.pace) * ritmo * escala * dt;
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

// resultado na chegada: colocação geral e na faixa etária do jogador
// Como nas provas de verdade: o pódio geral é 1º, 2º e 3º; o pódio por idade conta a partir do 4º (os três primeiros
// gerais saem da conta da faixa). No pódio geral, `faixa` fica null (não pega os dois pódios)
export const PODIO_GERAL = 3;
export function resultadoFinal(lista, sJogador, faixaJogador) {
  const frente = lista.filter((c) => c.s > sJogador);
  const mesmaFaixa = lista.filter((c) => c.faixa === faixaJogador);
  const geral = frente.length + 1;
  const podio = new Set([...frente].sort((a, b) => b.s - a.s).slice(0, PODIO_GERAL)); // quem está no pódio geral
  return {
    geral, total: lista.length + 1,
    faixa: geral <= PODIO_GERAL ? null : frente.filter((c) => c.faixa === faixaJogador && !podio.has(c)).length + 1,
    totalFaixa: mesmaFaixa.length + 1
  };
}

// XP pela colocação (pódio geral e pódio na faixa), maior nas provas longas
const MULT_PROVA = { '6K': 1, '10K': 1.5, '21K': 2.5, '42K': 4 };
const XP_GERAL = [120, 90, 70];
const XP_FAIXA = [50, 35, 25];
export function premioColocacao(r, prova) {
  const m = MULT_PROVA[prova] || 1, itens = [];
  if (r.geral <= PODIO_GERAL) itens.push({ rotulo: `${r.geral}º lugar geral`, xp: Math.round(XP_GERAL[r.geral - 1] * m) });
  else if (r.faixa != null && r.faixa <= 3) itens.push({ rotulo: `Pódio por idade (${r.faixa}º na faixa)`, xp: Math.round(XP_FAIXA[r.faixa - 1] * m) });
  return itens;
}

// frase motivacional da chegada
export function mensagemFinal(r) {
  const pct = r.geral / r.total, linhas = [];
  if (r.geral === 1) linhas.push('🏆 Campeão! Você venceu a prova!');
  else if (r.geral <= 3) linhas.push(`🥇 Pódio geral! ${r.geral}º lugar entre ${r.total}.`);
  else if (r.geral <= 5) linhas.push(`🔥 Top 5 geral! ${r.geral}º lugar — o pódio está logo ali.`);
  else if (pct <= 0.1) linhas.push(`💪 Você terminou entre os 10% mais rápidos (${r.geral}º).`);
  else if (pct <= 0.5) linhas.push(`👏 Metade de cima! ${r.geral}º de ${r.total}.`);
  else linhas.push(`🏁 Prova completa: ${r.geral}º de ${r.total}. Cada km conta!`);
  if (r.faixa == null) linhas.push('🏆 No pódio geral você sobe ao pódio principal (o pódio por idade conta a partir do 4º)');
  else if (r.faixa <= 3) linhas.push(`🏅 Você pegou pódio por idade! (${r.faixa}º na sua faixa)`);
  else if (r.faixa <= 5) linhas.push(`😮 Você quase pegou pódio por idade (${r.faixa}º na sua faixa). Continue os treinos para evoluir!`);
  else linhas.push('📈 Continue os treinos: cada nível deixa seu pace mais forte para a próxima.');
  return linhas;
}
