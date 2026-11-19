// Regras puras do jogo (sem Three.js), testadas em test/regras.test.js

export const FAIXAS = [-2.2, 0, 2.2];
export const PULO = { velocidade: 9.5, gravidade: -26 };

// 1 unidade do mundo = 0,2 m reais: a 14 u/s o corredor faz ~6:00/km
export const M_POR_UNIDADE = 0.2;
export const HIDRATACAO_A_CADA_M = 300;
export const DESIDRATACAO_POR_S = 0.4;
export const AGUA_COPO = 20;

export const velocidade = (t) => Math.min(24, 14 + t * 0.045);

export const colide = (c, o) =>
  Math.abs(c.x - o.x) < o.w / 2 + 0.35 &&
  Math.abs(c.z - o.z) < o.d / 2 + 0.35 &&
  c.y < o.h;

export const coleta = (c, item) =>
  Math.abs(c.x - item.x) < 0.9 && Math.abs(c.z - item.z) < 0.9 && Math.abs(c.y + 1 - item.y) < 1.6;

export const desidratar = (h, dt) => Math.max(0, h - dt * DESIDRATACAO_POR_S);
export const hidratar = (h, qtd = AGUA_COPO) => Math.min(100, h + qtd);

export function formatarPace(mps) {
  if (!(mps > 0)) return '--:--';
  const s = Math.round(1000 / mps);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const formatarKm = (m) => `${(m / 1000).toFixed(2).replace('.', ',')} km`;

export const bpm = (vel) => Math.round(128 + (vel - 14) * 4.5);
