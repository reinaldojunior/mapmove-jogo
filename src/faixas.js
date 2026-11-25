// Desenho das faixas do percurso (rua, calçada, grama, avenida dupla) em planta, sem Three.js.
// main.js monta as malhas a partir daqui e scripts/checar-sobreposicao.mjs usa as mesmas contas para medir,
// no percurso inteiro, onde uma faixa de um trecho cai em cima da rua de outro trecho.

import { frente, direita, difAngulo as difAng } from './pista.js';
import { MEIA_RUA, LIMITE_CALCADA } from './regras.js';

const LEQUE = (50 * Math.PI) / 180; // virada numa amostra a partir da qual a ponta do retorno vira leque

// posição da pista também antes da largada e depois da chegada (segue reto)
export function posicaoEstendida(pista, s) {
  if (s >= 0 && s <= pista.total) return pista.em(s);
  const ref = s < 0 ? 0 : pista.total;
  const p = pista.em(ref);
  const [fx, fz] = frente(p.ang);
  return { ...p, x: p.x + fx * (s - ref), z: p.z + fz * (s - ref) };
}

// entre as amostras a e b (lat de cada uma e lm = lat no meio do caminho) precisa de amostras a cada 1 m?
const eixoCoberto = (l) => l.ruaD > 0.5 && l.ruaE > 0.5; // a rua do próprio trecho passa pelo eixo
function precisaFinas(a, b, lm) {
  if (a.dup !== b.dup) {
    // fim (ou começo) de um pedaço desenhado que entra num trecho repetido: com a rua inteira a emenda de planoFita
    // liga os dois; com a rua encolhida pela de outro trecho, as amostras finas desenham o que ainda está livre
    const d = a.dup ? b : a;
    return !d.fora && (d.ruaD < MEIA_RUA - 0.01 || d.ruaE < MEIA_RUA - 0.01) && eixoCoberto(d);
  }
  if (a.dup) return false;
  // o corredor sai da rua de outro trecho para a do próprio: só se o eixo no meio do caminho está livre (nenhum
  // outro trecho por cima) mas a reta entre as beiras não o cobre
  if (eixoCoberto(a) === eixoCoberto(b) || !lm || !(lm.ruaD > 0 && lm.ruaE > 0)) return false;
  const media = (k) => (Math.min(MEIA_RUA, a[k]) + Math.min(MEIA_RUA, b[k])) / 2;
  return !(media('ruaD') > 0.5 && media('ruaE') > 0.5);
}

