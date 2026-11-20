// Treinos diários: catálogo por nível, prescrição alternando forte e leve, compra com Move$ e sequência.
// Funções puras (testadas em test/treinos.test.js). Os métodos são descritos sem nomes de treinadores.

import { situacao } from './perfil.js';

// fator = pace do treino ÷ pace base do nível (1,15 = 15% mais lento; 0,85 = 15% mais rápido)
// tipo: leve | forte | longo | regen  (a prescrição alterna os tipos)
const T = (id, nivel, tipo, nome, local, detalhe, fator, serve) => ({ id, nivel, tipo, nome, local, detalhe, fator, serve });

export const CATALOGO = [
  // ── Iniciante: base, sem tiros ──
  T('corre-caminha', 0, 'leve', 'Corre-caminha', 'parque', '8 × (2 min correndo + 1 min caminhando)', 1.18, 'Método clássico para iniciantes: acostuma o corpo ao impacto sem sobrecarregar.'),
  T('rodagem-20', 0, 'leve', 'Rodagem leve 20 min', 'parque', '20 min contínuos, dá para conversar', 1.15, 'Constrói a base aeróbia, que sustenta todo o resto.'),
  T('rodagem-acel', 0, 'forte', 'Rodagem + acelerações', 'parque', '20 min leve + 4 acelerações de 20 s', 1.12, 'As acelerações ensinam a passada rápida e solta, sem cansar.'),
  T('longao-5', 0, 'longo', 'Longão curto 5 km', 'parque', '5 km no ritmo de conversa', 1.16, 'Ensina o corpo a ficar mais tempo correndo.'),
  T('fartlek-leve', 0, 'forte', 'Fartlek leve', 'parque', '25 min alternando 1 min solto e 2 min leve', 1.08, 'Brincar com o ritmo melhora o fôlego sem a pressão do relógio.'),
  T('regenerativo-0', 0, 'regen', 'Regenerativo', 'parque', '15 min bem leve + alongamento', 1.25, 'Recupera as pernas e acelera a assimilação dos treinos.'),
  T('subida-caminhando', 0, 'forte', 'Subida caminhando forte', 'subida', '6 × 1 min de subida em caminhada vigorosa', 1.3, 'Fortalece panturrilhas e coxas, protegendo de lesões.'),
  T('trote-30', 0, 'longo', 'Trote contínuo 30 min', 'parque', '30 min sem parar, bem confortável', 1.15, 'O primeiro grande marco: meia hora correndo direto.'),

  // ── Intermediário: volume e primeiro limiar ──
  T('longao-10', 1, 'longo', 'Longão 10 km', 'parque', '10 km leve', 1.14, 'Aumenta a resistência para provas de 10K em diante.'),
  T('tempo-15', 1, 'forte', 'Tempo run 15 min', 'rua', '10 min aquecendo + 15 min "confortavelmente difícil" + 10 min soltando', 0.95, 'Treina o limiar: aguentar um ritmo forte por mais tempo.'),
  T('progressivo', 1, 'forte', 'Progressivo', 'parque', '30 min começando leve e terminando forte', 1.0, 'Ensina a acelerar com o corpo já cansado, como no fim da prova.'),
  T('fartlek-1-1', 1, 'forte', 'Fartlek 1 por 1', 'parque', '10 × (1 min forte + 1 min leve)', 0.92, 'Melhora a capacidade de mudar de ritmo e recuperar rápido.'),
  T('acel-pista', 1, 'leve', 'Acelerações na pista', 'pista', 'Rodagem 25 min + 6 × 100 m soltos', 1.1, 'Passada mais eficiente sem gastar energia.'),
  T('subidas-curtas', 1, 'forte', 'Subidas curtas', 'subida', '8 × 30 s de subida forte, descendo trotando', 0.95, 'Força específica de corrida: mais potência em cada passada.'),
  T('rodagem-media', 1, 'leve', 'Rodagem média 40 min', 'rua', '40 min leve', 1.13, 'Mantém o volume semanal que sustenta a evolução.'),
  T('regenerativo-1', 1, 'regen', 'Regenerativo', 'parque', '25 min bem leve', 1.25, 'Recupera para o próximo treino forte.'),

  // ── Avançado: limiar, VO2máx e velocidade na pista ──
  T('tempo-25', 2, 'forte', 'Tempo run 25 min', 'rua', '25 min no limiar entre aquecimento e desaquecimento', 0.93, 'Eleva o limiar: o ritmo de prova fica mais confortável.'),
  T('cruise-1600', 2, 'forte', '3 × 1.600 m no limiar', 'pista', '3 × 1.600 m com 1 min de trote', 0.92, 'Limiar em blocos: mais tempo de qualidade com menos desgaste.'),
  T('tiros-400', 2, 'forte', '8 × 400 m na pista', 'pista', '8 × 400 m rápidos com 400 m de trote', 0.82, 'Velocidade e economia de corrida: correr rápido gastando menos.'),
  T('tiros-1000', 2, 'forte', '5 × 1.000 m', 'pista', '5 × 1.000 m fortes com 3 min de trote', 0.87, 'Treina o VO2máx, o "motor" que define o seu teto de velocidade.'),
  T('longao-final', 2, 'longo', 'Longão com final rápido', 'parque', '14 km leve, os últimos 3 km no ritmo de prova', 1.08, 'Resistência e capacidade de acelerar no final.'),
  T('medio-longo', 2, 'longo', 'Médio-longo 12 km', 'rua', '12 km moderado', 1.1, 'Volume com qualidade, base para a meia maratona.'),
  T('subidas-longas', 2, 'forte', 'Subidas longas', 'subida', '6 × 2 min de subida forte', 0.95, 'Força e fôlego para os trechos de subida da prova.'),
  T('regenerativo-2', 2, 'regen', 'Regenerativo', 'parque', '30 min bem leve', 1.25, 'Absorve os treinos de pista.'),

  // ── Sub-elite: volume alto e ritmo de prova ──
  T('tiros-1200', 3, 'forte', '5 × 1.200 m', 'pista', '5 × 1.200 m fortes com 2 min de trote', 0.88, 'VO2máx em séries longas: sustentar ritmo alto por mais tempo.'),
  T('limiar-2x5', 3, 'forte', '2 × 5 km no limiar', 'rua', '2 × 5 km com 3 min de trote', 0.93, 'Limiar estendido, essencial para a meia maratona.'),
  T('longao-25', 3, 'longo', 'Longão 25 km com ritmo de prova', 'parque', '25 km, com 8 km no ritmo de prova no meio', 1.06, 'Resistência específica: o ritmo da prova com as pernas cansadas.'),
  T('medio-18', 3, 'longo', 'Médio-longo 18 km', 'rua', '18 km moderado', 1.08, 'Volume de qualidade sem o desgaste de um longão.'),
  T('tiros-200', 3, 'forte', '10 × 200 m', 'pista', '10 × 200 m muito rápidos com 200 m de trote', 0.78, 'Velocidade pura e técnica de corrida.'),
  T('combinado', 3, 'forte', 'Combinado limiar + tiros', 'pista', '20 min no limiar + 6 × 400 m', 0.9, 'Junta duas qualidades num treino: ritmo sustentado e velocidade.'),
  T('regenerativo-3', 3, 'regen', 'Regenerativo', 'parque', '35 min bem leve', 1.25, 'Recuperação ativa entre treinos fortes.'),
  T('rodagem-dupla', 3, 'leve', 'Rodagem dupla', 'rua', '2 rodagens de 40 min no mesmo dia', 1.12, 'Mais volume semanal dividido em duas sessões.'),

  // ── Elite: treinos específicos de prova ──
  T('especifico-ext', 4, 'longo', 'Específico extensivo', 'rua', '3 × 5 km a 97% do ritmo de prova', 0.97, 'Muito volume perto do ritmo de prova: a base do desempenho de elite.'),
  T('especifico-int', 4, 'forte', 'Específico intensivo', 'pista', '6 × 2 km a 103% do ritmo de prova', 0.9, 'Correr mais rápido que a prova para que a prova pareça fácil.'),
  T('alternado', 4, 'forte', 'Alternado', 'rua', '16 km alternando 1 km forte e 1 km moderado, sem parar', 0.94, 'Recuperar correndo rápido: o corpo aprende a limpar o cansaço em movimento.'),
  T('longao-rapido', 4, 'longo', 'Longão rápido', 'rua', '30 km a 90% do ritmo de prova', 1.02, 'Resistência e ritmo juntos, o treino-chave da meia e da maratona.'),
  T('tiros-ritmo', 4, 'forte', 'Tiros no ritmo de prova', 'pista', '10 × 1.000 m no ritmo de prova com 1 min de pausa', 0.92, 'Fixa o ritmo exato da prova na memória do corpo.'),
  T('bloco-duplo', 4, 'forte', 'Bloco duplo', 'pista', 'Manhã: 5 km no limiar · Tarde: 5 km no limiar', 0.93, 'Muito trabalho de qualidade no mesmo dia, típico de quem treina em alto nível.'),
  T('regenerativo-4', 4, 'regen', 'Regenerativo', 'parque', '40 min bem leve', 1.22, 'Mesmo a elite precisa de dias leves para evoluir.'),
  T('controle-5k', 4, 'forte', 'Controle de 5 km', 'pista', '5 km no máximo, cronometrado', 0.88, 'Mede a forma atual e mostra quanto você evoluiu.')
];

