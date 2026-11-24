// Loja e vestiário: itens, compra com Move$, prêmios por nível, equipar e efeitos no jogo.
// Funções puras (testadas em test/loja.test.js); o perfil é o mesmo de perfil.js.

import { situacao } from './perfil.js';

// cat: equip (ajuda no jogo) | visual | consumivel (vale para a próxima corrida) | conquista (ganha, não compra)
// slot: onde o acessório fica no corredor; só um item por slot
// premioNivel: nível em que o item é dado de graça (0 Iniciante … 4 Elite)
export const ITENS = [
  { id: 'tenis-carbono', cat: 'equip', nome: 'Tênis de placa de carbono', preco: 600, nivelMin: 2, slot: 'pes', efeito: { velocidade: 1.03 }, desc: '+3% de velocidade. Liberado a partir do Avançado.' },
  { id: 'pochete', cat: 'equip', nome: 'Pochete de corrida', preco: 150, slot: 'cintura', efeito: { gelMax: 1 }, desc: 'Leva +1 gel no bolso (6 em vez de 5).' },
  { id: 'relogio', cat: 'equip', nome: 'Relógio GPS', preco: 120, premioNivel: 2, slot: 'pulso', efeito: { distanciaAgua: true }, desc: 'Mostra quantos metros faltam até o próximo posto de água.' },
  { id: 'tenis-dourado', cat: 'equip', nome: 'Tênis de carbono dourado', premioNivel: 4, slot: 'pes', efeito: { velocidade: 1.03 }, desc: 'Edição Elite: +3% de velocidade e brilho de campeão.' },
  { id: 'bone', cat: 'visual', nome: 'Boné Mapmove', premioNivel: 1, slot: 'cabeca', desc: 'Prêmio do Intermediário.' },
  { id: 'oculos', cat: 'visual', nome: 'Óculos espelhados', premioNivel: 3, slot: 'olhos', desc: 'Prêmio do Sub-elite.' },
  { id: 'viseira', cat: 'visual', nome: 'Viseira', preco: 60, slot: 'cabeca', desc: 'Clássico das provas de verão.' },
  { id: 'bandana', cat: 'visual', nome: 'Bandana', preco: 40, slot: 'cabeca', desc: 'Segura o suor com estilo.' },
  // exclusivos da coleção de medalhas de pódio (não se compram)
  { id: 'viseira-dourada', cat: 'visual', nome: 'Viseira dourada', premioMedalhas: 10, icone: 'viseira', dourado: true, slot: 'cabeca', desc: 'Exclusiva: ganhe 10 medalhas de pódio.' },
  { id: 'oculos-dourado', cat: 'visual', nome: 'Óculos dourado', premioMedalhas: 20, icone: 'oculos', dourado: true, slot: 'olhos', desc: 'Exclusivo: ganhe 20 medalhas de pódio.' },
  { id: 'gel', cat: 'consumivel', nome: 'Gel avulso', preco: 20, consumo: { gel: 1 }, desc: 'Começa a próxima corrida com +1 gel no bolso.' },
  { id: 'kit-geis', cat: 'consumivel', nome: 'Kit de 3 géis', preco: 50, consumo: { gel: 3 }, desc: 'Começa a próxima corrida com +3 géis no bolso.' },
  { id: 'isotonico', cat: 'consumivel', nome: 'Isotônico', preco: 25, consumo: { isotonico: 1 }, desc: 'Vai na mochila. Na corrida, toque no 🥤 para tomar: +30% de água e +15% de energia.' },
  { id: 'medalha-6k', cat: 'conquista', nome: 'Medalha 6K', desc: 'Termine a prova de 6K.' },
  { id: 'medalha-10k', cat: 'conquista', nome: 'Medalha 10K', desc: 'Termine a prova de 10K.' },
  { id: 'medalha-21k', cat: 'conquista', nome: 'Medalha 21K', desc: 'Termine a meia maratona.' },
  { id: 'camiseta-finisher', cat: 'conquista', nome: 'Camiseta finisher', desc: 'Termine qualquer prova do evento.' },
  { id: 'trofeu', cat: 'conquista', nome: 'Troféu da semana', desc: 'Fique no pódio do ranking semanal (em breve).' }
];
export const item = (id) => ITENS.find((i) => i.id === id);
export const NOMES_NIVEL = ['Iniciante', 'Intermediário', 'Avançado', 'Sub-elite', 'Elite'];

