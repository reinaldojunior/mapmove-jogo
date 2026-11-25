// Etapa 4a: monta o NOVO desenho das ruas (só dados, o jogo não usa) e mede contra as regras da corrida.
// Uso: node scripts/percurso/exportar-ruas.mjs [slug …] [--atual pasta]
//   grava dados/ruas/<slug>/<rótulo>.json (medidas, ruas alargadas, remendos, cones); com --atual, os triângulos
//   do desenho novo e do atual vão para a pasta dada (dezenas de MB, fora do repositório)
//   --atual pasta: grava também os triângulos do desenho ATUAL (o de produção, montado com src/faixas.js como no
//   jogo) para as imagens de comparação (scripts/percurso/desenhar-ruas.py). Só leitura de src/.
//
// Regras medidas (o desenho nunca muda a corrida; a pista é a da etapa 3, igualzinha):
//   • faixa do corredor ±MEIA_RUA (4 m) do eixo sempre em cima de asfalto da mesma camada;
//   • faixa de calçada até LIMITE_CALCADA (7,6 m, onde vem a penalidade) sempre em cima de asfalto ou calçada;
//   • onde a rua real é mais estreita, o asfalto/calçada é ALARGADO só ali (D1) e o ponto fica listado.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PistaReal, direita } from '../../src/pista.js';
import { refinarDistancias } from '../../src/refino.js';
import { JANELA } from '../../src/percursoAjustado.js';
import { METADE } from './exportar-jogo.mjs';
import { MEIA_RUA, LIMITE_CALCADA } from '../../src/regras.js';
import { prepararOSM, viadutosDoPercurso, pistasDuplas } from '../../src/osm.js';
import { amostrasDoPercurso, planoFita, faixasComuns, faixasAvenida, amostrasAvenida } from '../../src/faixas.js';
import { montarRede, cruzamentos, trecho, comprimento, densificar, faixaTriangulos, poligonoTriangulos, CALCADA_M, SUMIR_M } from './ruas-geometria.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ler = (p) => JSON.parse(fs.readFileSync(path.join(RAIZ, p)));
const PROVAS = { '9-maratona-sorocaba-novembro-azul-2026-11-21': 0, '1-meia-maratona-de-indaiatuba-2026-12-13': 1.6 };
const ASFALTO = new Set(['asfalto', 'cruzamento', 'fita', 'alargamento']);
const PISAVEL = new Set([...ASFALTO, 'calcada', 'fitaCalcada', 'alargamentoCalcada']);

// ─── pista como no jogo ──────────────────────────────────────────────────────
function pistaComViaduto(percurso, exagero, janela, osmJ) {
  const p = new PistaReal(percurso, { exagero, janela });
  const osm = prepararOSM(osmJ, p.paraLocal);
  const v = viadutosDoPercurso(osm, p);
  if (v.length) p.elevar(v, { altura: 7 });
  return { p, osm, viadutos: v };
}

// índice espacial simples (células de 10 m)
function indice(C = 10) {
  const m = new Map(), k = (ix, iz) => ix * 100003 + iz;
  return {
    pôr(x0, z0, x1, z1, v) { for (let ix = Math.floor(x0 / C); ix <= Math.floor(x1 / C); ix++) for (let iz = Math.floor(z0 / C); iz <= Math.floor(z1 / C); iz++) { const q = k(ix, iz); if (!m.has(q)) m.set(q, []); m.get(q).push(v); } },
    perto(x, z, r = 0) { const out = new Set(); for (let ix = Math.floor((x - r) / C); ix <= Math.floor((x + r) / C); ix++) for (let iz = Math.floor((z - r) / C); iz <= Math.floor((z + r) / C); iz++) for (const v of m.get(k(ix, iz)) || []) out.add(v); return out; },
  };
}
// altura no ponto (x, z) dentro do triângulo (baricêntrica)
const alturaNoTri = (x, z, t) => {
  const [[ax, az], [bx, bz], [cx, cz]] = t.t, den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(den) < 1e-9) return (t.y[0] + t.y[1] + t.y[2]) / 3;
  const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den;
  return l1 * t.y[0] + l2 * t.y[1] + (1 - l1 - l2) * t.y[2];
};
const dentroTri = (x, z, t) => {
  const [[ax, az], [bx, bz], [cx, cz]] = t;
  const d1 = (bx - ax) * (z - az) - (bz - az) * (x - ax), d2 = (cx - bx) * (z - bz) - (cz - bz) * (x - bx), d3 = (ax - cx) * (z - cz) - (az - cz) * (x - cx);
  return (d1 >= -1e-9 && d2 >= -1e-9 && d3 >= -1e-9) || (d1 <= 1e-9 && d2 <= 1e-9 && d3 <= 1e-9);
};