export const LOCAIS = { parque: '🌳 Parque', rua: '🛣️ Rua', pista: '🏟️ Pista de atletismo', subida: '⛰️ Subida' };

// ciclo da semana: nunca dois fortes seguidos
export const CICLO = ['leve', 'forte', 'leve', 'longo', 'regen', 'forte', 'leve'];

export const XP_TREINO_BASE = 60;
export const xpTreino = (indiceDegrau) => Math.round(XP_TREINO_BASE * 1.08 ** indiceDegrau);
export const PRECO_TREINO = 90; // Move$: ~3 provas de 10K
export const BONUS_SEQUENCIA = { 3: 10, 7: 30, 14: 60, 30: 150 }; // Move$ ao completar N dias seguidos

// dia local no formato AAAA-MM-DD (o treino grátis libera à meia-noite)
export function diaLocal(ms = Date.now()) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86400000);

// treino prescrito: o tipo vem do ciclo (pelo dia e por quantos já fez hoje); a escolha varia com o dia
export function prescrever(nivel, dia, feitosHoje = 0) {
  const n = Math.max(0, diasEntre('2026-01-05', dia));
  const tipo = CICLO[(n + feitosHoje) % CICLO.length];
  // nível sem treino daquele tipo: um dia leve vira regenerativo ou longo, nunca forte
  const alternativas = { leve: ['leve', 'regen', 'longo'], forte: ['forte'], longo: ['longo', 'leve'], regen: ['regen', 'leve'] }[tipo];
  let opcoes = [];
  for (const alt of alternativas) { opcoes = CATALOGO.filter((t) => t.nivel === nivel && t.tipo === alt); if (opcoes.length) break; }
  return opcoes[(n * 7 + feitosHoje * 3) % opcoes.length];
}

