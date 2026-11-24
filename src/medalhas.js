// Medalhas de pódio (1º ouro, 2º prata, 3º bronze) por distância, prêmios na hora, marcos a cada 5 medalhas
// e troca de medalhas por Move$. Funções puras (testadas em test/medalhas.test.js).

export const TIPOS = ['ouro', 'prata', 'bronze'];
export const EMOJI = { ouro: '🥇', prata: '🥈', bronze: '🥉' };

// distâncias mais longas valem mais (qualquer distância nova entra pelos km do rótulo)
export const multDistancia = (rotulo) => ({ '6K': 1, '10K': 1.5, '21K': 2.5 }[rotulo] ?? Math.max(1, (parseFloat(rotulo) || 5) / 6));
const MOVES_MEDALHA = { ouro: 80, prata: 50, bronze: 30 };
export const TROCA = { bronze: 200, prata: 350, ouro: 600 }; // Move$ por 5 medalhas iguais
export const KIT = { gel: 3, isotonico: 1 };
// itens exclusivos da coleção: total de medalhas já ganhas → item
export const ITENS_COLECAO = { 10: 'viseira-dourada', 20: 'oculos-dourado' };

const base = (p) => ({ medalhas: {}, medalhasGanhas: 0, medalhasPorDistancia: {}, consumiveis: {}, inventario: {}, usando: {}, moves: 0, ...p });
const somar = (c, kit) => { const n = { ...c }; for (const [k, v] of Object.entries(kit)) n[k] = (n[k] || 0) + v; return n; };

// quantas medalhas de cada tipo o jogador tem agora (todas as distâncias)
export function estoque(perfil) {
  const p = base(perfil), t = { ouro: 0, prata: 0, bronze: 0 };
  for (const d of Object.values(p.medalhas)) for (const k of TIPOS) t[k] += d[k] || 0;
  return t;
}

// terminou a prova em `posicao`: dá a medalha (se pódio), o prêmio dela e os dos marcos alcançados
export function registrarMedalha(perfil, rotulo, posicao) {
  const p = base(perfil);
  if (posicao > 3) return { perfil: p, linhas: [], tipo: null };
  const tipo = TIPOS[posicao - 1], linhas = [];
  const doTipo = { ...(p.medalhas[rotulo] || {}) };
  doTipo[tipo] = (doTipo[tipo] || 0) + 1;
  const ganhas = p.medalhasGanhas + 1, naDist = (p.medalhasPorDistancia[rotulo] || 0) + 1;
  let moves = Math.round(MOVES_MEDALHA[tipo] * multDistancia(rotulo)), consumiveis = p.consumiveis, inventario = p.inventario;
  linhas.push(`${EMOJI[tipo]} Medalha de ${tipo} no ${rotulo}! +${moves} Move$`);
  // marco a cada 5 medalhas (qualquer distância): Move$ crescente + kit ou item exclusivo
  if (ganhas % 5 === 0) {
    const extra = ganhas * 20;
    moves += extra;
    const item = ITENS_COLECAO[ganhas];
    if (item && !inventario[item]) {
      inventario = { ...inventario, [item]: { premio: true } };
      linhas.push(`🏅 ${ganhas} medalhas! +${extra} Move$ e um item exclusivo da coleção`);
    } else {
      consumiveis = somar(consumiveis, KIT);
      linhas.push(`🏅 ${ganhas} medalhas! +${extra} Move$ e kit com ${KIT.gel} géis e ${KIT.isotonico} isotônico`);
    }
  }
  // bônus por distância: a cada 5 medalhas na mesma distância (as longas valem mais)
  if (naDist % 5 === 0) {
    const bonus = Math.round(100 * multDistancia(rotulo) * 1.5);
    const longa = multDistancia(rotulo) >= 1.5;
    moves += bonus;
    if (longa) consumiveis = somar(consumiveis, { isotonico: 2 });
    linhas.push(`🎖️ 5 pódios no ${rotulo}! +${bonus} Move$${longa ? ' e 2 isotônicos' : ''}`);
  }
  return {
    perfil: { ...p, medalhas: { ...p.medalhas, [rotulo]: doTipo }, medalhasGanhas: ganhas, medalhasPorDistancia: { ...p.medalhasPorDistancia, [rotulo]: naDist }, moves: p.moves + moves, consumiveis, inventario },
    linhas, tipo
  };
}

// troca 5 medalhas do mesmo tipo (tirando primeiro das distâncias com mais medalhas) por Move$
export function trocarMedalhas(perfil, tipo) {
  const p = base(perfil);
  if (estoque(p)[tipo] < 5) return { erro: 'faltam' };
  const medalhas = JSON.parse(JSON.stringify(p.medalhas));
  let falta = 5;
  for (const rot of Object.keys(medalhas).sort((a, b) => (medalhas[b][tipo] || 0) - (medalhas[a][tipo] || 0))) {
    const tira = Math.min(falta, medalhas[rot][tipo] || 0);
    medalhas[rot][tipo] = (medalhas[rot][tipo] || 0) - tira;
    falta -= tira;
    if (!falta) break;
  }
  return { perfil: { ...p, medalhas, moves: p.moves + TROCA[tipo] } };
}
