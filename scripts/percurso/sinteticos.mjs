// Banco de casos sintéticos para o map matching (etapa 1): uma "cidade de teste" no mesmo formato do grafo exportado
// (dados/grafos) e percursos com a resposta certa conhecida — a sequência de passagens (aresta, sentido, trecho) —
// mais o GPS gerado a partir dela com ruído, pontos espaçados, pontos errados e falhas (túnel).
// Determinístico (gerador pseudoaleatório com semente): o mesmo caso dá sempre o mesmo GPS.

import { projecao } from './grafo.mjs';

export const ORIGEM = [-23.5, -47.45];
const P = projecao(...ORIGEM);

// ─── cidade de teste (metros; x leste, y norte) ───────────────────────────────────────────────────────────────
// · grade de ruas de mão dupla a cada 150 m (x e y de 0 a 600), menos a linha y=300
// · y=300 é uma AVENIDA DUPLA: pista y=293 só para leste ('ida') e pista y=307 só para oeste, ligadas nas pontas
// · VIADUTO (ponte, camada 1) de (0,0) a (600,150): passa por cima das ruas x=150, 300 e 450 sem ligar nelas
// · TÚNEL (camada -1) em x=525, de y=150 a y=450: passa por baixo da avenida dupla sem ligar nela
// · rua sem saída com balão de retorno: (600,450)→(700,450)
// · NÃO há rua na diagonal (450,450)→(600,600): é um parque (caso "rua faltando")
export function cidadeDeTeste() {
  const nos = {}, nosInfo = {}, arestas = [];
  const no = (x, y) => {
    const id = `n${Math.round(x)}_${Math.round(y)}`;
    if (!nos[id]) { const { lat, lon } = P.paraLatLon(x, y); nos[id] = [lat, lon]; }
    return id;
  };
  let k = 0;
  const aresta = (pts, extra = {}) => arestas.push({ id: `s${k++}`, via: 9000 + k, nos: pts.map(([x, y]) => no(x, y)), tipo: 'residential', mao: 'dupla', ...extra });
  const V = [0, 150, 300, 450, 600];
  // ruas norte-sul (x fixo), cortadas em cada cruzamento; em y=300 cruzam as duas pistas da avenida
  for (const x of V) {
    const ys = [0, 150, 293, 307, 450, 600];
    for (let i = 0; i < ys.length - 1; i++) aresta([[x, ys[i]], [x, ys[i + 1]]], { nome: `Rua X${x}` });
  }
  // ruas leste-oeste (y fixo), menos 300
  for (const y of [0, 150, 450, 600]) for (let i = 0; i < V.length - 1; i++) aresta([[V[i], y], [V[i + 1], y]], { nome: `Rua Y${y}` });
  // avenida dupla
  for (let i = 0; i < V.length - 1; i++) {
    aresta([[V[i], 293], [V[i + 1], 293]], { nome: 'Avenida Dupla', tipo: 'primary', mao: 'ida', faixas: 3 });
    aresta([[V[i], 307], [V[i + 1], 307]], { nome: 'Avenida Dupla', tipo: 'primary', mao: 'volta', faixas: 3 });
  }
  // viaduto e túnel (sem nós em comum com as ruas que atravessam)
  aresta([[0, 0], [600, 150]], { nome: 'Viaduto', tipo: 'secondary', ponte: true, tipoPonte: 'viaduct', camada: 1 });
  aresta([[525, 150], [525, 450]], { nome: 'Túnel', tipo: 'secondary', tunel: true, camada: -1 });
  // o túnel liga nas ruas y=150 e y=450 no meio da quadra: corta essas ruas em x=525
  for (const y of [150, 450]) {
    const i = arestas.findIndex((a) => a.nome === `Rua Y${y}` && a.nos[0] === no(450, y));
    arestas.splice(i, 1, { ...arestas[i], id: arestas[i].id + 'a', nos: [no(450, y), no(525, y)] }, { ...arestas[i], id: arestas[i].id + 'b', nos: [no(525, y), no(600, y)] });
  }
  // rua sem saída com balão de retorno
  aresta([[600, 450], [700, 450]], { nome: 'Rua Sem Saída' });
  nosInfo[no(700, 450)] = { retorno: true };
  return { versao: 1, fonte: 'sintético', nos, nosInfo, arestas, resumo: {} };
}

