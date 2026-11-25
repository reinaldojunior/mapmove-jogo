// Map matching (etapa 2): encaixa o GPS de uma distância no grafo de ruas (grafo.mjs), preservando a sequência da
// corrida. Modelo oculto de Markov resolvido por Viterbi:
//   · estado = (aresta, posição na aresta, sentido de corrida) perto de cada ponto do GPS, ou "sem casamento"
//   · custo de emissão = distância ao ponto, direção do GPS × sentido, mão única contra (pesa, não proíbe: prova
//     fecha a rua), caminho de pedestre/serviço (pesa um pouco: prova corre na rua)
//   · custo de transição = |distância pelo grafo − distância entre os pontos do GPS| (continuidade e ordem) + retorno
//     (inverter o sentido custa, menos num balão/rua sem saída). Nível só muda por ligação real do grafo: passar perto
//     em planta de uma ponte não leva para ela.
// Pontos sem rua perto viram "sem casamento"; um ou dois pontos isolados (salto de GPS) são descartados; trechos
// maiores ficam marcados para o método alternativo, emendados só nos próprios pontos do GPS (nada é inventado no grafo).
// Não é usado pelo jogo.

const P = {
  raio: 30, maxCand: 8, sigma: 6, beta: 8, direcao: 3, contramao: 1, pe: 1.5, servico: 0.4,
  saltoM: 25, retorno: 40, semCasamento: 14, semCasamentoComRua: 20, entraSai: 4, saltoMax: 2, bordaGap: 8, desvioMax: 60, desvioRel: 0.6, semConexao: 30, retornoGps: 8, pontaRetornoRad: (35 * Math.PI) / 180,
};

