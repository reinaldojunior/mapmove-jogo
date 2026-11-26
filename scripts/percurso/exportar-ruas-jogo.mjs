// Etapa 4b: gera public/ruas/<slug>.json — o que o jogo desenha com ?ruas=osm (ruas do percurso e avenidas de pista
// dupla). Mede a faixa do corredor com as MESMAS funções que o jogo usa para desenhar (src/ruasOSM.js) e calcula os
// remendos (D1) até não faltar nada.
// Uso: node scripts/percurso/exportar-ruas-jogo.mjs [slug …]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PistaReal } from '../../src/pista.js';
import { JANELA } from '../../src/percursoAjustado.js';
import { MEIA_RUA, LIMITE_CALCADA } from '../../src/regras.js';
import { prepararOSM, viadutosDoPercurso } from '../../src/osm.js';
import { montarRede, cruzamentos, trecho, comprimento, eixoDaPista, montarRuas, fitaDasZonas, medirFaixa, CALCADA_M } from '../../src/ruasOSM.js';
import { METADE } from './exportar-jogo.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ler = (p) => JSON.parse(fs.readFileSync(path.join(RAIZ, p)));
export const VERSAO = 'etapa4d-v1';
const PROVAS = { '9-maratona-sorocaba-novembro-azul-2026-11-21': 0, '1-meia-maratona-de-indaiatuba-2026-12-13': 1.6 };

// a pista exatamente como o jogo monta no modo de teste (percurso ajustado + viaduto sem o falso das voltas)
export function pistaDoJogo(slug, rot) {
  const a = ler(`public/percursos/${slug}.json`).distancias[rot];
  const p = new PistaReal(a.percurso, { exagero: PROVAS[slug], janela: JANELA });
  const v = viadutosDoPercurso(prepararOSM(ler(`public/osm/${slug}.json`), p.paraLocal), p, { mesmaPassagem: true });
  if (v.length) p.elevar(v, { altura: 7 });
  return { pista: p, ajust: a };
}

