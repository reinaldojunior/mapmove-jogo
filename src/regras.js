// Regras puras do jogo (sem Three.js), testadas em test/regras.test.js

// 1 km a 6:00/km leva 1 minuto de jogo: o tempo de jogo corre 6x mais rápido que o real
export const ESCALA_TEMPO = 6;

export const PACE_BASE = 450; // 7:30/km: o corredor corre sozinho nesse ritmo
export const PACE_GEL = 390; // 6:30/km enquanto o gel faz efeito
export const GEL_DURACAO = 15; // segundos de jogo
export const GEL_MAX = 5;
export const mps = (paceSegKm) => 1000 / paceSegKm;

export const MEIA_RUA = 4; // rua com 8 m de largura
export const LIMITE_CALCADA = 7.6; // além disso saiu do percurso
export const PENALIDADES_MAX = 3;

export const PULO = { velocidade: 9.5, gravidade: -26 };
// salto sobre o carro da travessa: pulo bem mais alto quando há um carro logo à frente (sobe ~3,2 m, carro tem 2,2 m)
export const SALTO_CARRO = { velocidade: 13, de: 3, ate: 13 };
export const carroParaSaltar = (sCorredor, carros) =>
  carros.some((c) => c.s - sCorredor >= SALTO_CARRO.de && c.s - sCorredor <= SALTO_CARRO.ate);
export const ALTURA_EM_PE = 2.1;
export const ALTURA_AGACHADO = 1.2;
export const TEMPO_AGACHADO = 0.9;

// postos reais ficam a ~2,5–3 km: dá para chegar no próximo com folga pegando os 2 copos
export const DESIDRATACAO_POR_S = 0.26;
export const AGUA_GOLE = 25;
export const POSTO_PADRAO_M = 2000; // quando o KML não marca os postos
export const JANELA_AGUA_M = 2.5; // distância da mesa em que a gota fica verde
export const PERTO_DA_MESA = 1.3; // quão encostado no lado da mesa precisa estar
export const PERDA_TROPECO = 0.35; // velocidade que sobra depois de tropeçar

// energia (0–100): gasta devagar no plano, mais nas subidas e com sede; o gel repõe
export const ENERGIA_GASTO = 0.085; // por segundo: o 10K termina com ~40%; o 21K pede 1 ou 2 géis
export const ENERGIA_SUBIDA = 2.5; // a mais por segundo a cada 100% de inclinação (5% de subida ≈ +0,125/s)
export const ENERGIA_GEL = 35;
export const ENERGIA_AGUA = 3;
export const ENERGIA_BAIXA = 30;

export function gastarEnergia(e, dt, { inclinacao = 0, gel = false, sede = false } = {}) {
  let gasto = ENERGIA_GASTO + Math.max(0, inclinacao) * ENERGIA_SUBIDA;
  if (gel) gasto *= 0.3; // com gel fazendo efeito, quase não gasta
  if (sede) gasto *= 1.8; // com pouca água, gasta quase o dobro
  return Math.max(0, e - gasto * dt);
}

export const reporEnergia = (e, qtd) => Math.min(100, e + qtd);

// abaixo de 30% o corredor vai "quebrando": até 72% da velocidade com o tanque vazio
export const fatorEnergia = (e) => (e >= ENERGIA_BAIXA ? 1 : 0.72 + 0.28 * Math.max(0, e) / ENERGIA_BAIXA);

// o gel deixa o pace ~13% mais rápido que o pace base do nível (7:30 → 6:30)
export const paceDoGel = (pace) => Math.round((pace * PACE_GEL) / PACE_BASE);

export function velocidadeAlvo({ gel = false, inclinacao = 0, naCalcada = false, energia = 100, pace = PACE_BASE } = {}) {
  let v = mps(gel ? paceDoGel(pace) : pace) * fatorEnergia(energia);
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

// pegar água: só no verde (mesa ao lado) e encostado do lado da mesa
// a janela é em metros no pace inicial; mais rápido, ela cresce para durar o mesmo tempo
export const janelaAgua = (pace = PACE_BASE) => JANELA_AGUA_M * Math.max(1, PACE_BASE / pace);

export function resultadoAgua(sCorredor, dCorredor, mesa, janela = JANELA_AGUA_M) {
  if (dCorredor * mesa.lado < PERTO_DA_MESA) return 'longe';
  const dist = mesa.s - sCorredor;
  if (dist > janela) return 'cedo';
  if (dist < -janela) return 'tarde';
  return 'pegou';
}

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