export function casar(grafo, gpsOriginal, opcoes = {}) {
  const o = { ...P, ...opcoes };
  // saltos de GPS (ponto isolado fora da linha entre os vizinhos): saem ANTES do casamento — senão um salto perto de
  // outra via (ex.: um viaduto) puxaria o percurso para ela. Os índices continuam sendo os do GPS original.
  const todos = gpsOriginal.map(([lat, lon]) => grafo.projecao.paraXY(lat, lon)), saltos = new Set(), pontas = new Set();
  const passos = todos.slice(1).map((q, i) => Math.hypot(q.x - todos[i].x, q.y - todos[i].y)).sort((x, y) => x - y);
  const espaco = passos[Math.floor(passos.length / 2)] || 20; // espaçamento mediano do GPS
  for (let i = 1; i < todos.length - 1; i++) {
    const a = todos[i - 1], b = todos[i + 1], p = todos[i], vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
    const fora = Math.hypot(p.x - a.x - t * vx, p.y - a.y - t * vy), corda = Math.sqrt(l2);
    const ida = Math.hypot(p.x - a.x, p.y - a.y), volta = Math.hypot(b.x - p.x, b.y - p.y);
    // retorno de verdade também sai da linha, mas volta perto do ponto de onde veio com pernas parecidas e pequenas
    // ponta de retorno com GPS espaçado (ex.: 42K de Sorocaba, ~77 m) parece um salto pela forma; a diferença é que
    // ela continua o rumo de chegada e o ponto seguinte continua o rumo de volta. Salto sai de lado.
    const rumo = (u, v) => Math.atan2(v.y - u.y, v.x - u.x);
    const dif = (h1, h2) => { let d = Math.abs(h1 - h2); return d > Math.PI ? 2 * Math.PI - d : d; };
    // Também é ponta de retorno quando o ponto está numa rua do mapa, o percurso dá meia-volta nele e a perna de ida
    // ou a de volta corre AO LONGO de uma rua (ex.: retorno logo depois de uma esquina, 42K de Sorocaba na Alameda
    // CIESP, com o GPS a cada ~70 m cortando a esquina na ida). Salto cai longe da rua ou corta quarteirão.
    const aoLongo = (u, v) => [0.25, 0.5, 0.75].every((f) => {
      const x = u.x + (v.x - u.x) * f, y = u.y + (v.y - u.y) * f, L = Math.hypot(v.x - u.x, v.y - u.y) || 1;
      return grafo.proximas(x, y, 12).some((c) => Math.abs((c.dir[0] * (v.x - u.x) + c.dir[1] * (v.y - u.y)) / L) > 0.9);
    });
    // … e no ritmo da corrida: com um ponto só na ponta, ida + volta cabem em ~2 intervalos do GPS (±20% de ritmo);
    // um salto soma bem mais que isso
    const meiaVoltaNaRua = dif(rumo(a, p), rumo(p, b)) > (120 * Math.PI) / 180 && ida + volta <= 2.4 * espaco
      && grafo.proximas(p.x, p.y, 12).length > 0
      && (aoLongo(a, p) || aoLongo(p, b));
    if (meiaVoltaNaRua) pontas.add(i);
    const pontaDeRetorno = meiaVoltaNaRua || (i >= 2 && i < todos.length - 2
      && dif(rumo(todos[i - 2], a), rumo(a, p)) < o.pontaRetornoRad && dif(rumo(p, b), rumo(b, todos[i + 2])) < o.pontaRetornoRad);
    if (fora > o.saltoM && ida + volta > corda * 2.2 && Math.min(ida, volta) > o.saltoM && !pontaDeRetorno) saltos.add(i);
  }
  const indice = gpsOriginal.map((_, i) => i).filter((i) => !saltos.has(i));
  const gps = indice.map((i) => gpsOriginal[i]);
  const pts = gps.map(([lat, lon, alt]) => ({ ...grafo.projecao.paraXY(lat, lon), alt }));
  const n = pts.length;
  // direção do GPS em cada ponto (vizinhos de trás e da frente)
  const rumo = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], l = Math.hypot(b.x - a.x, b.y - a.y);
    return l > 8 ? [(b.x - a.x) / l, (b.y - a.y) / l] : null;
  });
  const reta = (i) => Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  // o próprio GPS dá meia-volta no ponto, em cima de uma rua e com a ida ou a volta ao longo dela (`pontas`, acima):
  // ali um retorno tem evidência e custa pouco (sem isso, com GPS espaçado, passar 2 pontos "sem casamento" saía mais
  // barato que fazer o retorno). Salto de GPS também vira ~180°, mas cai longe da rua ou corta quarteirão.
  const meiaVolta = indice.map((i) => pontas.has(i));

  // ── candidatos e custo de emissão ──
  const estados = pts.map((p, i) => {
    const lista = [];
    for (const c of grafo.proximas(p.x, p.y, o.raio).slice(0, o.maxCand)) for (const sent of [1, -1]) {
      let custo = 0.5 * (c.dist / o.sigma) ** 2;
      if (rumo[i]) custo += o.direcao * (1 - (rumo[i][0] * c.dir[0] + rumo[i][1] * c.dir[1]) * sent) / 2;
      if (!grafo.permite(c.aresta, sent)) custo += o.contramao;
      if (c.aresta.pe) custo += o.pe;
      else if (c.aresta.tipo === 'service') custo += o.servico;
      lista.push({ a: c.aresta, pos: c.pos, sent, dist: c.dist, x: c.x, y: c.y, emissao: custo });
    }
    // sem casamento: barato só quando não há rua perto; com rua perto fica caro (senão o modelo "pularia" retornos)
    lista.push({ gap: true, emissao: lista.length ? o.semCasamentoComRua : o.semCasamento });
    return lista;
  });

  // ── caminhos pelo grafo (Dijkstra limitado, com cache por nó de saída e limite) ──
  const cacheDij = new Map();
  function dijkstra(origem, limite) {
    const k = origem + '|' + Math.ceil(limite / 50);
    if (cacheDij.has(k)) return cacheDij.get(k);
    const dist = new Map([[origem, { d: 0, prev: null, a: null }]]), fila = [[0, origem]], feito = new Set();
    while (fila.length) {
      let m = 0; for (let j = 1; j < fila.length; j++) if (fila[j][0] < fila[m][0]) m = j;
      const [d, u] = fila.splice(m, 1)[0];
      if (feito.has(u)) continue; feito.add(u);
      if (d > limite) break;
      for (const a of grafo.nos.get(u).arestas) {
        const v = a.de === u ? a.para : a.de, nd = d + a.comprimento;
        if (!dist.has(v) || nd < dist.get(v).d) { dist.set(v, { d: nd, prev: u, a }); fila.push([nd, v]); }
      }
    }
    if (cacheDij.size > 20000) cacheDij.clear();
    cacheDij.set(k, dist);
    return dist;
  }
  const beco = (no) => grafo.nos.get(no).arestas.length === 1 || grafo.nos.get(no).info?.retorno;
  // distância de corrida de s até t (s andando no seu sentido, chegando em t no sentido de t) e se houve retorno
  function rede(s, t, limite) {
    const opcoes = [];
    if (s.a === t.a && s.sent === t.sent && (t.pos - s.pos) * s.sent >= -3) opcoes.push({ d: Math.max(0, (t.pos - s.pos) * s.sent), ret: 0, tipo: 'mesma' });
    if (s.a === t.a && s.sent !== t.sent) opcoes.push({ d: Math.abs(t.pos - s.pos), ret: o.retorno, tipo: 'meio' });
    const saida = s.sent > 0 ? s.a.para : s.a.de, ex = s.sent > 0 ? s.a.comprimento - s.pos : s.pos;
    const entrada = t.sent > 0 ? t.a.de : t.a.para, en = t.sent > 0 ? t.pos : t.a.comprimento - t.pos;
    if (ex + en <= limite) {
      const dj = dijkstra(saida, limite - ex - en);
      const r = dj.get(entrada);
      if (r) {
        // retorno no nó: o caminho volta pela mesma aresta logo de cara (ou sai e entra na mesma aresta ao contrário)
        let primeira = null, u = entrada;
        while (u !== saida) { const q = dj.get(u); primeira = q.a; u = q.prev; }
        const volta = primeira ? primeira === s.a : t.a === s.a && t.sent !== s.sent;
        opcoes.push({ d: ex + r.d + en, ret: volta ? (beco(saida) ? 0 : o.retorno) : 0, tipo: 'rede', saida, entrada });
      }
    }
    return opcoes;
  }

  // ── Viterbi ──
  // cada estado lembra o último estado casado do seu melhor caminho: ao sair de um trecho sem casamento, a continuidade
  // (e o custo de retorno) é cobrada desde ele — o "sem casamento" não serve de atalho para pular retorno ou rua.
  const custo = [estados[0].map((e) => e.emissao)], volta = [estados[0].map(() => -1)];
  let ultimo = [estados[0].map((e) => (e.gap ? null : { e, i: 0 }))];
  for (let i = 1; i < n; i++) {
    const dgc = reta(i);
    const ant = estados[i - 1], cAnt = custo[i - 1], ultAnt = ultimo[0];
    const cs = [], vs = [], us = [];
    for (const t of estados[i]) {
      let melhor = Infinity, de = -1;
      ant.forEach((s, j) => {
        if (!Number.isFinite(cAnt[j])) return;
        let tr;
        if (t.gap) tr = s.gap ? 0 : o.entraSai;
        else {
          const ref = s.gap ? ultAnt[j] : { e: s, i: i - 1 };
          if (!ref) tr = o.entraSai;
          else {
            const d = ref.i === i - 1 ? dgc : Math.hypot(pts[i].x - pts[ref.i].x, pts[i].y - pts[ref.i].y);
            tr = Infinity;
            let evidencia = false; for (let q = ref.i; q <= i; q++) evidencia ||= meiaVolta[q];
            for (const op of rede(ref.e, t, Math.max(300, d * 3 + 150))) {
              // (só em rua de mão dupla: em pista de mão única a meia-volta seria na contramão; na avenida de pistas
              // separadas o retorno é pela passagem do canteiro, como o GPS denso do 21K de Sorocaba mostra)
              if (op.ret && evidencia && t.a.mao === 'dupla' && ref.e.a.mao === 'dupla') op.ret = o.retornoGps;
              // caminho pelo grafo muito maior que o do GPS = a ligação que a corrida usou não está no mapa:
              // não inventa desvio (o trecho vira "sem casamento" e vai para o método alternativo)
              if (op.d - d > Math.max(o.desvioMax, o.desvioRel * d)) continue;
              tr = Math.min(tr, Math.abs(op.d - d) / o.beta + op.ret);
            }
            // saindo de um trecho sem casamento sem ligação plausível: retoma com custo fixo (marca o método alternativo)
            if (s.gap) tr = Math.min(tr, o.semConexao) + o.entraSai;
          }
        }
        const v = cAnt[j] + tr;
        if (v < melhor) { melhor = v; de = j; }
      });
      cs.push(melhor + t.emissao); vs.push(de);
      us.push(t.gap ? (de >= 0 ? (ant[de].gap ? ultAnt[de] : { e: ant[de], i: i - 1 }) : null) : { e: t, i });
    }
    custo.push(cs); volta.push(vs); ultimo = [us];
  }
  let k = custo[n - 1].reduce((m, v, j, arr) => (v < arr[m] ? j : m), 0);
  const escolha = new Array(n);
  for (let i = n - 1; i >= 0; i--) { escolha[i] = estados[i][k]; k = volta[i][k]; }

  // ── bordas dos trechos sem casamento: pontos casados longe da rua (> bordaGap m) colados num trecho sem casamento
  // também ficam sem casamento (senão o corredor "entraria" alguns metros numa rua que não percorreu)
  for (let mudou = true; mudou;) {
    mudou = false;
    for (let i = 0; i < n; i++) {
      if (escolha[i].gap || escolha[i].dist <= o.bordaGap) continue;
      if ((i > 0 && escolha[i - 1].gap) || (i < n - 1 && escolha[i + 1].gap)) { escolha[i] = { gap: true }; mudou = true; }
    }
  }
  // ── saltos: até `saltoMax` pontos sem casamento entre dois casados com caminho coerente = descartados ──
  const descartados = new Set();
  for (let i = 0; i < n; i++) {
    if (!escolha[i].gap) continue;
    let j = i; while (j < n && escolha[j].gap) j++;
    if (i > 0 && j < n && j - i <= o.saltoMax) {
      const s = escolha[i - 1], t = escolha[j];
      let dgc = 0; for (let q = i; q <= j; q++) dgc += reta(q);
      const direto = Math.hypot(pts[j].x - pts[i - 1].x, pts[j].y - pts[i - 1].y);
      const ops = rede(s, t, Math.max(300, direto * 3 + 150));
      // só é salto se a ligação pelo grafo for plausível pela mesma regra de desvio do casamento e sem retorno
      // (senão um ponto que caiu numa ligação que falta no mapa viraria um desvio inventado com meia-volta)
      const ok = ops.some((op) => op.ret === 0 && op.d - direto <= Math.max(o.desvioMax, o.desvioRel * direto));
      if (ok) for (let q = i; q < j; q++) descartados.add(q);
    }
    i = j;
  }

  // ── reconstrução: pedaços (aresta, sentido, de, até) na ordem, trechos sem casamento e retornos ──
  const pedacos = [], retornos = [], semCasamento = [];
  const add = (a, sent, de, ate, gpsI) => {
    if (Math.abs(ate - de) < 0.01) return;
    const u = pedacos[pedacos.length - 1];
    if (u && u.a === a && u.sent === sent && Math.abs(u.ate - de) < 0.5) { u.ate = ate; u.gpsAte = gpsI; return; }
    pedacos.push({ a, sent, de, ate, gpsDe: gpsI, gpsAte: gpsI });
  };
  const caminho = (dj, saida, entrada) => {
    const lista = []; let u = entrada;
    while (u !== saida) { const q = dj.get(u); lista.push({ a: q.a, de: q.prev, para: u }); u = q.prev; }
    return lista.reverse();
  };
  let anterior = null, gapIni = null;
  const casados = [];
  for (let i = 0; i < n; i++) {
    const e = escolha[i];
    if (descartados.has(i)) continue;
    if (e.gap) { if (gapIni === null) gapIni = i; continue; }
    if (gapIni !== null) {
      semCasamento.push({ gpsDe: gapIni - 1, gpsAte: i, pontos: i - gapIni });
      pedacos.push({ semCasamento: true, gps: gps.slice(Math.max(0, gapIni - 1), i + 1), gpsDe: gapIni - 1, gpsAte: i });
      gapIni = null; anterior = null;
    }
    casados.push(i);
    if (!anterior) { anterior = e; add(e.a, e.sent, e.pos, e.pos, i); continue; }
    const s = anterior, dgc = Math.hypot(pts[i].x - pts[casados[casados.length - 2]].x, pts[i].y - pts[casados[casados.length - 2]].y);
    const ops = rede(s, e, Math.max(300, dgc * 3 + 150));
    const op = ops.reduce((m, x) => (!m || Math.abs(x.d - dgc) / o.beta + x.ret < Math.abs(m.d - dgc) / o.beta + m.ret ? x : m), null);
    if (!op) { anterior = e; add(e.a, e.sent, e.pos, e.pos, i); continue; }
    if (op.tipo === 'mesma') add(e.a, e.sent, s.pos, e.pos, i);
    else if (op.tipo === 'meio') {
      retornos.push({ tipo: 'meio', aresta: s.a.id, pos: s.pos, gps: i });
      add(e.a, e.sent, s.pos, e.pos, i);
    } else {
      add(s.a, s.sent, s.pos, s.sent > 0 ? s.a.comprimento : 0, i);
      const lim = Math.max(300, dgc * 3 + 150) - (s.sent > 0 ? s.a.comprimento - s.pos : s.pos) - (e.sent > 0 ? e.pos : e.a.comprimento - e.pos);
      const dj = dijkstra(op.saida, lim);
      for (const pz of caminho(dj, op.saida, op.entrada)) {
        const sent = pz.a.de === pz.de ? 1 : -1;
        const ult = pedacos[pedacos.length - 1];
        if (ult && ult.a === pz.a && ult.sent !== sent) retornos.push({ tipo: beco(pz.de) ? 'no-beco' : 'no', aresta: pz.a.id, no: pz.de, gps: i });
        add(pz.a, sent, sent > 0 ? 0 : pz.a.comprimento, sent > 0 ? pz.a.comprimento : 0, i);
      }
      const ult = pedacos[pedacos.length - 1];
      if (ult && ult.a === e.a && ult.sent !== e.sent) retornos.push({ tipo: beco(op.entrada) ? 'no-beco' : 'no', aresta: e.a.id, no: op.entrada, gps: i });
      add(e.a, e.sent, e.sent > 0 ? 0 : e.a.comprimento, e.pos, i);
    }
    anterior = e;
  }
  if (gapIni !== null) {
    semCasamento.push({ gpsDe: gapIni - 1, gpsAte: n - 1, pontos: n - gapIni });
    pedacos.push({ semCasamento: true, gps: gps.slice(Math.max(0, gapIni - 1)), gpsDe: gapIni - 1, gpsAte: n - 1 });
  }
  const orig = (i) => indice[Math.max(0, Math.min(indice.length - 1, i))];
  for (const pz of pedacos) { pz.gpsDe = orig(pz.gpsDe); pz.gpsAte = orig(pz.gpsAte); }
  for (const r of retornos) r.gps = orig(r.gps);
  for (const g of semCasamento) { g.gpsDe = orig(g.gpsDe); g.gpsAte = orig(g.gpsAte); }
  const desc = new Set([...saltos, ...[...descartados].map(orig)]);
  return montarResultado(grafo, pedacos, retornos, semCasamento, { gps: gpsOriginal, pts, escolha, descartados: desc, casados });
}