export function desenharDistancia(slug, rot, { atual = false } = {}) {
  const exagero = PROVAS[slug];
  const grafo = ler(`dados/grafos/${slug}.json`), casado = ler(`dados/casados/${slug}.json`).distancias[rot];
  const ajust = ler(`public/percursos/${slug}.json`).distancias[rot], osmJ = ler(`public/osm/${slug}.json`);
  const { p: pista, viadutos } = pistaComViaduto(ajust.percurso, exagero, JANELA, osmJ);
  const conv = pista.paraLocal;
  // eixo amostrado a cada 2 m, com a altura do desenho e se está no viaduto
  const eixo = [], ix = indice(10);
  for (let s = 0; s <= pista.total; s += 2) { const q = pista.em(s); const a = { s, k: eixo.length, x: q.x, z: q.z, y: q.y, ang: q.ang, alto: (pista.elevacao?.(s) || 0) > 0.3 }; eixo.push(a); ix.pôr(q.x, q.z, q.x, q.z, a); }
  // faixas: [[s0, s1], …] da pista que passam por esta rua (só essas passagens dão a altura; sem isso um cruzamento
  // perto de OUTRA passagem pegaria a altura dela)
  const alturaEm = (x, z, camada, faixas = null, raio = 40) => {
    // ponto mais perto no eixo (interpolado entre as amostras de 2 m), só nas passagens desta rua e na mesma camada
    let melhor = null, melhorQ = null;
    for (const a of ix.perto(x, z, raio)) {
      if (faixas && !faixas.some(([s0, s1]) => a.s >= s0 && a.s <= s1)) continue;
      for (const b of [eixo[a.k - 1], eixo[a.k + 1]]) {
        if (!b) continue;
        const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
        const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t), y = a.y + (b.y - a.y) * t;
        if (a.alto === camada >= 1 && (!melhor || d < melhor.d)) melhor = { d, y };
        if (!melhorQ || d < melhorQ.d) melhorQ = { d, y };
      }
    }
    const r = (melhor && melhor.d < raio ? melhor : melhorQ)?.y;
    if (r !== undefined) return r;
    if (faixas) return alturaEm(x, z, camada, null, raio);
    return raio < 400 ? alturaEm(x, z, camada, null, raio * 3) : 0; // rua que segue além de onde a prova sai dela
  };


  // ─── rede e cruzamentos ───────────────────────────────────────────────────
  const rota = new Set(casado.passagens.filter((q) => !q.semCasamento).map((q) => q.aresta));
  // D1: rua do percurso mais estreita que a faixa do corredor é desenhada com a largura mínima (a real fica anotada).
  // Faixa: ±MEIA_RUA do eixo com 0,25 m de folga; onde a rua é percorrida nos dois sentidos o eixo fica 2 m à direita
  // (etapa 3), então a rua precisa de ±(MEIA_RUA + 2). Calçada até LIMITE_CALCADA (+0,2 m) do eixo.
  const sentidos = new Map(); for (const q of casado.passagens) if (!q.semCasamento) { if (!sentidos.has(q.aresta)) sentidos.set(q.aresta, new Set()); sentidos.get(q.aresta).add(q.sent); }
  const minimo = (a) => {
    const off = sentidos.get(a.id)?.size === 2 ? METADE : 0;
    return { w: 2 * (MEIA_RUA + 0.25 + off), calcada: (w) => Math.max(CALCADA_M, LIMITE_CALCADA + 0.2 + off - w / 2) };
  };
  const rede = montarRede(grafo, (la, lo) => conv(la, lo), rota, minimo);
  // ponte do OSM onde o jogo NÃO eleva o percurso (pontes baixas sobre córrego): é chão para o desenho (camada 0);
  // só vale camada 1 onde a pista tem viaduto (pista.elevar), como no jogo
  for (const r of rede.ramos) if (r.camada >= 1) {
    const alto = r.pts.some(([x, z]) => { let m = null; for (const a of ix.perto(x, z, 20)) { const d = Math.hypot(a.x - x, a.z - z); if (!m || d < m.d) m = { d, a }; } return m?.a.alto; });
    r.camadaOsm = r.camada; if (!alto) r.camada = 0;
  }
  const { polis, recorte } = cruzamentos(rede);
  const fatorS = pista.total / (ajust.kmGeometrico * 1000);
  const porAresta = new Map(); for (const q of casado.passagens) if (!q.semCasamento) { if (!porAresta.has(q.aresta)) porAresta.set(q.aresta, []); porAresta.get(q.aresta).push([q.sDe * 1000 * fatorS - 30, q.sAte * 1000 * fatorS + 30]); }
  const faixasPorNo = new Map();
  for (const r of rede.ramos) {
    r.faixas = r.rota ? r.arestas.flatMap((id) => porAresta.get(id) || []) : null;
    if (r.faixas) for (const n of r.nos) { if (!faixasPorNo.has(n)) faixasPorNo.set(n, []); faixasPorNo.get(n).push(...r.faixas); }
  }
  const tris = []; // {t:[[x,z]×3], y:[3], tipo, camada, a (alfa)}
  const add = (lista, tipo, camada, yDe, alfaDe = () => 1) => { for (const t of lista) tris.push({ t, tipo, camada, y: t.map(([x, z]) => yDe(x, z)), a: t.map(([x, z]) => alfaDe(x, z)) }); };
  const yRamo = (r) => (x, z) => alturaEm(x, z, r.camada, r.faixas || faixasPorNo.get(r.nos[0]) || null);
  rede.ramos.forEach((r, i) => {
    const L = comprimento(r.pts), [c0, c1] = recorte[i];
    if (L - c0 - c1 < 0.3) return; // ramo engolido pelos cruzamentos
    const pts = densificar(trecho(r.pts, c0, L - c1), 4);
    // toco: some nos últimos SUMIR_M m (alfa 1 → 0); altura constante do ponto onde encosta no percurso
    const y0 = alturaEm(...r.pts[0], r.camada, faixasPorNo.get(r.nos[0]) || null);
    const yDe = r.toco ? () => y0 : yRamo(r);
    const alfa = r.toco ? (x, z) => { const d = Math.hypot(x - r.pts[0][0], z - r.pts[0][1]); return Math.max(0, Math.min(1, (comprimento(r.pts) - d) / SUMIR_M)); } : () => 1;
    add(faixaTriangulos(pts, -r.w / 2, r.w / 2), 'asfalto', r.camada, yDe, alfa);
    const calc = r.calc ?? (r.ponte ? 1.5 : CALCADA_M);
    add(faixaTriangulos(pts, -r.w / 2 - calc, -r.w / 2), 'calcada', r.camada, yDe, alfa);
    add(faixaTriangulos(pts, r.w / 2, r.w / 2 + calc), 'calcada', r.camada, yDe, alfa);
    r.trecho = pts;
  });
  for (const c of polis) {
    const fx = faixasPorNo.get(c.no) || null, y = alturaEm(...c.centro, c.camada, fx);
    add(poligonoTriangulos(c.pol), 'cruzamento', c.camada, (x, z) => alturaEm(x, z, c.camada, fx));
    for (const curva of c.cantos) {
      const fora = curva.map(([x, z]) => { const dx = x - c.centro[0], dz = z - c.centro[1], l = Math.hypot(dx, dz) || 1; return [x + (dx / l) * CALCADA_M, z + (dz / l) * CALCADA_M]; });
      for (let k = 0; k < curva.length - 1; k++) add([[curva[k], fora[k], curva[k + 1]], [fora[k], fora[k + 1], curva[k + 1]]], 'calcada', c.camada, () => y);
    }
  }

  // ─── trechos de fallback (ligação que falta no OSM): fita do sistema atual, só ali ───────────────────────────
  const fator = pista.total / (ajust.kmGeometrico * 1000);
  const fallback = (ajust.fallbackKm || []).map(([a, b]) => [a * 1000 * fator - 15, b * 1000 * fator + 15]);
  const faixaEixo = (s0, s1, d0, d1, tipo) => {
    const pts = []; for (let s = Math.max(0, s0); s <= Math.min(pista.total, s1); s += 2) { const q = pista.em(s); pts.push({ s, x: q.x, z: q.z, y: q.y, ang: q.ang }); }
    for (let k = 0; k < pts.length - 1; k++) {
      const A = pts[k], B = pts[k + 1], [ra, rza] = direita(A.ang), [rb, rzb] = direita(B.ang);
      const v = (P, rx, rz, d) => [P.x + rx * d, P.z + rz * d];
      const camada = (pista.elevacao?.(A.s) || 0) > 0.3 ? 1 : 0;
      const q = [v(A, ra, rza, d0), v(A, ra, rza, d1), v(B, rb, rzb, d0), v(B, rb, rzb, d1)];
      tris.push({ t: [q[0], q[1], q[2]], tipo, camada, y: [A.y, A.y, B.y], a: [1, 1, 1] }, { t: [q[1], q[3], q[2]], tipo, camada, y: [A.y, B.y, B.y], a: [1, 1, 1] });
    }
  };
  for (const [a, b] of fallback) { faixaEixo(a, b, -MEIA_RUA, MEIA_RUA, 'fita'); faixaEixo(a, b, -LIMITE_CALCADA, -MEIA_RUA, 'fitaCalcada'); faixaEixo(a, b, MEIA_RUA, LIMITE_CALCADA, 'fitaCalcada'); }

  // ─── cobertura da faixa do corredor e da calçada; alargamento só onde falta ───────────────────────────────
  const medir = () => {
    const it = indice(8);
    tris.forEach((t, k) => { const xs = t.t.map((q) => q[0]), zs = t.t.map((q) => q[1]); it.pôr(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), k); });
    const coberto = (x, z, y, tipos) => { for (const k of it.perto(x, z)) { const t = tris[k]; if (!tipos.has(t.tipo) || !dentroTri(x, z, t.t)) continue; if (Math.abs(alturaNoTri(x, z, t) - y) < 1.5) return true; } return false; };
    const falta = []; // {s, lado, tipo: 'asfalto'|'calcada', d}
    let pontos = 0, faltaAsf = 0, faltaCal = 0;
    for (let s = 0; s <= pista.total; s += 1) {
      const q = pista.em(s), [rx, rz] = direita(q.ang);
      for (let d = -LIMITE_CALCADA; d <= LIMITE_CALCADA + 1e-9; d += 0.5) {
        const x = q.x + rx * d, z = q.z + rz * d, naRua = Math.abs(d) <= MEIA_RUA;
        pontos++;
        if (!coberto(x, z, q.y, naRua ? ASFALTO : PISAVEL)) { falta.push({ s, lado: Math.sign(d) || 1, tipo: naRua ? 'asfalto' : 'calcada', d }); naRua ? faltaAsf++ : faltaCal++; }
      }
    }
    return { pontos, faltaAsf, faltaCal, falta };
  };
  const antes = medir();
  // agrupa o que falta em trechos (por lado e tipo), com 5 m de folga, e alarga; repete até não faltar nada (bordas)
  const alargamentos = [];
  const alargar = (falta, passada) => {
    for (const tipo of ['asfalto', 'calcada']) for (const lado of [-1, 1]) {
      const ss = [...new Set(falta.filter((f) => f.tipo === tipo && f.lado === lado).map((f) => f.s))].sort((x, y) => x - y);
      let ini = null, ant = null;
      const fecha = () => {
        if (ini === null) return;
        const s0 = Math.max(0, ini - 5), s1 = Math.min(pista.total, ant + 5);
        const fs_ = falta.filter((f) => f.tipo === tipo && f.lado === lado && f.s >= ini && f.s <= ant);
        alargamentos.push({ tipo, lado, s0, s1, faltaAPartirDeM: +Math.min(...fs_.map((f) => Math.abs(f.d))).toFixed(1), passada });
        const m = passada; // cada passada alarga um pouco mais para fora (borda exata dos triângulos)
        if (tipo === 'asfalto') faixaEixo(s0, s1, lado < 0 ? -MEIA_RUA - 0.25 * m : 0, lado < 0 ? 0 : MEIA_RUA + 0.25 * m, 'alargamento');
        else faixaEixo(s0, s1, lado < 0 ? -LIMITE_CALCADA - 0.2 * m : MEIA_RUA - 0.1, lado < 0 ? -MEIA_RUA + 0.1 : LIMITE_CALCADA + 0.2 * m, 'alargamentoCalcada');
        // curva fechada: a tira ao longo do eixo dobra por dentro e deixa buraco; ali vão discos a cada 2 m
        for (let s = s0; s <= s1; s += 2) {
          let v = Math.abs(pista.em(Math.min(pista.total, s + 3)).ang - pista.em(Math.max(0, s - 3)).ang); if (v > Math.PI) v = 2 * Math.PI - v;
          if (v < (20 * Math.PI) / 180) continue;
          const q = pista.em(s), R = tipo === 'asfalto' ? MEIA_RUA + 0.3 * m : LIMITE_CALCADA + 0.25 * m, camada = (pista.elevacao?.(s) || 0) > 0.3 ? 1 : 0;
          const anel = Array.from({ length: 14 }, (_, k) => [q.x + R * Math.cos((k * 2 * Math.PI) / 14), q.z + R * Math.sin((k * 2 * Math.PI) / 14)]);
          for (let k = 0; k < 14; k++) tris.push({ t: [[q.x, q.z], anel[k], anel[(k + 1) % 14]], tipo: tipo === 'asfalto' ? 'alargamento' : 'alargamentoCalcada', camada, y: [q.y, q.y, q.y], a: [1, 1, 1] });
        }
        ini = null;
      };
      for (const s of ss) { if (ini !== null && s - ant > 8) fecha(); if (ini === null) ini = s; ant = s; }
      fecha();
    }
  };
  alargar(antes.falta, 1);
  for (let passada = 2, m = medir(); m.falta.length && passada <= 4; passada++, m = medir()) alargar(m.falta, passada);
  const depois = medir();
  // por que alargou: rua/nome mais perto do eixo e motivo
  const rotulo = (s) => {
    const q = pista.em(s); let m = null;
    rede.ramos.forEach((r) => { if (!r.trecho || !r.rota) return; for (const [x, z] of r.trecho) { const d = Math.hypot(x - q.x, z - q.z); if (!m || d < m.d) m = { d, r }; } });
    return m?.r;
  };
  for (const a of alargamentos) {
    const sm = (a.s0 + a.s1) / 2, r = rotulo(sm);
    const noFallback = fallback.some(([f0, f1]) => sm > f0 - 30 && sm < f1 + 30);
    a.km = [+(a.s0 / 1000).toFixed(3), +(a.s1 / 1000).toFixed(3)]; a.m = Math.round(a.s1 - a.s0);
    a.rua = r?.nome || (r ? `(${r.tipo} sem nome)` : null); a.larguraRealM = r ? +r.w.toFixed(1) : null; a.fonteLargura = r?.fonte || null;
    a.motivo = noFallback ? 'emenda com o fallback' : a.tipo === 'calcada' ? 'calçada real mais estreita que a faixa até a penalidade (7,6 m)'
      : r && r.w / 2 < MEIA_RUA - 0.01 ? `rua de ${r.w.toFixed(1)} m (${r.fonte}) mais estreita que ±4 m` : 'eixo fora do centro da rua (retorno em metade da rua, esquina, desvio OSM)';
  }

  // ─── pintura, linha azul, faixa de pedestre, cones ────────────────────────
  const tiras = (pts, d, larg, tipo, camada, yDe, traco = 0, vao = 0) => {
    if (traco) { const L = comprimento(pts); for (let s = 1; s < L - 1; s += traco + vao) add(faixaTriangulos(trecho(pts, s, Math.min(L - 1, s + traco)), d - larg / 2, d + larg / 2), tipo, camada, yDe); }
    else add(faixaTriangulos(pts, d - larg / 2, d + larg / 2), tipo, camada, yDe);
  };
  for (const r of rede.ramos) {
    if (!r.trecho || r.toco) continue;
    const yDe = yRamo(r), h = r.w / 2;
    tiras(r.trecho, -h + 0.3, 0.12, 'pintura', r.camada, yDe); tiras(r.trecho, h - 0.3, 0.12, 'pintura', r.camada, yDe);
    const nFx = r.faixas || Math.max(1, Math.round(r.w / 3.3));
    if (r.mao === 'dupla') {
      tiras(r.trecho, 0, 0.12, 'pinturaAmarela', r.camada, yDe);
      for (let k = 1; k < nFx / 2; k++) for (const sg of [-1, 1]) tiras(r.trecho, sg * (k * r.w) / nFx, 0.12, 'pintura', r.camada, yDe, 3, 6);
    } else for (let k = 1; k < nFx; k++) tiras(r.trecho, -h + (k * r.w) / nFx, 0.12, 'pintura', r.camada, yDe, 3, 6);
  }
  // faixa de pedestre: ponta de rua do percurso num nó com travessia ou semáforo no OSM
  rede.ramos.forEach((r, i) => {
    if (!r.trecho || !r.rota) return;
    for (const lado of [0, 1]) {
      const info = rede.info[r.nos[lado]];
      if (!info || !(info.travessia || info.semaforo)) continue;
      const pts = lado === 0 ? r.trecho : r.trecho.slice().reverse(), seg = trecho(pts, 0.8, 3.8);
      if (comprimento(seg) < 2.5) continue;
      for (let d = -r.w / 2 + 0.5; d < r.w / 2 - 0.4; d += 1) tiras(seg, d + 0.25, 0.5, 'pintura', r.camada, yRamo(r));
    }
  });
  // linha azul da prova: no eixo do corredor
  for (let s = 0; s < pista.total; s += 2) { const A = pista.em(s), B = pista.em(Math.min(pista.total, s + 2)); add(faixaTriangulos([[A.x, A.z], [B.x, B.z]], -0.08, 0.08), 'azul', (pista.elevacao?.(s) || 0) > 0.3 ? 1 : 0, () => A.y + 0.01); }
  // cones nos retornos (meia-volta do eixo): no meio entre ida e volta, nos últimos 20 m antes da ponta
  const cones = [];
  for (let s = 20; s < pista.total - 20; s += 5) {
    const a = pista.em(s - 20).ang, b = pista.em(s + 20).ang;
    let d = Math.abs(a - b); if (d > Math.PI) d = 2 * Math.PI - d;
    if (d > (150 * Math.PI) / 180 && !(cones.length && s - cones[cones.length - 1].s < 80)) {
      let tip = s, mx = 0; for (let t = s - 20; t <= s + 20; t += 1) { const q = Math.abs(((pista.em(t + 3).ang - pista.em(t - 3).ang + 3 * Math.PI) % (2 * Math.PI)) - Math.PI); if (q > mx) { mx = q; tip = t; } }
      const pts = []; for (let k = 0; k <= 20; k += 4) { const P = pista.em(tip - k), Q = pista.em(tip + k); pts.push([(P.x + Q.x) / 2, (P.z + Q.z) / 2]); }
      cones.push({ s, km: +(tip / 1000).toFixed(2), pts });
    }
  }

  // ─── altura: degraus entre peças, ponte e vão livre ───────────────────────
  // ruas que passam por baixo de um trecho do percurso no viaduto: vão livre medido no centro dos triângulos
  const it2 = indice(8); tris.forEach((t, k) => { if (t.tipo === 'asfalto' || t.tipo === 'cruzamento') { const xs = t.t.map((q) => q[0]), zs = t.t.map((q) => q[1]); it2.pôr(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), k); } });
  let vaoMin = Infinity;
  for (const t of tris) {
    if (t.camada < 1 || t.tipo !== 'asfalto') continue;
    const cx = (t.t[0][0] + t.t[1][0] + t.t[2][0]) / 3, cz = (t.t[0][1] + t.t[1][1] + t.t[2][1]) / 3, yc = (t.y[0] + t.y[1] + t.y[2]) / 3;
    for (const k of it2.perto(cx, cz)) { const u = tris[k]; if (u.camada >= 1) continue; const yu = (u.y[0] + u.y[1] + u.y[2]) / 3; if (dentroTri(cx, cz, u.t) && yc - yu > 0.5) vaoMin = Math.min(vaoMin, yc - yu); }
  }
  // ponte do OSM × trecho elevado da pista (o viaduto do jogo vem de viadutosDoPercurso)
  const pontesRota = rede.ramos.filter((r) => r.rota && (r.camadaOsm ?? r.camada) >= 1).map((r) => ({ nome: r.nome, m: Math.round(comprimento(r.pts)), noTrechoElevado: r.pts.filter(([x, z]) => { let m = null; for (const a of ix.perto(x, z, 20)) { const d = Math.hypot(a.x - x, a.z - z); if (!m || d < m.d) m = { d, a }; } return m?.a.alto; }).length / r.pts.length }));
  // degrau: dentro de cada triângulo de asfalto/calçada, inclinação entre dois vértices acima de 25% (o jogo limita a
  // rampa do percurso a 12%) com mais de 0,3 m de diferença
  const degraus = [];
  for (const tr of tris) {
    if (/^(pintura|azul)/.test(tr.tipo)) continue;
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
      const dxz = Math.hypot(tr.t[i][0] - tr.t[j][0], tr.t[i][1] - tr.t[j][1]), dy = Math.abs(tr.y[i] - tr.y[j]);
      if (dy > 0.3 && dy / (dxz || 1e-3) > 0.25) { degraus.push({ x: tr.t[i][0], z: tr.t[i][1], dy, tipo: tr.tipo }); if (process.env.DEGRAU) console.log('degrau', tr.tipo, tr.t.map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' | '), tr.y.map((v) => v.toFixed(2)).join(' ')); }
    }
  }
  const kmPerto = (x, z) => { let m = null; for (const a of ix.perto(x, z, 60)) { const d = Math.hypot(a.x - x, a.z - z); if (!m || d < m.d) m = { d, s: a.s }; } return m ? +(m.s / 1000).toFixed(2) : null; };
  const degrauLocais = [...new Set(degraus.map((d) => kmPerto(d.x, d.z)))].filter((v) => v !== null).sort((a, b) => a - b);
  const degrau = degraus.reduce((m, d) => Math.max(m, d.dy), 0);

  // ─── desempenho: triângulos do desenho novo × atual ───────────────────────
  const contagem = {}; for (const t of tris) contagem[t.tipo] = (contagem[t.tipo] || 0) + 1;
  let atualTris = null, atualDados = null;
  {
    const prod = refinarDistancias(ler(`dados/percursos/${slug}.json`).distancias.map((d) => ({ rotulo: d.rotulo, km: d.kmOficial, percurso: d.percurso }))).find((d) => d.rotulo === rot);
    const { p: velha, osm } = pistaComViaduto(prod.percurso, exagero, null, osmJ);
    const am = amostrasDoPercurso(velha);
    const faixas = faixasComuns(true).map(([d0, d1, tipo]) => ({ tipo, amostras: am, plano: planoFita(am, d0, d1) }));
    const ocupado = new Map();
    for (const t of pistasDuplas(osm, velha)) for (const subA of amostrasAvenida(t, am)) for (const [f0, f1, tipo] of faixasAvenida(t, subA, velha, ocupado).lista) faixas.push({ tipo, amostras: subA, plano: planoFita(subA, f0, f1) });
    // origem da pista velha no sistema da nova (as duas usam conversorLocal a partir do 1º ponto)
    const o = conv(prod.percurso[0][0], prod.percurso[0][1]);
    atualTris = 0; const porTipo = {};
    for (const f of faixas) {
      const { xz, ativo } = f.plano, lista = (porTipo[f.tipo] ||= []);
      for (let i = 0; i < f.amostras.length - 1; i++) {
        if (!ativo[i]) continue;
        const a = i * 4, b = (i + 1) * 4, v = [[xz[a], xz[a + 1]], [xz[a + 2], xz[a + 3]], [xz[b], xz[b + 1]], [xz[b + 2], xz[b + 3]]].map(([x, z]) => [x + o.x, z + o.z]);
        atualTris += 2;
        if (atual) lista.push(v[0], v[1], v[2], v[1], v[3], v[2]);
      }
    }
    if (atual) atualDados = { porTipo, eixo: Array.from({ length: Math.floor(velha.total / 2) }, (_, k) => { const q = velha.em(k * 2); return [+(q.x + o.x).toFixed(2), +(q.z + o.z).toFixed(2)]; }) };
  }

  const resumo = {
    distanciaPistaKm: +(pista.total / 1000).toFixed(3),
    cobertura: {
      antes: { faltaAsfaltoPontos: antes.faltaAsf, faltaCalcadaPontos: antes.faltaCal, pontos: antes.pontos },
      depois: { faltaAsfaltoPontos: depois.faltaAsf, faltaCalcadaPontos: depois.faltaCal, pontos: depois.pontos },
    },
    alargamentos: alargamentos.length, alargadoAsfaltoM: alargamentos.filter((a) => a.tipo === 'asfalto').reduce((t, a) => t + a.m, 0),
    alargadoCalcadaM: alargamentos.filter((a) => a.tipo === 'calcada').reduce((t, a) => t + a.m, 0),
    ruasDoPercurso: rede.ramos.filter((r) => r.rota).length, ruasQueCruzam: rede.ramos.filter((r) => !r.rota).length, cruzamentos: polis.length,
    ruasAlargadas: Object.values(rede.ramos.filter((r) => r.rota && r.w > r.wReal + 0.05).reduce((m, r) => { const k = `${r.nome || '(' + r.tipo + ' sem nome)'}|${r.wReal}|${r.w}`; (m[k] ||= { rua: r.nome || `(${r.tipo} sem nome)`, larguraRealM: +r.wReal.toFixed(1), fonte: r.fonte, desenhadaM: +r.w.toFixed(1), m: 0 }).m += Math.round(comprimento(r.pts)); return m; }, {})).sort((a, b) => b.m - a.m),
    ruasNaLarguraReal: Math.round(rede.ramos.filter((r) => r.rota && r.w <= r.wReal + 0.05).reduce((t, r) => t + comprimento(r.pts), 0)),
    ruasAlargadasM: Math.round(rede.ramos.filter((r) => r.rota && r.w > r.wReal + 0.05).reduce((t, r) => t + comprimento(r.pts), 0)),
    largura: Object.entries(rede.ramos.filter((r) => r.rota).reduce((m, r) => { m[r.fonte] = (m[r.fonte] || 0) + Math.round(comprimento(r.pts)); return m; }, {})).map(([f, m]) => ({ fonte: f, m })),
    fallbackS: fallback.map(([a, b]) => [Math.round(a), Math.round(b)]), cones: cones.map((c) => c.km), viadutosDoJogo: viadutos.map((v) => [Math.round(v.s0), Math.round(v.s1)]),
    pontesOsmNoPercurso: pontesRota, vaoLivreMinM: Number.isFinite(vaoMin) ? +vaoMin.toFixed(2) : null, degrauMaxM: +degrau.toFixed(2), degraus: degraus.length, degrauKm: degrauLocais,
    // pintura e linha azul vão como textura do asfalto no jogo (como hoje): contadas à parte
    triangulos: { novoMalha: tris.filter((t) => !/^(pintura|azul)/.test(t.tipo)).length, novoPintura: tris.filter((t) => /^(pintura|azul)/.test(t.tipo)).length, novoPorTipo: contagem, atualFaixas: atualTris },
    restantes: depois.falta.map((f) => ({ km: +(f.s / 1000).toFixed(3), d: f.d, tipo: f.tipo })),
  };
  return { resumo, alargamentos, tris, cones, eixo, atualDados, rede: rede.ramos.map((r) => ({ nome: r.nome, rota: r.rota, w: r.w, pts: r.pts.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]) })), grafo, conv };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), i = args.indexOf('--atual'), pastaAtual = i >= 0 ? args.splice(i, 2)[1] : null;
  const slugs = args.length ? args : Object.keys(PROVAS);
  for (const slug of slugs) {
    for (const rot of Object.keys(ler(`public/percursos/${slug}.json`).distancias)) {
      const t0 = Date.now();
      const r = desenharDistancia(slug, rot, { atual: !!pastaAtual });
      const sai = path.join(RAIZ, 'dados/ruas', slug); fs.mkdirSync(sai, { recursive: true });
      const q = (v) => +v.toFixed(2);
      const porTipo = {}; for (const t of r.tris) { const l = (porTipo[`${t.tipo}:${t.camada}`] ||= []); for (let k = 0; k < 3; k++) l.push(q(t.t[k][0]), q(t.t[k][1]), q(t.y[k]), q(t.a[k])); }
      // no repositório só as medidas e as listas (os triângulos têm dezenas de MB e saem de novo do script)
      fs.writeFileSync(path.join(sai, `${rot}.json`), JSON.stringify({ slug, rotulo: rot, resumo: r.resumo, alargamentos: r.alargamentos, cones: r.cones }, null, 1));
      if (pastaAtual) { fs.mkdirSync(pastaAtual, { recursive: true }); fs.writeFileSync(path.join(pastaAtual, `${slug}-${rot}.novo.json`), JSON.stringify({ triangulos: porTipo })); }
      if (pastaAtual) {
        fs.mkdirSync(pastaAtual, { recursive: true });
        // para as imagens: eixo novo, desenho atual e as ruas do grafo (contexto)
        const conv = r.conv, todas = r.grafo.arestas.filter((a) => !['footway', 'cycleway', 'path', 'steps', 'track'].includes(a.tipo)).map((a) => a.nos.map((n) => { const p = conv(...r.grafo.nos[n]); return [q(p.x), q(p.z)]; }));
        fs.writeFileSync(path.join(pastaAtual, `${slug}-${rot}.json`), JSON.stringify({ atual: r.atualDados, eixoNovo: r.eixo.map((a) => [q(a.x), q(a.z), +(a.s).toFixed(0)]), grafo: todas, cones: r.cones }));
      }
      const c = r.resumo.cobertura;
      console.log(`${slug.slice(0, 12)} ${rot}: faixa ±4 m sem asfalto ${c.antes.faltaAsfaltoPontos} → ${c.depois.faltaAsfaltoPontos} pontos · calçada até 7,6 m ${c.antes.faltaCalcadaPontos} → ${c.depois.faltaCalcadaPontos} · alargado asfalto ${r.resumo.alargadoAsfaltoM} m, calçada ${r.resumo.alargadoCalcadaM} m em ${r.resumo.alargamentos} trechos · triângulos ${r.resumo.triangulos.novoMalha} + pintura ${r.resumo.triangulos.novoPintura} (atual ${r.resumo.triangulos.atualFaixas}) · vão ${r.resumo.vaoLivreMinM} m · ${Date.now() - t0} ms`);
    }
  }
}
