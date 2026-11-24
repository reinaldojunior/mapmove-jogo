// Fantasma do desafio: posição de quem desafiou ao longo do tempo de prova (amostras de `s` a cada `passo` s).
// Funções puras (testadas em test/fantasma.test.js).

// onde o fantasma está no tempo `t` (segundos de prova)
export function posicaoFantasma(f, t) {
  const a = f.amostras, i = t / f.passo;
  if (i <= 0) return a[0];
  if (i >= a.length - 1) return a[a.length - 1];
  const k = Math.floor(i), r = i - k;
  return a[k] + (a[k + 1] - a[k]) * r;
}

// em que tempo o fantasma passou pelo ponto `s` (para comparar com o jogador)
export function tempoNoPonto(f, s) {
  const a = f.amostras;
  if (s <= a[0]) return 0;
  for (let k = 1; k < a.length; k++) {
    if (a[k] >= s) { const r = (s - a[k - 1]) / Math.max(1e-6, a[k] - a[k - 1]); return (k - 1 + r) * f.passo; }
  }
  return f.tempo;
}

// diferença do jogador para o fantasma no ponto atual: positivo = jogador atrás (segundos)
export const diferenca = (f, s, tJogador) => tJogador - tempoNoPonto(f, s);

// texto curto: "👻 Reinaldo · 12 s na frente" / "… 8 s atrás"
export function textoDiferenca(nome, dif) {
  const s = Math.round(Math.abs(dif));
  if (s < 1) return `👻 ${nome} · lado a lado`;
  return `👻 ${nome} · ${s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} s`} ${dif > 0 ? 'à sua frente' : 'atrás'}`;
}