const ASF_J = new Set(['asfalto', 'cruzamento', 'alargamento', 'toco']);
function juntas(tris, dados, E) {
  const zonas = dados.zonasFita, emZona = (s) => zonas.some(([a, b]) => s >= a && s <= b);
  const asf = tris.filter((q) => ASF_J.has(q.tipo)), C = 8, grade = new Map(), k = (x, z) => Math.floor(x / C) * 100003 + Math.floor(z / C);
  asf.forEach((q, i) => { const xs = q.t.map((p) => p[0]), zs = q.t.map((p) => p[1]); for (let a = Math.floor(Math.min(...xs) / C); a <= Math.floor(Math.max(...xs) / C); a++) for (let b = Math.floor(Math.min(...zs) / C); b <= Math.floor(Math.max(...zs) / C); b++) { const kk = a * 100003 + b; if (!grade.has(kk)) grade.set(kk, []); grade.get(kk).push(i); } });
  const contem = (x, z) => (grade.get(k(x, z)) || []).map((i) => asf[i]).filter((q) => { const [[ax, az], [bx, bz], [cx, cz]] = q.t, d1 = (bx - ax) * (z - az) - (bz - az) * (x - ax), d2 = (cx - bx) * (z - bz) - (cz - bz) * (x - bx), d3 = (ax - cx) * (z - cz) - (az - cz) * (x - cx); return (d1 >= -1e-6 && d2 >= -1e-6 && d3 >= -1e-6) || (d1 <= 1e-6 && d2 <= 1e-6 && d3 <= 1e-6); });
  const yEm = (q, x, z) => { const [[ax, az], [bx, bz], [cx, cz]] = q.t, den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(den) < 1e-9) return q.y[0]; const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den; return l1 * q.y[0] + l2 * q.y[1] + (1 - l1 - l2) * q.y[2]; };
  const km = (x, z) => { const h = E.alturaEm(x, z, 0); return { km: +(h.s / 1000).toFixed(2), s: h.s }; };
  const degraus = [];
  for (const q of asf) {
    if (q.tipo === 'alargamento') continue;
    for (let j = 0; j < 3; j++) {
      const [x, z] = q.t[j], y = q.y[j];
      for (const o of contem(x, z)) {
        if (o === q || o.tipo === q.tipo && o.tipo !== 'cruzamento' && o.faixas === q.faixas) continue;
        const dy = Math.abs(yEm(o, x, z) - y);
        if (dy > 0.1 && dy < 1.5) { const p = km(x, z); if (!emZona(p.s)) degraus.push({ ...p, dy, par: [q.tipo, o.tipo].sort().join('×') }); }
      }
    }
  }
  // fresta: o pedaço de cada rua que o cruzamento recortou (da ponta recortada até o ponto de encontro) tem que estar
  // todo coberto por asfalto (o polígono do cruzamento)
  const frestas = [];
  for (const r of dados.ramos) for (const seg of r._recortado || []) {
    if (!seg) continue;
    for (let s = 0.25, L = comprimento(seg); s < L; s += 0.5) {
      const [[x, z]] = trecho(seg, s, s).length ? trecho(seg, s, s) : [seg[0]];
      if (!contem(x, z).length) { const k0 = km(x, z); if (!emZona(k0.s)) frestas.push({ ...k0, tipo: r.tipo, nome: r.nome }); break; }
    }
  }
  // vão livre: debaixo de cada pedaço de asfalto elevado (tabuleiro), o asfalto mais alto que passa por baixo
  let vao = Infinity;
  for (const q of asf) {
    const x = (q.t[0][0] + q.t[1][0] + q.t[2][0]) / 3, z = (q.t[0][1] + q.t[1][1] + q.t[2][1]) / 3, y = (q.y[0] + q.y[1] + q.y[2]) / 3;
    if (!E.eixo.some((a) => a.alto && Math.hypot(a.x - x, a.z - z) < 12)) continue; // só o tabuleiro (trecho elevado)
    for (const o of contem(x, z)) { const dy = y - yEm(o, x, z); if (dy > 1.5) vao = Math.min(vao, dy); }
  }
  return { degraus, frestas, vao };
}
const uniao = (zs) => { const o = zs.map(([a, b]) => [a, b]).sort((x, y) => x[0] - y[0]); let t = 0, c = null; for (const [a, b] of o) { if (!c || a > c[1]) { if (c) t += c[1] - c[0]; c = [a, b]; } else c[1] = Math.max(c[1], b); } if (c) t += c[1] - c[0]; return t; };
export function dadosDistancia(slug, rot) {
  const { pista, ajust } = pistaDoJogo(slug, rot);
  const grafo = ler(`dados/grafos/${slug}.json`), casado = ler(`dados/casados/${slug}.json`).distancias[rot];
  const E = eixoDaPista(pista);
  // ruas do percurso (D1: largura mínima da faixa do corredor; +2 m de cada lado onde a rua é percorrida nos dois
  // sentidos, porque ali o eixo fica 2 m à direita — etapa 3)
  const sentidos = new Map(); for (const q of casado.passagens) if (!q.semCasamento) { if (!sentidos.has(q.aresta)) sentidos.set(q.aresta, new Set()); sentidos.get(q.aresta).add(q.sent); }
  const minimo = (a) => { const off = sentidos.get(a.id)?.size === 2 ? METADE : 0; return { w: 2 * (MEIA_RUA + 0.25 + off), calcada: (w) => Math.max(CALCADA_M, LIMITE_CALCADA + 0.2 + off - w / 2) }; };
  const rota = new Set(sentidos.keys());
  const rede = montarRede(grafo, (la, lo) => pista.paraLocal(la, lo), rota, minimo);
  const fator = pista.total / (ajust.kmGeometrico * 1000);
  const porAresta = new Map(); for (const q of casado.passagens) if (!q.semCasamento) { if (!porAresta.has(q.aresta)) porAresta.set(q.aresta, []); porAresta.get(q.aresta).push([q.sDe * 1000 * fator - 30, q.sAte * 1000 * fator + 30]); }
  const perto = (x, z) => { let m = null; for (const a of E.ix.perto(x, z, 20)) { const d = Math.hypot(a.x - x, a.z - z); if (!m || d < m.d) m = { d, a }; } return m?.a; };
  // ponte do OSM onde o jogo não eleva (ponte baixa sobre córrego) é chão no desenho
  for (const r of rede.ramos) r.camada = r.camada >= 1 && r.pts.some(([x, z]) => perto(x, z)?.alto) ? 1 : 0;
  // passagens de cada rua do percurso e de cada nó (as ruas que cruzam e os cruzamentos pegam a altura por elas)
  const faixasRamo = (r) => r.arestas.flatMap((id) => porAresta.get(id) || []);
  const porNo = new Map();
  for (const r of rede.ramos) if (r.rota) for (const n of r.nos) { if (!porNo.has(n)) porNo.set(n, []); porNo.get(n).push(...faixasRamo(r)); }
  const arred = (fx) => fx.map(([a, b]) => [Math.round(a), Math.round(b)]);
  // etapa 4c: cruzamentos (recorte das pontas, polígono único com cantos arredondados) e ruas que cruzam (50 m)
  const { polis, recorte } = cruzamentos(rede);
  const q2 = (p) => [+p[0].toFixed(2), +p[1].toFixed(2)];
  const ramos = [];
  rede.ramos.forEach((r, i) => {
    const L = comprimento(r.pts), [c0, c1] = recorte[i];
    if (L - c0 - c1 < 0.3) return; // engolido pelos cruzamentos
    const tipo = r.rota ? 'rota' : r.toco ? 'toco' : 'ligacao';
    const fx = r.rota ? faixasRamo(r) : [...(porNo.get(r.nos[0]) || []), ...(porNo.get(r.nos[1]) || [])];
    if (!fx.length) return;
    ramos.push({ tipo, pts: trecho(r.pts, c0, L - c1).map(q2), w: +r.w.toFixed(2), calc: +(r.calc ?? CALCADA_M).toFixed(2), camada: r.camada,
      faixas: arred(fx), comprimento: +L.toFixed(1), recorteInicio: +c0.toFixed(2), nome: r.nome, wReal: +r.wReal.toFixed(2), fonte: r.fonte,
      // pedaço recortado pelos cruzamentos (só para medir frestas; o jogo não usa)
      _recortado: [c0 > 0.3 ? trecho(r.pts, 0, c0) : null, c1 > 0.3 ? trecho(r.pts, L - c1, L) : null] });
  });
  const cruz = polis.map((c) => ({ pol: c.pol.map(q2), cantos: c.cantos.map((k) => k.map(q2)), centro: q2(c.centro), camada: c.camada, faixas: arred(porNo.get(c.no) || []) }))
    .filter((c) => c.faixas.length);
  // zonas que continuam com a fita de sempre: viaduto/ponte do jogo (etapa 4d) e o fallback (ligação que falta no OSM)
  const zonas = [], trechosElevados = [];
  for (let s = 0, ini = null; s <= pista.total + 2; s += 2) {
    const alto = s <= pista.total && (pista.elevacao?.(s) || 0) > 0.3;
    if (alto && ini === null) ini = s;
    if (!alto && ini !== null) { trechosElevados.push([ini, s]); ini = null; } // 4d: a ponte usa o desenho novo
  }
  for (const [a, b] of ajust.fallbackKm || []) zonas.push([a * 1000 * fator - 15, b * 1000 * fator + 15, 'fallback']);
  // duas passagens lado a lado (< 9,5 m: as faixas de asfalto ±4 m se encostam; a calçada entre elas é compartilhada) em alturas diferentes (0,3–5,5 m,
  // sem ser viaduto): qualquer rua desenhada para uma cobriria a outra. Ali fica a fita de sempre, que se encolhe.
  {
    const am = E.eixo.filter((_, k) => k % 2 === 0), marcados = [];
    for (const a of am) for (const b of E.ix.perto(a.x, a.z, 10)) {
      if (Math.abs(a.s - b.s) < 60) continue;
      const dy = Math.abs(a.y - b.y);
      if (Math.hypot(a.x - b.x, a.z - b.z) < 9.5 && dy > 0.3 && dy < 5.5) { marcados.push(a.s); break; }
    }
    let ini = null, ant = null;
    for (const s of marcados) { if (ini !== null && s - ant > 12) { zonas.push([ini - 10, ant + 10, 'alturas diferentes lado a lado']); ini = null; } if (ini === null) ini = s; ant = s; }
    if (ini !== null) zonas.push([ini - 10, ant + 10, 'alturas diferentes lado a lado']);
  }
  const zonasFita = zonas.map(([a, b]) => [Math.round(a), Math.round(b)]); // (dados.zonasFita é esta mesma lista)
  // remendos: mede, alarga onde falta, repete (bordas)
  const dados = { ramos, cruzamentos: cruz, zonasFita, remendos: [] };
  const medir = () => medirFaixa(pista, [...montarRuas(pista, dados, { eixo: E }), ...fitaDasZonas(pista, zonasFita)], { zonas: zonasFita, eixo: E });
  let m = medir(); const antes = m.falta.length;
  for (let passada = 1; m.falta.length && passada <= 8; passada++) {
    for (const tipo of ['asfalto', 'calcada']) for (const lado of [-1, 1]) {
      const ss = [...new Set(m.falta.filter((f) => f.tipo === tipo && f.lado === lado).map((f) => f.s))].sort((a, b) => a - b);
      let ini = null, ant = null;
      const fecha = () => { if (ini !== null) dados.remendos.push({ tipo, lado, s0: Math.max(-30, ini - 5), s1: Math.min(pista.total, ant + 5), passada }); ini = null; };
      for (const s of ss) { if (ini !== null && s - ant > 8) fecha(); if (ini === null) ini = s; ant = s; }
      fecha();
    }
    m = medir();
  }
  // o que ainda não fecha (remendo que cobriria outra passagem, beira da própria rua > 0,5 m acima dentro da faixa
  // ±4 m numa curva em rampa forte) também fica com a fita de sempre; repete até ficar limpo
  const ruim = (mm) => [...mm.falta.map((f) => f.s), ...mm.porCima.filter((p) => p.tipo === 'outra' || (Math.abs(p.d) <= MEIA_RUA && p.dy > 0.5)).map((p) => p.s)].sort((a, b) => a - b);
  if (process.env.DEPURAR) {
    const cat = {}; for (const f of m.falta) cat['falta ' + f.tipo] = (cat['falta ' + f.tipo] || 0) + 1;
    for (const p of m.porCima) { const k = p.calcadaNaRua ? 'superfície de cima não é asfalto' : p.tipo === 'outra' ? 'outra passagem por cima' : p.dy > 0.5 && Math.abs(p.d) <= MEIA_RUA ? 'beira própria > 0,5' : null; if (k) cat[k] = (cat[k] || 0) + 1; }
    const tps = {}; for (const p of m.porCima.filter((p) => p.calcadaNaRua)) tps[p.tipoTopo + ' ' + (p.dy > 0.05 ? '>5cm' : '<5cm')] = (tps[p.tipoTopo + ' ' + (p.dy > 0.05 ? '>5cm' : '<5cm')] || 0) + 1; console.log('tipos por cima', JSON.stringify(tps));
    console.log('antes das zonas:', JSON.stringify(cat), 'km:', JSON.stringify([...new Set(m.porCima.filter((p) => p.calcadaNaRua).map((p) => +(p.s / 1000).toFixed(2)))].slice(0, 20)));
  }
  // (degrau/fresta num cruzamento torto do mapa entram na mesma conta)
  const ruimTudo = (mm) => { const j = juntas(montarRuas(pista, dados, { eixo: E }), dados, E); return [...ruim(mm), ...j.degraus.map((p) => p.s), ...j.frestas.map((p) => p.s)].sort((a, b) => a - b); };
  for (let volta = 0, r = ruimTudo(m); r.length && volta < 6; volta++, m = medir(), r = ruimTudo(m)) {
    let ini = null, ant = null;
    const fecha = () => { if (ini !== null) { dados.zonasFita.push([Math.round(ini - 15), Math.round(ant + 15)]); zonas.push([ini - 15, ant + 15, 'remendo não cabe, ou degrau/fresta num cruzamento do mapa']); } ini = null; };
    for (const s of r) { if (ini !== null && s - ant > 12) fecha(); if (ini === null) ini = s; ant = s; }
    fecha();
  }
  let tris = montarRuas(pista, dados, { eixo: E });
  // 4c: degrau entre peças (cruzamento × rua × rua que cruza × remendo no mesmo ponto com alturas diferentes) e
  // fresta nas emendas (1,5 m além da ponta recortada de cada rua, para dentro do cruzamento, tem que ter asfalto)
  const { degraus, frestas, vao } = juntas(tris, dados, E);
  const resumo = {
    pistaKm: +(pista.total / 1000).toFixed(3), faltaAntes: antes, faltaDepois: m.falta.length, pontosMedidos: m.pontos,
    porCima: m.porCima.filter((p) => p.tipo === 'outra').length,
    porCimaKm: [...new Set(m.porCima.filter((p) => p.tipo === 'outra').map((p) => +(p.s / 1000).toFixed(2)))].slice(0, 30),
    beiraAcimaPontos: m.porCima.filter((p) => p.tipo === 'propria').length,
    beiraAcimaMaxM: +m.porCima.filter((p) => p.tipo === 'propria').reduce((x, p) => Math.max(x, p.dy), 0).toFixed(2),
    beiraAcimaNaRuaMaxM: +m.porCima.filter((p) => p.tipo === 'propria' && Math.abs(p.d) <= MEIA_RUA).reduce((x, p) => Math.max(x, p.dy), 0).toFixed(2),
    ruas: ramos.filter((r) => r.tipo === 'rota').length, ruasQueCruzam: ramos.filter((r) => r.tipo !== 'rota').length, cruzamentos: cruz.length,
    ruasAlargadasM: Math.round(ramos.filter((r) => r.tipo === 'rota' && r.w > r.wReal + 0.05).reduce((t, r) => t + comprimento(r.pts), 0)),
    ruasNaLarguraRealM: Math.round(ramos.filter((r) => r.tipo === 'rota' && r.w <= r.wReal + 0.05).reduce((t, r) => t + comprimento(r.pts), 0)),
    remendos: dados.remendos.length, remendosAsfaltoM: Math.round(dados.remendos.filter((r) => r.tipo === 'asfalto').reduce((t, r) => t + r.s1 - r.s0, 0)),
    zonasFita: zonas.map(([a, b, motivo]) => ({ km: [+(a / 1000).toFixed(3), +(b / 1000).toFixed(3)], motivo })), triangulos: tris.length,
    degrausEntrePecas: degraus.length, degrauPares: degraus.reduce((m, d) => { m[d.par] = (m[d.par] || 0) + 1; return m; }, {}), degrauMaxM: +degraus.reduce((x, d) => Math.max(x, d.dy), 0).toFixed(2), degrauKm: [...new Set(degraus.map((d) => d.km))].slice(0, 20),
    vaoLivreMinM: Number.isFinite(vao) ? +vao.toFixed(2) : null, trechosElevadosKm: trechosElevados.map(([a, b]) => [+(a / 1000).toFixed(3), +(b / 1000).toFixed(3)]),
    frestas: frestas.length, frestaLista: frestas.slice(0, 8), frestaKm: [...new Set(frestas.map((d) => d.km))].slice(0, 20),
    fitaM: Math.round(uniao(dados.zonasFita)), fitaPct: +(100 * uniao(dados.zonasFita) / pista.total).toFixed(1),
  };
  return { pistaTotal: +pista.total.toFixed(2), ramos: ramos.map(({ _recortado, ...r }) => r), cruzamentos: cruz, zonasFita, remendos: dados.remendos, resumo };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const slug of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PROVAS)) {
    const aj = ler(`public/percursos/${slug}.json`);
    const saida = { slug, versao: VERSAO, percurso: aj.versao, origem: aj.distancias[Object.keys(aj.distancias)[0]].percurso[0].slice(0, 2), distancias: {} };
    for (const rot of Object.keys(aj.distancias)) {
      const t0 = Date.now(), d = dadosDistancia(slug, rot);
      d.origem = aj.distancias[rot].percurso[0].slice(0, 2);
      saida.distancias[rot] = d;
      console.log(`${slug.slice(0, 12)} ${rot}: faixa sem cobertura ${d.resumo.faltaAntes} → ${d.resumo.faltaDepois} pontos · outra passagem por cima ${d.resumo.porCima} ${JSON.stringify(d.resumo.porCimaKm.slice(0, 8))} · beira da própria rua acima: ${d.resumo.beiraAcimaPontos} pts, máx ${d.resumo.beiraAcimaMaxM} m (na faixa ±4 m: ${d.resumo.beiraAcimaNaRuaMaxM}) · ${d.resumo.ruas} ruas + ${d.resumo.ruasQueCruzam} que cruzam · ${d.resumo.cruzamentos} cruzamentos · ${d.remendos.length} remendos (${d.resumo.remendosAsfaltoM} m de asfalto) · ${d.resumo.triangulos} triângulos · degraus ${d.resumo.degrausEntrePecas} (máx ${d.resumo.degrauMaxM} m) ${JSON.stringify(d.resumo.degrauKm.slice(0, 6))} · frestas ${d.resumo.frestas} ${JSON.stringify(d.resumo.frestaKm.slice(0, 6))} · vão ${d.resumo.vaoLivreMinM} m · fita de sempre em ${d.resumo.fitaPct}% (${d.resumo.fitaM} m) · ${Date.now() - t0} ms`);
    }
    fs.mkdirSync(path.join(RAIZ, 'public/ruas'), { recursive: true });
    fs.writeFileSync(path.join(RAIZ, 'public/ruas', `${slug}.json`), JSON.stringify(saida));
  }
}