const base = (p) => ({ inventario: {}, usando: {}, consumiveis: {}, conquistas: {}, ...p });

// situação de um item para quem está olhando a loja
export function estadoItem(perfil, id) {
  const p = base(perfil), it = item(id), nivel = situacao(p.xp).nivel;
  if (it.cat === 'conquista') return p.conquistas[id] ? 'conquistado' : 'bloqueado';
  if (it.cat === 'consumivel') return p.moves >= it.preco ? 'comprar' : 'sem-moves';
  if (p.inventario[id]) return p.usando[it.slot] === id ? 'usando' : 'tenho';
  if (it.preco == null) return 'premio'; // só vem como prêmio de nível
  if (it.nivelMin != null && nivel < it.nivelMin) return 'nivel';
  return p.moves >= it.preco ? 'comprar' : 'sem-moves';
}

export function comprar(perfil, id) {
  const p = base(perfil), it = item(id), est = estadoItem(p, id);
  if (est !== 'comprar') return { erro: est };
  const novo = { ...p, moves: p.moves - it.preco };
  if (it.cat === 'consumivel') {
    const c = { ...p.consumiveis };
    for (const [k, v] of Object.entries(it.consumo)) c[k] = (c[k] || 0) + v;
    novo.consumiveis = c;
  } else {
    novo.inventario = { ...p.inventario, [id]: { comprado: it.preco } };
    novo.usando = { ...p.usando, [it.slot]: id }; // comprou, já veste
  }
  return { perfil: novo };
}

// prêmios dos níveis já alcançados; quem tinha comprado o item recebe os Move$ de volta
export function receberPremios(perfil) {
  const p = base(perfil), nivel = situacao(p.xp).nivel, novos = [];
  let moves = p.moves;
  const inventario = { ...p.inventario }, usando = { ...p.usando };
  for (const it of ITENS) {
    if (it.premioNivel == null || it.premioNivel > nivel) continue;
    const tinha = inventario[it.id];
    if (tinha?.premio) continue;
    if (tinha?.comprado) moves += tinha.comprado;
    inventario[it.id] = { premio: true };
    if (!usando[it.slot]) usando[it.slot] = it.id;
    novos.push({ id: it.id, reembolso: tinha?.comprado || 0 });
  }
  return { perfil: { ...p, moves, inventario, usando }, novos };
}

export function equipar(perfil, id) {
  const p = base(perfil), it = item(id);
  if (!p.inventario[id] || !it.slot) return p;
  const usando = { ...p.usando };
  if (usando[it.slot] === id) delete usando[it.slot]; else usando[it.slot] = id;
  return { ...p, usando };
}

// efeitos do que está vestido
export function efeitos(perfil) {
  const p = base(perfil), e = { velocidade: 1, gelMax: 0, distanciaAgua: false };
  for (const id of Object.values(p.usando)) {
    const ef = item(id)?.efeito;
    if (!ef) continue;
    if (ef.velocidade) e.velocidade = Math.max(e.velocidade, ef.velocidade);
    if (ef.gelMax) e.gelMax += ef.gelMax;
    if (ef.distanciaAgua) e.distanciaAgua = true;
  }
  return e;
}

// na largada: os géis comprados vão para o bolso (até o limite); os isotônicos ficam na mochila até serem tomados
export function usarConsumiveis(perfil, { gelMax }) {
  const p = base(perfil), c = { ...p.consumiveis };
  const geis = Math.min(gelMax, c.gel || 0);
  c.gel = (c.gel || 0) - geis;
  return { perfil: { ...p, consumiveis: c }, geis, isotonicos: c.isotonico || 0 };
}

// tomou um isotônico durante a corrida (em prova ou treino)
export function tomarIsotonico(perfil) {
  const p = base(perfil), n = p.consumiveis.isotonico || 0;
  if (n <= 0) return { perfil: p, ok: false };
  return { perfil: { ...p, consumiveis: { ...p.consumiveis, isotonico: n - 1 } }, ok: true };
}

// conquistas de uma prova concluída
export function conquistasDaProva(perfil, rotulo) {
  const p = base(perfil), ids = [`medalha-${rotulo.toLowerCase()}`, 'camiseta-finisher'].filter((id) => item(id));
  const novas = ids.filter((id) => !p.conquistas[id]);
  const conquistas = { ...p.conquistas };
  for (const id of novas) conquistas[id] = Date.now();
  return { perfil: { ...p, conquistas }, novas };
}