// geometria e números do percurso casado
function montarResultado(grafo, pedacos, retornos, semCasamento, ctx) {
  const P = grafo.projecao, linha = [], passagens = [];
  let s = 0;
  const empurra = (x, y) => {
    const u = linha[linha.length - 1];
    if (u) { const d = Math.hypot(x - u.x, y - u.y); if (d < 0.05) return; s += d; }
    linha.push({ x, y, s });
  };
  for (const pz of pedacos) {
    if (pz.semCasamento) {
      const ini = s;
      for (const [lat, lon] of pz.gps) { const q = P.paraXY(lat, lon); empurra(q.x, q.y); }
      passagens.push({ semCasamento: true, sDe: ini, sAte: s, gpsDe: pz.gpsDe, gpsAte: pz.gpsAte });
      continue;
    }
    const a = pz.a, ini = s;
    // vértices da aresta entre de e até, no sentido da passagem
    const ini0 = grafo.emAresta(a, pz.de); empurra(ini0.x, ini0.y);
    const vs = a.acum.map((v, k) => [v, k]).filter(([v]) => v > Math.min(pz.de, pz.ate) && v < Math.max(pz.de, pz.ate));
    if (pz.sent < 0) vs.reverse();
    for (const [, k] of vs) empurra(a.pts[k].x, a.pts[k].y);
    const fim = grafo.emAresta(a, pz.ate); empurra(fim.x, fim.y);
    passagens.push({ aresta: a.id, nome: a.nome || null, sent: pz.sent, de: +pz.de.toFixed(1), ate: +pz.ate.toFixed(1), camada: a.camada || 0, ponte: !!a.ponte, tunel: !!a.tunel, sDe: ini, sAte: s, gpsDe: pz.gpsDe, gpsAte: pz.gpsAte });
  }
  // quantas vezes cada aresta foi percorrida (passagens distintas) e com que sentidos
  const porAresta = new Map();
  for (const p of passagens) if (!p.semCasamento) {
    if (!porAresta.has(p.aresta)) porAresta.set(p.aresta, []);
    porAresta.get(p.aresta).push(p.sent);
  }
  const distCasada = ctx.casados.map((i) => ctx.escolha[i].dist);
  distCasada.sort((a, b) => a - b);
  return {
    linha, passagens, retornos, semCasamento,
    passagensPorAresta: Object.fromEntries([...porAresta].map(([k, v]) => [k, v])),
    comprimento: s,
    descartados: [...ctx.descartados],
    confianca: {
      pontos: ctx.gps.length, casados: ctx.casados.length, descartados: ctx.descartados.size,
      semCasamento: semCasamento.reduce((t, g) => t + g.pontos, 0),
      distMediana: distCasada.length ? +distCasada[distCasada.length >> 1].toFixed(1) : null,
      distP95: distCasada.length ? +distCasada[Math.floor(distCasada.length * 0.95)].toFixed(1) : null,
    },
  };
}

// passagens por nome de rua (para os testes e a conferência): conta passagens distintas em arestas com esse nome
export function passagensPorNome(resultado) {
  const c = {};
  for (const p of resultado.passagens) if (!p.semCasamento && p.nome) c[p.nome] = (c[p.nome] || 0) + 1;
  return c;
}

// distância (m) de cada ponto da polilinha `a` até a polilinha `b` (pior caso e média) — compara com a verdade
export function afastamento(a, b) {
  const d = (p) => {
    let m = Infinity;
    for (let i = 0; i < b.length - 1; i++) {
      const q = b[i], r = b[i + 1], vx = r.x - q.x, vy = r.y - q.y, l2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - q.x) * vx + (p.y - q.y) * vy) / l2));
      m = Math.min(m, Math.hypot(p.x - q.x - t * vx, p.y - q.y - t * vy));
    }
    return m;
  };
  const ds = a.map(d);
  return { max: Math.max(...ds), media: ds.reduce((x, y) => x + y, 0) / ds.length };
}