// ─── percursos (verdade): lista de pontos (x, y) por onde a corrida passa, na ordem ───────────────────────────
// Cada caso traz o que o matching TERÁ que responder (etapa 2): passagens por aresta, retornos, trechos sem rua.
export const CASOS = {
  'circuito-2-voltas': {
    descricao: 'Quadra de 300 × 150 m percorrida 2 vezes: cada aresta da quadra tem 2 passagens no mesmo sentido',
    rota: [[0, 0], [300, 0], [300, 150], [0, 150], [0, 0], [300, 0], [300, 150], [0, 150], [0, 0]],
    espera: { passagens: { 'Rua Y0': 4, 'Rua X300': 2, 'Rua Y150': 4, 'Rua X0': 2 }, voltas: 2 },
  },
  'ida-e-volta-mesma-rua': {
    descricao: 'Retorno com cones no MEIO da quadra (x=375, fora de qualquer nó): ida e volta na mesma rua',
    rota: [[0, 450], [150, 450], [300, 450], [375, 450], [300, 450], [150, 450], [0, 450]],
    espera: { retornosNoMeio: 1, passagens: { 'Rua Y450': 6 } },
  },
  'avenida-dupla-ida-e-volta': {
    descricao: 'Vai pela pista leste (y=293) e volta pela oeste (y=307): as passagens NÃO podem colar numa só',
    rota: [[0, 293], [600, 293], [600, 307], [0, 307]],
    espera: { pistaIda: 'Avenida Dupla/ida', pistaVolta: 'Avenida Dupla/volta', distanciaEntrePistasM: 14 },
  },
  'cruzamento-em-x': {
    descricao: 'O percurso cruza a si mesmo no nó (150,150) em ângulo reto: são 2 passagens diferentes, não uma rua só',
    rota: [[0, 150], [150, 150], [300, 150], [300, 0], [150, 0], [150, 150], [150, 293]],
    espera: { cruzamentosProprios: 1 },
  },
  'largada-dentro-do-retorno': {
    descricao: 'Largada no meio da rua y=450 (x=200), vai até o retorno em x=375, volta passando pela largada e segue',
    rota: [[200, 450], [300, 450], [375, 450], [300, 450], [150, 450], [0, 450], [0, 600], [150, 600], [150, 450], [200, 450]],
    espera: { retornosNoMeio: 1, chegadaNaLargada: true },
  },
  'viaduto-sobre-o-percurso': {
    descricao: 'Sobe o viaduto (camada 1) e depois passa POR BAIXO dele na rua x=300: não pode trocar de nível',
    rota: [[0, 0], [600, 150], [450, 150], [300, 150], [300, 0]],
    espera: { camadas: [1, 0], cruzaPorBaixoDoProprioPercurso: true },
  },
  'tunel-sem-gps': {
    descricao: 'Atravessa o túnel (camada -1) por baixo da avenida; dentro do túnel o GPS não grava nada',
    rota: [[450, 150], [525, 150], [525, 450], [600, 450]],
    espera: { camadas: [0, -1, 0], lacunaGpsNoTunel: true },
  },
  'gps-com-saltos': {
    descricao: 'Circuito de 2 voltas com pontos isolados errados em 40 m (salto de GPS): devem ser ignorados',
    rota: null, base: 'circuito-2-voltas', saltos: { cada: 9, metros: 40 },
    espera: { iguaisA: 'circuito-2-voltas' },
  },
  'rua-faltando': {
    descricao: 'Corta o parque na diagonal (450,450)→(600,600), onde NÃO há rua: o trecho deve ser marcado sem casamento e '
      + 'usar o método alternativo, sem criar ligação artificial',
    rota: [[300, 450], [450, 450], [600, 600], [600, 450]],
    espera: { trechosSemCasamento: [[450, 450, 600, 600]] },
  },
  'curva-cortada-gps-espacado': {
    descricao: 'Um ponto a cada 100 m: as esquinas ficam cortadas no GPS, mas o percurso real segue as ruas',
    rota: [[0, 0], [150, 0], [150, 150], [300, 150], [300, 450], [450, 450]],
    gps: { passo: 100 }, espera: { seguePelasEsquinas: true },
  },
  'sem-saida-com-balao': {
    descricao: 'Entra na rua sem saída e volta pelo balão de retorno (nó marcado como retorno)',
    rota: [[450, 450], [600, 450], [700, 450], [600, 450], [450, 450]],
    espera: { retornoEmNo: 'balão' },
  },
};

