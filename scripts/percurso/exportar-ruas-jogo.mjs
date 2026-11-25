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
import { montarRede, comprimento, eixoDaPista, montarRuas, fitaDasZonas, medirFaixa, CALCADA_M } from '../../src/ruasOSM.js';
import { METADE } from './exportar-jogo.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ler = (p) => JSON.parse(fs.readFileSync(path.join(RAIZ, p)));
export const VERSAO = 'etapa4b-v1';
const PROVAS = { '9-maratona-sorocaba-novembro-azul-2026-11-21': 0, '1-meia-maratona-de-indaiatuba-2026-12-13': 1.6 };

// a pista exatamente como o jogo monta no modo de teste (percurso ajustado + viaduto sem o falso das voltas)
export function pistaDoJogo(slug, rot) {
  const a = ler(`public/percursos/${slug}.json`).distancias[rot];
  const p = new PistaReal(a.percurso, { exagero: PROVAS[slug], janela: JANELA });
  const v = viadutosDoPercurso(prepararOSM(ler(`public/osm/${slug}.json`), p.paraLocal), p, { mesmaPassagem: true });
  if (v.length) p.elevar(v, { altura: 7 });
  return { pista: p, ajust: a };
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
  const ramos = rede.ramos.filter((r) => r.rota).map((r) => ({
    pts: r.pts.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]), w: +r.w.toFixed(2), calc: +(r.calc ?? CALCADA_M).toFixed(2),
    // ponte do OSM onde o jogo não eleva (ponte baixa sobre córrego) é chão no desenho
    camada: r.camada >= 1 && r.pts.some(([x, z]) => perto(x, z)?.alto) ? 1 : 0,
    faixas: r.arestas.flatMap((id) => porAresta.get(id) || []).map(([a, b]) => [Math.round(a), Math.round(b)]),
    nome: r.nome, wReal: +r.wReal.toFixed(2), fonte: r.fonte,
  }));
  // zonas que continuam com a fita de sempre: viaduto/ponte do jogo (etapa 4d) e o fallback (ligação que falta no OSM)
  const zonas = [];
  for (let s = 0, ini = null; s <= pista.total + 2; s += 2) {
    const alto = s <= pista.total && (pista.elevacao?.(s) || 0) > 0.3;
    if (alto && ini === null) ini = s;
    if (!alto && ini !== null) { zonas.push([ini - 20, s + 20, 'ponte']); ini = null; }
  }
  for (const [a, b] of ajust.fallbackKm || []) zonas.push([a * 1000 * fator - 15, b * 1000 * fator + 15, 'fallback']);
  // duas passagens lado a lado (< 16,5 m: as faixas até a penalidade, com os remendos, se encostam) em alturas diferentes (0,3–5,5 m,
  // sem ser viaduto): qualquer rua desenhada para uma cobriria a outra. Ali fica a fita de sempre, que se encolhe.
  {
    const am = E.eixo.filter((_, k) => k % 2 === 0), marcados = [];
    for (const a of am) for (const b of E.ix.perto(a.x, a.z, 17)) {
      if (Math.abs(a.s - b.s) < 60) continue;
      const dy = Math.abs(a.y - b.y);
      if (Math.hypot(a.x - b.x, a.z - b.z) < 16.5 && dy > 0.3 && dy < 5.5) { marcados.push(a.s); break; }
    }
    let ini = null, ant = null;
    for (const s of marcados) { if (ini !== null && s - ant > 12) { zonas.push([ini - 10, ant + 10, 'alturas diferentes lado a lado']); ini = null; } if (ini === null) ini = s; ant = s; }
    if (ini !== null) zonas.push([ini - 10, ant + 10, 'alturas diferentes lado a lado']);
  }
  const zonasFita = zonas.map(([a, b]) => [Math.round(a), Math.round(b)]); // (dados.zonasFita é esta mesma lista)
  // remendos: mede, alarga onde falta, repete (bordas)
  const dados = { ramos, zonasFita, remendos: [] };
  const medir = () => medirFaixa(pista, [...montarRuas(pista, dados, { eixo: E }), ...fitaDasZonas(pista, zonasFita)], { zonas: zonasFita });
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
  for (let volta = 0, r = ruim(m); r.length && volta < 4; volta++, m = medir(), r = ruim(m)) {
    let ini = null, ant = null;
    const fecha = () => { if (ini !== null) { dados.zonasFita.push([Math.round(ini - 15), Math.round(ant + 15)]); zonas.push([ini - 15, ant + 15, 'remendo não cabe (outra passagem perto ou rampa forte)']); } ini = null; };
    for (const s of r) { if (ini !== null && s - ant > 12) fecha(); if (ini === null) ini = s; ant = s; }
    fecha();
  }
  const tris = montarRuas(pista, dados, { eixo: E });
  const resumo = {
    pistaKm: +(pista.total / 1000).toFixed(3), faltaAntes: antes, faltaDepois: m.falta.length, pontosMedidos: m.pontos,
    porCima: m.porCima.filter((p) => p.tipo === 'outra').length,
    porCimaKm: [...new Set(m.porCima.filter((p) => p.tipo === 'outra').map((p) => +(p.s / 1000).toFixed(2)))].slice(0, 30),
    beiraAcimaPontos: m.porCima.filter((p) => p.tipo === 'propria').length,
    beiraAcimaMaxM: +m.porCima.filter((p) => p.tipo === 'propria').reduce((x, p) => Math.max(x, p.dy), 0).toFixed(2),
    beiraAcimaNaRuaMaxM: +m.porCima.filter((p) => p.tipo === 'propria' && Math.abs(p.d) <= MEIA_RUA).reduce((x, p) => Math.max(x, p.dy), 0).toFixed(2),
    ruas: ramos.length, ruasAlargadasM: Math.round(ramos.filter((r) => r.w > r.wReal + 0.05).reduce((t, r) => t + comprimento(r.pts), 0)),
    ruasNaLarguraRealM: Math.round(ramos.filter((r) => r.w <= r.wReal + 0.05).reduce((t, r) => t + comprimento(r.pts), 0)),
    remendos: dados.remendos.length, remendosAsfaltoM: Math.round(dados.remendos.filter((r) => r.tipo === 'asfalto').reduce((t, r) => t + r.s1 - r.s0, 0)),
    zonasFita: zonas.map(([a, b, motivo]) => ({ km: [+(a / 1000).toFixed(3), +(b / 1000).toFixed(3)], motivo })), triangulos: tris.length,
    fitaM: Math.round(uniao(dados.zonasFita)), fitaPct: +(100 * uniao(dados.zonasFita) / pista.total).toFixed(1),
  };
  return { pistaTotal: +pista.total.toFixed(2), ramos, zonasFita, remendos: dados.remendos, resumo };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const slug of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PROVAS)) {
    const aj = ler(`public/percursos/${slug}.json`);
    const saida = { slug, versao: VERSAO, percurso: aj.versao, origem: aj.distancias[Object.keys(aj.distancias)[0]].percurso[0].slice(0, 2), distancias: {} };
    for (const rot of Object.keys(aj.distancias)) {
      const t0 = Date.now(), d = dadosDistancia(slug, rot);
      d.origem = aj.distancias[rot].percurso[0].slice(0, 2);
      saida.distancias[rot] = d;
      console.log(`${slug.slice(0, 12)} ${rot}: faixa sem cobertura ${d.resumo.faltaAntes} → ${d.resumo.faltaDepois} pontos · outra passagem por cima ${d.resumo.porCima} ${JSON.stringify(d.resumo.porCimaKm.slice(0, 8))} · beira da própria rua acima: ${d.resumo.beiraAcimaPontos} pts, máx ${d.resumo.beiraAcimaMaxM} m (na faixa ±4 m: ${d.resumo.beiraAcimaNaRuaMaxM}) · ${d.ramos.length} ruas · ${d.remendos.length} remendos (${d.resumo.remendosAsfaltoM} m de asfalto) · ${d.resumo.triangulos} triângulos · fita de sempre em ${d.resumo.fitaPct}% (${d.resumo.fitaM} m) · ${Date.now() - t0} ms`);
    }
    fs.mkdirSync(path.join(RAIZ, 'public/ruas'), { recursive: true });
    fs.writeFileSync(path.join(RAIZ, 'public/ruas', `${slug}.json`), JSON.stringify(saida));
  }
}
