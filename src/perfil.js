// Evolução do corredor: níveis, degraus de pace, XP, Move$ e perda de forma.
// Funções puras (testadas em test/perfil.test.js); quem salva no aparelho é o main.js.

// cada nível vai de um pace a outro em degraus; no começo os degraus são grandes, no topo pequenos
export const NIVEIS = [
  { nome: 'Iniciante', de: 420, ate: 360, degraus: 5 }, // 7:00 → 6:00
  { nome: 'Intermediário', de: 360, ate: 315, degraus: 5 }, // 6:00 → 5:15
  { nome: 'Avançado', de: 315, ate: 270, degraus: 6 }, // 5:15 → 4:30
  { nome: 'Sub-elite', de: 270, ate: 225, degraus: 8 }, // 4:30 → 3:45
  { nome: 'Elite', de: 225, ate: 180, degraus: 10 } // 3:45 → 3:00
];

// lista plana de degraus: o 1º de cada nível corre no pace "de"; o último chega no "ate" do nível
export const DEGRAUS = NIVEIS.flatMap((n, i) =>
  Array.from({ length: n.degraus }, (_, k) => ({
    nivel: i, nome: n.nome, sub: k + 1,
    pace: Math.round(n.de - ((n.de - n.ate) * k) / n.degraus)
  })));
// quem completa o último degrau do Elite chega a 3:00/km
export const PACE_MAXIMO = NIVEIS[NIVEIS.length - 1].ate;

// XP para sair do degrau i: cresce 14% a cada degrau (rápido no começo, cada vez mais difícil)
export const XP_PRIMEIRO = 100;
export const CRESCIMENTO = 1.14;
export const custoDegrau = (i) => Math.round(XP_PRIMEIRO * CRESCIMENTO ** i);
export const XP_INICIO = DEGRAUS.map((_, i) => { let t = 0; for (let k = 0; k < i; k++) t += custoDegrau(k); return t; });
export const XP_TOTAL = XP_INICIO[DEGRAUS.length - 1] + custoDegrau(DEGRAUS.length - 1);

// em que degrau está quem tem `xp`, quanto já andou nele e qual o pace
export function situacao(xp) {
  let i = DEGRAUS.length - 1;
  while (i > 0 && xp < XP_INICIO[i]) i--;
  const d = DEGRAUS[i], custo = custoDegrau(i);
  const noDegrau = Math.max(0, xp - XP_INICIO[i]);
  const completo = i === DEGRAUS.length - 1 && noDegrau >= custo;
  return {
    indice: i, nivel: d.nivel, nome: d.nome, sub: d.sub, rotulo: `${d.nome} ${d.sub}`,
    pace: completo ? PACE_MAXIMO : d.pace,
    xpNoDegrau: Math.min(noDegrau, custo), xpDoDegrau: custo, progresso: Math.min(1, noDegrau / custo),
    proximo: DEGRAUS[i + 1] || null, completo
  };
}

// ── ganho de uma corrida ──
export const XP_POR_KM = 10;
export const BONUS_PROVA = { '6K': 40, '10K': 80, '21K': 200 };
export const MOVES_POR_KM = 1;
export const MOVES_PROVA = { '6K': 10, '10K': 20, '21K': 50 };
export const XP_MISSAO = 30;

// missões de cada corrida (só valem em prova concluída, menos "correr 1 km" no treino)
export function missoes(c) {
  const lista = [];
  if (c.prova) {
    lista.push({ id: 'agua', nome: 'Pegue todos os copos de água', ok: c.copos > 0 && c.coposPegos >= c.copos });
    lista.push({ id: 'tropeco', nome: 'Termine sem tropeçar', ok: c.concluiu && c.tropecos === 0 });
    lista.push({ id: 'penal', nome: 'Termine sem penalidade', ok: c.concluiu && c.penalidades === 0 });
  } else {
    lista.push({ id: 'km', nome: 'Corra 1 km no treino', ok: c.metros >= 1000 });
  }
  return lista;
}

