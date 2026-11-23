// Clima da corrida: sorteado a cada largada. Mexe na sede, na energia, no ritmo (vento) e na aderência (chuva),
// e dá bônus de XP quando o tempo está difícil. Funções puras (testadas em test/clima.test.js).

// temp em °C, umidade em %, vento em m/s, nuvens de 0 (céu limpo) a 1 (fechado), peso = chance no sorteio
export const CLIMAS = [
  { id: 'sol', nome: 'Sol', emoji: '☀️', temp: 24, umidade: 55, chuva: 0, vento: 2, nuvens: 0.35, peso: 3 },
  { id: 'nublado', nome: 'Nublado', emoji: '☁️', temp: 20, umidade: 72, chuva: 0, vento: 3, nuvens: 0.8, peso: 2 },
  { id: 'calor', nome: 'Calorão', emoji: '🥵', temp: 32, umidade: 45, chuva: 0, vento: 1, nuvens: 0.2, peso: 2 },
  { id: 'abafado', nome: 'Calor úmido', emoji: '🌤️', temp: 29, umidade: 85, chuva: 0, vento: 1.5, nuvens: 0.55, peso: 2 },
  { id: 'chuva', nome: 'Chuva', emoji: '🌧️', temp: 19, umidade: 95, chuva: 1, vento: 4, nuvens: 0.95, peso: 2 },
  { id: 'vento', nome: 'Ventania', emoji: '💨', temp: 21, umidade: 50, chuva: 0, vento: 7, nuvens: 0.5, peso: 1 },
  { id: 'frio', nome: 'Frio', emoji: '🧊', temp: 12, umidade: 60, chuva: 0, vento: 3, nuvens: 0.4, peso: 1 }
];

const lim = (v, a, b) => Math.max(a, Math.min(b, v));

// sorteia o clima; a temperatura varia ±2 °C e o vento vem de uma direção qualquer (radianos, mesmo sistema da pista)
export function sortearClima(rnd = Math.random) {
  const total = CLIMAS.reduce((a, c) => a + c.peso, 0);
  let r = rnd() * total, c = CLIMAS[0];
  for (const x of CLIMAS) { r -= x.peso; if (r <= 0) { c = x; break; } }
  return { ...c, temp: c.temp + Math.round((rnd() - 0.5) * 4), ventoDe: rnd() * Math.PI * 2 };
}

// quanto mais rápido a água acaba: calor e umidade aumentam, frio diminui
export const fatorSede = (c) => lim(1 + Math.max(0, c.temp - 20) * 0.035 + Math.max(0, c.umidade - 60) * 0.008 - Math.max(0, 16 - c.temp) * 0.03, 0.75, 1.9);

// acima de 25 °C o corpo esquenta e gasta mais energia (+5% por grau)
export const fatorEnergiaClima = (c) => 1 + Math.max(0, c.temp - 25) * 0.05;

// vento: de frente atrasa (até ~8% com 7 m/s), a favor ajuda pela metade; `ang` = direção em que o corredor vai
export function ventoRelativo(c, ang) {
  const contra = Math.cos(ang - c.ventoDe); // 1 = vento batendo de frente, -1 = nas costas
  return contra;
}
export function fatorVento(c, ang) {
  const contra = ventoRelativo(c, ang);
  const efeito = 0.011 * c.vento * contra;
  return 1 - (contra > 0 ? efeito : efeito * 0.5);
}

// chuva: o corredor vira mais devagar (escorrega) e o pulo sai mais curto
export const aderencia = (c) => (c.chuva ? 0.6 : 1);
export const fatorPulo = (c) => (c.chuva ? 0.93 : 1);

// bônus de XP pelo clima difícil (no máximo +25%)
export function bonusClima(c) {
  if (!c) return 0;
  let b = 0;
  if (c.temp >= 28) b += 0.1;
  if (c.umidade >= 85 && c.temp >= 25) b += 0.05;
  if (c.chuva) b += 0.15;
  if (c.vento >= 6) b += 0.1;
  if (c.temp <= 13) b += 0.05;
  return Math.min(0.25, b);
}

// texto curto para o aviso e o HUD
export const resumoClima = (c) => `${c.emoji} ${c.nome} · ${c.temp} °C · 💧${c.umidade}%${c.vento >= 3 ? ` · 💨 ${c.vento} m/s` : ''}`;