// amostras do desenho a cada 4 m (de 60 m antes da largada até a chegada; +80 m quando não é circuito)
export function amostrasDoPercurso(pista) {
  const real = Number.isFinite(pista.total), a0 = posicaoEstendida(pista, 0), a1 = real ? posicaoEstendida(pista, pista.total) : a0;
  const circuito = real && Math.hypot(a0.x - a1.x, a0.z - a1.z) < 40;
  const fim = real ? pista.total + (circuito ? 0 : 80) : 420;
  const amostras = [];
  for (let s = -60; s <= fim; s += 4) amostras.push({ s, ...posicaoEstendida(pista, s), lat: null });
  if (!pista.lateral) return amostras;
  const medir = (s, x, z, ang) => (s >= 0 && s <= pista.total ? pista.lateral(s, x, z, ang) : pista.lateralEm(x, z, ang, s));
  // mesma direção que planoFita usa para abrir a faixa (corda de ~8 m em volta da amostra)
  const direcao = (s) => {
    const p = posicaoEstendida(pista, Math.max(-60, s - 4)), q = posicaoEstendida(pista, Math.min(fim, s + 4));
    return Math.atan2(q.x - p.x, -(q.z - p.z));
  };
  // antes da largada / depois da chegada a rua segue reta: cede a vez a qualquer trecho do percurso que passe ali
  // (menos nos 30 m logo atrás da largada, onde o pelotão espera: ver PistaReal.lateralEm)
  const bruto = new Map(amostras.map((a) => [a, medir(a.s, a.x, a.z, direcao(a.s))]));
  // entre duas amostras a beira é uma reta, mas a da outra rua pode ser curva (esquina): vale o mais apertado entre a
  // amostra e o meio do caminho até as vizinhas
  const meiosFeitos = new Map();
  const apertar = (lista) => {
    const n = lista.length;
    const meios = lista.slice(0, -1).map((a, i) => {
      const b = lista[i + 1], k = meiosFeitos.get(a);
      if (k && k.b === b) return k.m;
      if (Math.hypot(b.x - a.x, b.z - a.z) < 0.05) return null; // leque: as duas no mesmo ponto
      const m = medir((a.s + b.s) / 2, (a.x + b.x) / 2, (a.z + b.z) / 2, Math.atan2(b.x - a.x, -(b.z - a.z)));
      meiosFeitos.set(a, { b, m });
      return m;
    });
    lista.forEach((a, i) => {
      a.lat = { ...bruto.get(a) };
      // (o meio do caminho até uma amostra fora do percurso — antes da largada — não conta para as de dentro)
      const dentro = (b) => b && (a.lat.fora || (b.s >= 0 && b.s <= pista.total));
      for (const [j, m] of [[i - 1, meios[i - 1]], [i + 1, meios[i]]]) {
        if (j < 0 || j >= n || !m || !dentro(lista[j])) continue;
        // calçada e grama: no máximo o que cabe no meio do caminho
        for (const k of ['limD', 'limE']) a.lat[k] = Math.min(a.lat[k], m[k]);
        // rua: a beira é uma reta entre as duas amostras, que no meio do caminho não pode passar do que cabe ali.
        // Se a vizinha já está dentro, esta encolhe só o necessário (beira que vai estreitando aos poucos, ao lado da
        // rua de outro trecho, não perde largura à toa — sobraria uma tira de grama entre as duas ruas)
        const vb = bruto.get(lista[j]);
        for (const k of ['ruaD', 'ruaE']) {
          const v = Math.min(MEIA_RUA, a.lat[k]), w = Math.min(MEIA_RUA, vb[k]), lim = Math.min(MEIA_RUA, m[k]);
          if ((v + w) / 2 <= lim) continue;
          a.lat[k] = w >= lim ? Math.min(v, lim) : Math.min(v, 2 * lim - w);
        }
      }
    });
    return meios;
  };
  const meios = apertar(amostras);
  // onde o corredor sai da rua de outro trecho para a rua do próprio trecho (canto de dentro de uma esquina, saída de
  // um trecho repetido), a beira da rua encolhida é uma reta entre duas amostras e não acompanha a beira da outra
  // rua: o eixo fica descoberto no meio. Ali as amostras ficam a cada 1 m
  const finas = [];
  for (let i = 0; i < amostras.length; i++) {
    const a = amostras[i], b = amostras[i + 1];
    finas.push(a);
    if (b && precisaFinas(a.lat, b.lat, meios[i])) {
      // calçada e grama continuam limitadas como no desenho a cada 4 m (a beira delas não precisa de mais detalhe)
      const m = meios[i], lim = (l) => { for (const k of ['limD', 'limE']) l[k] = Math.min(l[k], m[k]); return l; };
      lim(bruto.get(a)); lim(bruto.get(b));
      for (let s = a.s + 1; s < b.s - 0.5; s += 1) {
        const c = { s, ...posicaoEstendida(pista, s), lat: null };
        bruto.set(c, lim(medir(s, c.x, c.z, direcao(s))));
        finas.push(c);
      }
    }
  }
  // retorno fechado (o caminho vira mais de ~50° numa amostra): a faixa de largura fixa dobraria sobre si mesma e
  // sobraria só um fiapo de rua na ponta do retorno. Ali a amostra vira um leque: várias amostras no mesmo ponto,
  // girando da direção de chegada para a de saída — o lado de fora fica arredondado e o de dentro fica no eixo
  const comLeque = [];
  finas.forEach((a, i) => {
    const p = finas[viz4(finas, i, -1)], q = finas[viz4(finas, i, 1)];
    const t0 = Math.atan2(a.x - p.x, -(a.z - p.z)), dt = difAng(Math.atan2(q.x - a.x, -(q.z - a.z)), t0);
    if (bruto.get(a).dup || p === a || q === a || Math.hypot(a.x - p.x, a.z - p.z) < 0.3 || Math.hypot(q.x - a.x, q.z - a.z) < 0.3 || Math.abs(dt) < LEQUE) {
      comLeque.push(a);
      return;
    }
    const k = Math.ceil(Math.abs(dt) / (Math.PI / 9));
    for (let j = 0; j <= k; j++) {
      const c = j ? { ...a } : a, ang = t0 + (dt * j) / k;
      c.leque = { ang, lado: Math.sign(dt) };
      if (j) bruto.set(c, { ...bruto.get(a) });
      const l = medir(a.s, a.x, a.z, ang), b = bruto.get(c);
      for (const kk of ['ruaD', 'ruaE', 'limD', 'limE']) b[kk] = Math.min(b[kk], l[kk]);
      comLeque.push(c);
    }
  });
  if (comLeque.length > amostras.length) apertar(comLeque);
  return comLeque;
}