// ─── geração do GPS ─────────────────────────────────────────────────────────────────────────────────────────────
function aleatorio(semente) {
  let s = semente >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
export const comprimento = (rota) => rota.slice(1).reduce((acc, p, i) => acc + Math.hypot(p[0] - rota[i][0], p[1] - rota[i][1]), 0);

// terreno suave (altitude real do chão) e altura das estruturas: na ponte o GPS mede o tabuleiro, no túnel some
export const terreno = (x, y) => 560 + 6 * Math.sin(x / 180) + 4 * Math.cos(y / 140);
// trecho elevado do viaduto: só quando a ROTA está no viaduto (quem passa por baixo, na mesma x,y, está no chão)
const noViaduto = (ax, ay, bx, by) => Math.abs(ay - ax / 4) < 1 && Math.abs(by - bx / 4) < 1 && ax !== bx;
const naPonte = (x, y) => x > 80 && x < 520;
const noTunel = (x, y) => Math.abs(x - 525) < 3 && y > 260 && y < 340;           // trecho coberto, sob a avenida

// GPS de um caso: pontos a cada `passo` m ao longo da rota, ruído gaussiano `sigma` m, saltos opcionais, sem pontos
// dentro do túnel. Devolve no formato do Portal: [[lat, lon, alt], ...]
export function gerarGps(nome, { passo = 20, sigma = 5, semente = 7 } = {}) {
  const caso = CASOS[nome];
  const rota = caso.rota || CASOS[caso.base].rota;
  passo = caso.gps?.passo || passo;
  const r = aleatorio(semente + nome.length * 101);
  const out = [];
  let resto = 0, n = 0;
  for (let i = 0; i < rota.length - 1; i++) {
    const [ax, ay] = rota[i], [bx, by] = rota[i + 1], L = Math.hypot(bx - ax, by - ay);
    let d = resto;
    for (; d < L; d += passo) {
      const x = ax + ((bx - ax) * d) / L, y = ay + ((by - ay) * d) / L;
      if (noTunel(x, y)) continue;
      let ex = gauss(r) * sigma, ey = gauss(r) * sigma;
      if (caso.saltos && ++n % caso.saltos.cada === 0) { const a = r() * 2 * Math.PI; ex = Math.cos(a) * caso.saltos.metros; ey = Math.sin(a) * caso.saltos.metros; }
      const alt = terreno(x, y) + (noViaduto(ax, ay, bx, by) && naPonte(x, y) ? 7 : 0) + gauss(r) * 2;
      const { lat, lon } = P.paraLatLon(x + ex, y + ey);
      out.push([+lat.toFixed(7), +lon.toFixed(7), +alt.toFixed(1)]);
    }
    resto = d - L;
  }
  const [fx, fy] = rota[rota.length - 1], { lat, lon } = P.paraLatLon(fx, fy);
  out.push([+lat.toFixed(7), +lon.toFixed(7), +terreno(fx, fy).toFixed(1)]);
  return out;
}