// c = { metros, prova: '10K'|null, concluiu, penalidades, tropecos, copos, coposPegos, agua }
export function ganhoDaCorrida(c) {
  const km = Math.max(0, c.metros) / 1000;
  const itens = [{ rotulo: `${km.toFixed(2).replace('.', ',')} km corridos`, xp: Math.round(km * XP_POR_KM) }];
  if (c.prova && c.concluiu) itens.push({ rotulo: `Prova de ${c.prova} completa`, xp: BONUS_PROVA[c.prova] || 0 });
  // desempenho: até +30% sobre o que já ganhou
  if (c.prova && c.concluiu) {
    let extra = 0;
    if (c.penalidades === 0) extra += 0.1;
    if (c.tropecos <= 2) extra += 0.1;
    if (c.agua >= 50) extra += 0.1;
    const base = itens.reduce((a, i) => a + i.xp, 0);
    if (extra) itens.push({ rotulo: 'Desempenho na prova', xp: Math.round(base * extra) });
  }
  const ms = missoes(c);
  for (const m of ms) if (m.ok) itens.push({ rotulo: `Missão: ${m.nome}`, xp: XP_MISSAO });
  const xp = itens.reduce((a, i) => a + i.xp, 0);
  const moves = Math.floor(km * MOVES_POR_KM) + (c.prova && c.concluiu ? MOVES_PROVA[c.prova] || 0 : 0);
  return { xp, moves, itens, missoes: ms };
}

// ── perda de forma: depois de 3 dias parado, perde 20% do degrau por dia, no máximo 2 degraus ──
export const DIAS_SEM_PERDA = 3;
export const PERDA_POR_DIA = 0.2;
export const DEGRAUS_MAX_PERDA = 2;
const DIA_MS = 86400000;

export function xpComDestreino(xp, ultimaCorrida, agora = Date.now()) {
  if (!ultimaCorrida) return { xp, dias: 0, perdido: 0 };
  const dias = Math.floor((agora - ultimaCorrida) / DIA_MS);
  if (dias <= DIAS_SEM_PERDA) return { xp, dias, perdido: 0 };
  const i = situacao(xp).indice;
  const piso = XP_INICIO[Math.max(0, i - DEGRAUS_MAX_PERDA)];
  const perda = Math.round((dias - DIAS_SEM_PERDA) * PERDA_POR_DIA * custoDegrau(i));
  const novo = Math.max(piso, xp - perda);
  return { xp: novo, dias, perdido: xp - novo };
}

// ── perfil salvo ──
export const perfilNovo = () => ({ versao: 1, xp: 0, moves: 0, ultimaCorrida: 0, corridas: 0, kmTotal: 0 });

// aplica uma corrida ao perfil (já considerando a perda de forma até agora) e diz se subiu de degrau/nível
export function registrarCorrida(perfil, c, agora = Date.now()) {
  const forma = xpComDestreino(perfil.xp, perfil.ultimaCorrida, agora);
  const antes = situacao(forma.xp);
  const ganho = ganhoDaCorrida(c);
  const novo = {
    ...perfil, xp: forma.xp + ganho.xp, moves: perfil.moves + ganho.moves, ultimaCorrida: agora,
    corridas: perfil.corridas + 1, kmTotal: perfil.kmTotal + Math.max(0, c.metros) / 1000
  };
  const depois = situacao(novo.xp);
  return {
    perfil: novo, ganho, antes, depois, perdaDeForma: forma.perdido,
    subiuDegrau: depois.indice > antes.indice, subiuNivel: depois.nivel > antes.nivel
  };
}

export function lerPerfil(texto) {
  try {
    const p = JSON.parse(texto);
    if (!p || typeof p.xp !== 'number') return perfilNovo();
    return { ...perfilNovo(), ...p };
  } catch { return perfilNovo(); }
}