// vizinha a ~4 m de distância no caminho (as amostras são a cada 4 m, ou a cada 1 m onde a rua muda de largura):
// direção e raio da curva medidos sempre na mesma escala
function viz4(amostras, i, sentido) {
  let j = i + sentido;
  while (j > 0 && j < amostras.length - 1 && Math.abs(amostras[j].s - amostras[i].s) < 3.9) j += sentido;
  return Math.max(0, Math.min(amostras.length - 1, j));
}

// afastamento lateral d limitado no ponto a (lat = pista.lateral): a rua encolhe onde a rua de um trecho anterior
// já ocupa o lugar (ruaD/ruaE, podem passar do eixo) e o resto (calçada, grama, avenida) vai da beira da rua até
// no máximo limD/limE — nunca em cima da rua de outro trecho nem dobrando numa curva fechada
export function limitarLateral(lat, d) {
  if (!lat) return d;
  const M = MEIA_RUA;
  if (d >= 0) {
    const beira = Math.min(M, lat.ruaD);
    return d <= M ? Math.min(d, beira) : Math.max(beira, Math.min(d, lat.limD));
  }
  const beira = Math.min(M, lat.ruaE);
  return -d <= M ? -Math.min(-d, beira) : -Math.max(beira, Math.min(-d, lat.limE));
}

// vértices em planta de uma faixa entre os afastamentos d0..d1 (números ou funções da amostra):
// xz[i*4 + 0..1] = borda d0, xz[i*4 + 2..3] = borda d1; u = posição na largura nominal (textura recortada, não
// espremida, onde a faixa encolhe); ativo[i] = 0 quando o pedaço entre a amostra i e a i+1 não é desenhado (trecho
// repetido ou faixa toda coberta por outro trecho: sem "cunha" ligando a faixa a um ponto dentro da outra rua)
export function planoFita(amostras, d0, d1, { semLimite = false } = {}) {
  const n = amostras.length;
  const xz = new Float64Array(n * 4), u = new Float32Array(n * 2), ativo = new Uint8Array(Math.max(0, n - 1)), vazio = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const a = amostras[i];
    const prev = amostras[viz4(amostras, i, -1)], next = amostras[viz4(amostras, i, 1)];
    const ang = a.leque ? a.leque.ang : Math.atan2(next.x - prev.x, -(next.z - prev.z));
    const [rx, rz] = direita(ang);
    const n0 = typeof d0 === 'function' ? d0(a) : d0, n1 = typeof d1 === 'function' ? d1(a) : d1;
    let e0 = n0, e1 = n1;
    if (!semLimite && a.lat) {
      e0 = limitarLateral(a.lat, n0); e1 = limitarLateral(a.lat, n1);
      // retorno em V / esquina fechada: do lado de dentro nada passa do raio da curva (a faixa dobraria sobre si mesma
      // e os triângulos virados somem, deixando buraco)
      // (no leque de um retorno o lado de dentro fica no eixo)
      if (a.leque) {
        if (a.leque.lado > 0) { e0 = Math.min(e0, 0); e1 = Math.min(e1, 0); } else { e0 = Math.max(e0, 0); e1 = Math.max(e1, 0); }
      } else if (prev !== a && next !== a) {
        const l0 = Math.hypot(a.x - prev.x, a.z - prev.z), l1 = Math.hypot(next.x - a.x, next.z - a.z);
        let dt = Math.atan2(next.x - a.x, -(next.z - a.z)) - Math.atan2(a.x - prev.x, -(a.z - prev.z));
        dt = Math.atan2(Math.sin(dt), Math.cos(dt));
        if (Math.abs(dt) > 0.05 && l0 > 1e-6 && l1 > 1e-6) {
          const r = 0.9 * Math.min(l0, l1) / (2 * Math.tan(Math.abs(dt) / 2));
          if (dt > 0) { e0 = Math.min(e0, r); e1 = Math.min(e1, r); } else { e0 = Math.max(e0, -r); e1 = Math.max(e1, -r); }
        }
      }
      if (a.lat.dup || e1 - e0 < 0.02) { vazio[i] = 1; e0 = e1 = (e0 + e1) / 2; }
    }
    const larg = n1 - n0;
    for (let k = 0; k < 2; k++) {
      const d = k ? e1 : e0;
      xz[i * 4 + k * 2] = a.x + rx * d; xz[i * 4 + k * 2 + 1] = a.z + rz * d;
      u[i * 2 + k] = Math.abs(larg) > 1e-6 ? (d - n0) / larg : k;
    }
  }
  // emenda de ponta (chegada que continua na largada, trecho que segue reto em cima de outro): o pedaço entre a
  // última amostra desenhada, com a rua inteira, e a primeira repetida é desenhado com a mesma largura (sem buraco)
  const inteira = (a) => a?.lat && !a.lat.dup && a.lat.ruaD >= MEIA_RUA - 0.01 && a.lat.ruaE >= MEIA_RUA - 0.01;
  for (let i = 0; i < n - 1; i++) {
    ativo[i] = vazio[i] || vazio[i + 1] ? 0 : 1;
    for (const [de, para] of [[i, i + 1], [i + 1, i]]) {
      if (vazio[de] || !amostras[para].lat?.dup || amostras[para].lat.fora || !inteira(amostras[de])) continue;
      const a = amostras[para], pr = amostras[viz4(amostras, para, -1)], nx = amostras[viz4(amostras, para, 1)];
      const [rx, rz] = direita(Math.atan2(nx.x - pr.x, -(nx.z - pr.z)));
      for (let k = 0; k < 2; k++) {
        const d = (xz[de * 4 + k * 2] - amostras[de].x) * rx + (xz[de * 4 + k * 2 + 1] - amostras[de].z) * rz;
        xz[para * 4 + k * 2] = a.x + rx * d; xz[para * 4 + k * 2 + 1] = a.z + rz * d; u[para * 2 + k] = u[de * 2 + k];
      }
      ativo[i] = 1;
    }
  }
  // o que ainda ficou dobrado (retorno muito fechado): encolhe a faixa nas duas amostras até os triângulos
  // ficarem do lado certo (triângulo virado não é desenhado e vira buraco)
  const virado = (p, q, r) => (xz[q] - xz[p]) * (xz[r + 1] - xz[p + 1]) - (xz[q + 1] - xz[p + 1]) * (xz[r] - xz[p]) > 0.02;
  for (let volta = 0; volta < 10; volta++) {
    let algum = false;
    for (let i = 0; i < n - 1; i++) {
      if (!ativo[i]) continue;
      const a = i * 4, b = (i + 1) * 4;
      if (!virado(a, a + 2, b) && !virado(a + 2, b + 2, b)) continue;
      algum = true;
      for (const [j, c] of [[i, a], [i + 1, b]]) for (const k of [0, 2]) {
        xz[c + k] = amostras[j].x + (xz[c + k] - amostras[j].x) * 0.75; xz[c + k + 1] = amostras[j].z + (xz[c + k + 1] - amostras[j].z) * 0.75;
      }
    }
    if (!algum) break;
  }
  return { xz, u, ativo };
}

