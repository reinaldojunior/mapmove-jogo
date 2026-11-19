// Regras puras do jogo (sem Three.js), testadas em test/regras.test.js

// 1 km a 6:00/km leva 1 minuto de jogo: o tempo de jogo corre 6x mais rápido que o real
export const ESCALA_TEMPO = 6;

export const PACE_BASE = 450; // 7:30/km, ritmo estável sem acelerar
export const PACE_ACEL = 390; // 6:30/km, segurando o acelerador
export const PACE_GEL = 360; // 6:00/km, acelerando com gel
export const mps = (paceSegKm) => 1000 / paceSegKm;

export const MEIA_RUA = 4; // rua com 8 m de largura
export const LIMITE_CALCADA = 7.6; // além disso saiu do percurso
export const PENALIDADES_MAX = 3;

export const PULO = { velocidade: 9.5, gravidade: -26 };
export const ALTURA_EM_PE = 2.1;
export const ALTURA_AGACHADO = 1.2;
export const TEMPO_AGACHADO = 0.9;

export const DESIDRATACAO_POR_S = 0.33;
export const AGUA_GOLE = 25;
export const GOLES_POR_POSTO = 2;
export const ALCANCE_POSTO_M = 10;

export function velocidadeAlvo({ acel = 0, gel = false, inclinacao = 0, naCalcada = false } = {}) {
  const base = mps(PACE_BASE), topo = mps(gel ? PACE_GEL : PACE_ACEL);
  let v = base + (topo - base) * Math.max(0, Math.min(1, acel));
  // subida deixa o pace mais lento e descida mais rápido (5% de subida ≈ 15% mais devagar)
  v *= Math.max(0.6, Math.min(1.25, 1 - 3 * inclinacao));
  if (naCalcada) v *= 0.6;
  return v;
}

// acelera mais rápido do que freia: ao soltar, o corredor vai perdendo velocidade aos poucos
export function aproximarVelocidade(v, alvo, dt) {
  const taxa = alvo > v ? 0.7 : 0.35;
  const passo = taxa * dt;
  return Math.abs(alvo - v) <= passo ? alvo : v + Math.sign(alvo - v) * passo;
}

// colisão no espaço da pista: s ao longo do percurso, d para os lados, y altura do pé
export const colide = (c, o) =>
  Math.abs(c.s - o.s) < o.prof / 2 + 0.35 &&
  Math.abs(c.d - o.d) < o.larg / 2 + 0.35 &&
  c.y < o.h &&
  c.y + c.altura > (o.base || 0);

export const coleta = (c, item) =>
  Math.abs(c.s - item.s) < 1.1 && Math.abs(c.d - item.d) < 1.1 && c.y < 2.2;

export const desidratar = (h, dt) => Math.max(0, h - dt * DESIDRATACAO_POR_S);
export const hidratar = (h, qtd = AGUA_GOLE) => Math.min(100, h + qtd);

export function formatarPace(v) {
  if (!(v > 0.6)) return '--:--';
  const s = Math.round(1000 / v);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatarTempo(seg) {
  const t = Math.max(0, Math.round(seg));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export const formatarKm = (m) => `${(m / 1000).toFixed(2).replace('.', ',')}`;

export const bpm = (v, inclinacao = 0) => Math.max(90, Math.round(118 + (v - mps(PACE_BASE)) * 55 + inclinacao * 220));