export const treinoGratisDisponivel = (perfil, agora = Date.now()) => perfil.treinoGratisEm !== diaLocal(agora);

// executa o treino: XP, Move$ (compra e sequência), histórico e atividade para a perda de forma
export function executarTreino(perfil, { comprado = false, agora = Date.now(), aleatorio = Math.random } = {}) {
  const hoje = diaLocal(agora);
  if (comprado && perfil.moves < PRECO_TREINO) return { erro: 'Move$ insuficientes' };
  if (!comprado && !treinoGratisDisponivel(perfil, agora)) return { erro: 'O treino grátis de hoje já foi feito' };
  const antes = situacao(perfil.xp);
  const feitosHoje = perfil.treinosHoje?.dia === hoje ? perfil.treinosHoje.n : 0;
  const treino = prescrever(antes.nivel, hoje, feitosHoje);
  const xp = xpTreino(antes.indice);
  // sequência de dias com treino
  let seq = perfil.sequencia || 0;
  const ultimo = perfil.ultimoDiaTreino;
  if (ultimo !== hoje) seq = ultimo && diasEntre(ultimo, hoje) === 1 ? seq + 1 : 1;
  const bonus = ultimo !== hoje ? BONUS_SEQUENCIA[seq] || 0 : 0;
  const novo = {
    ...perfil,
    xp: perfil.xp + xp,
    moves: perfil.moves - (comprado ? PRECO_TREINO : 0) + bonus,
    ultimaCorrida: agora,
    treinoGratisEm: comprado ? perfil.treinoGratisEm : hoje,
    treinosHoje: { dia: hoje, n: feitosHoje + 1 },
    sequencia: seq, ultimoDiaTreino: hoje,
    treinos: (perfil.treinos || 0) + 1
  };
  const depois = situacao(novo.xp);
  // pace executado: o do treino no seu nível, com a variação natural do dia (±2%)
  const paceExecutado = Math.round(antes.pace * treino.fator * (0.98 + aleatorio() * 0.04));
  return {
    perfil: novo, treino, xp, bonus, sequencia: seq, comprado, paceExecutado, antes, depois,
    subiuDegrau: depois.indice > antes.indice, subiuNivel: depois.nivel > antes.nivel
  };
}