// faixas de uma avenida de pista dupla (trecho t de pistasDuplas): [f0, f1, tipo, opções] para planoFita/fita.
// tipo: 'ruaFaixas' (pista do corredor com 3 faixas), 'guia', 'canteiro', 'ruaOutra', 'calcadaLisa'
// ocupado: Map compartilhado entre as avenidas de um mesmo desenho; guarda onde já foi desenhada a outra pista de
// cada trecho, para outro trecho do percurso na mesma avenida (ida e volta) não desenhá-la de novo por cima
export function faixasAvenida(t, sub, pista, ocupado = new Map()) {
  const L = t.lado, D = (a) => t.dist[Math.min(t.dist.length - 1, Math.max(0, Math.round((a.s - t.s0) / t.passo)))];
  const C = 10, outra = (a) => { const [rx, rz] = direita(a.ang); return [a.x + rx * L * D(a), a.z + rz * L * D(a)]; };
  const jaTem = (a) => {
    const [x, z] = outra(a), cx = Math.floor(x / C), cz = Math.floor(z / C);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const [ox, oz, os] of ocupado.get((cx + i) + ',' + (cz + j)) || []) {
      if (Math.abs(os - a.s) > 60 && Math.hypot(ox - x, oz - z) < 12) return true;
    }
    return false;
  };
  // ida e volta pela mesma avenida: se a outra pista também é do percurso (outro trecho), ela já está desenhada
  const doPercurso = new Map(sub.map((a) => {
    const [rx, rz] = direita(a.ang), x = a.x + rx * L * D(a), z = a.z + rz * L * D(a);
    const q = pista.projetar(x, z, a.s, 0, 0), perto = pista.pertoDe(x, z, 40);
    return [a, perto.dist < 5 && Math.abs(perto.s - a.s) > 60 && Math.abs(q.d) > 5];
  }));
  // numa curva fechada (ou perto de outro trecho do percurso) a faixa larga "dobra" e cai em cima da rua: não desenha
  const cabe = (a, lat) => { const [rx, rz] = direita(a.ang); return pista.pertoDe(a.x + rx * L * lat, a.z + rz * L * lat, lat + 10).dist > lat - 2.5; };
  // outro trecho do percurso desse lado (ida e volta pela mesma avenida): a grama comum já preenche o meio
  const livre = (a) => { const lim = a.lat ? (L > 0 ? a.lat.limD : a.lat.limE) : 1e6; return lim > D(a) + 6.2; };
  const repetida = new Map(sub.map((a) => [a, jaTem(a)]));
  const okLonge = new Map(sub.map((a) => [a, !doPercurso.get(a) && !repetida.get(a) && livre(a) && cabe(a, D(a) + 7)]));
  const okMeio = new Map(sub.map((a) => [a, !repetida.get(a) && livre(a) && cabe(a, D(a) - 4.5)]));
  for (const a of sub) {
    if (!okMeio.get(a) || a.lat?.dup) continue;
    const [x, z] = outra(a), k = Math.floor(x / C) + ',' + Math.floor(z / C);
    if (!ocupado.has(k)) ocupado.set(k, []);
    ocupado.get(k).push([x, z, a.s]);
  }
  const fora = (a, v) => (okLonge.get(a) ? v : D(a) - 4.2); // largura zero onde não cabe a outra pista
  const M = MEIA_RUA, OUTRA = 4.2;
  const meio = (a, v) => (okMeio.get(a) ? v : M + 0.3);
  const lista = [];
  // faixa entre dois afastamentos (sempre do menor para o maior, dos dois lados)
  const faixa = (f0, f1, tipo, opts) => lista.push([L > 0 ? f0 : (a) => -f1(a), L > 0 ? f1 : (a) => -f0(a), tipo, opts]);
  const k = (v) => () => v;
  // pista do corredor vira mão única de 3 faixas
  lista.push([-M, M, 'ruaFaixas', { inclinacao: true, dy: 0.03 }]);
  // guia, canteiro, guia
  faixa(k(M), k(M + 0.3), 'guia', { vCada: 4, dy: 0.15 });
  faixa(k(M + 0.3), (a) => meio(a, D(a) - OUTRA - 0.3), 'canteiro', { vCada: 4, dy: 0.12 });
  faixa((a) => meio(a, D(a) - OUTRA - 0.3), (a) => meio(a, D(a) - OUTRA), 'guia', { vCada: 4, dy: 0.15 });
  // a outra pista (mão contrária) e a calçada do outro lado
  faixa((a) => meio(a, D(a) - OUTRA), (a) => meio(a, fora(a, D(a) + OUTRA)), 'ruaOutra', { inclinacao: true, dy: 0.1 });
  faixa((a) => fora(a, D(a) + OUTRA), (a) => fora(a, D(a) + OUTRA + 0.3), 'guia', { vCada: 4, dy: 0.15 });
  faixa((a) => fora(a, D(a) + OUTRA + 0.3), (a) => fora(a, D(a) + OUTRA + 2.6), 'calcadaLisa', { vCada: 4, dy: 0.08 });
  return { lista, okMeio, D };
}

// pedaços de uma avenida dupla (trecho t de pistasDuplas) fora de viaduto, com 3 amostras ou mais
export function amostrasAvenida(t, amostras) {
  const subs = [];
  let atual = [];
  for (const a of amostras) {
    if (a.s < t.s0 || a.s > t.s1) continue;
    if (elevado(a)) { if (atual.length) subs.push(atual); atual = []; } else atual.push(a);
  }
  if (atual.length) subs.push(atual);
  return subs.filter((sub) => sub.length >= 3);
}

// faixas comuns do percurso: rua, calçadas e grama da beira (13 m com mapa real, 32 m sem); em cima de viaduto
// não há grama (a calçada vira a beira do viaduto)
export const elevado = (a) => (a.lat?.elev || 0) > 0.3;
export function faixasComuns(comMapa) {
  const G = comMapa ? 13 : 32, L = LIMITE_CALCADA;
  return [
    [-MEIA_RUA, MEIA_RUA, 'rua', { inclinacao: true }],
    [-L, -MEIA_RUA, 'calcada', { vCada: 4, dy: 0.06 }],
    [MEIA_RUA, L, 'calcada', { vCada: 4, dy: 0.06 }],
    [(a) => (elevado(a) ? -L : -G), -L, 'grama', { vCada: 4, dy: -0.04 }],
    [L, (a) => (elevado(a) ? L : G), 'grama', { vCada: 4, dy: -0.04 }]
  ];
}
