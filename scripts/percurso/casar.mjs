// Roda o map matching nas distâncias de uma prova e grava dados/casados/<slug>.json (etapa 2). Não é usado pelo jogo.
// Uso: node scripts/percurso/casar.mjs <slug>
// Lê dados/percursos/<slug>.json (GPS do Portal) e dados/grafos/<slug>.json (grafo OSM). Para comparar, calcula também
// a distância que o jogo usa HOJE (src/pista.js + src/refino.js, só leitura).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarGrafo } from './grafo.mjs';
import { casar, afastamento } from './matching.mjs';
import { PistaReal } from '../../src/pista.js';
import { refinarDistancias } from '../../src/refino.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const slug = process.argv[2];
const perc = JSON.parse(fs.readFileSync(path.join(RAIZ, 'dados/percursos', `${slug}.json`)));
const grafo = carregarGrafo(JSON.parse(fs.readFileSync(path.join(RAIZ, 'dados/grafos', `${slug}.json`))));
const RELEVO = { '9-maratona-sorocaba-novembro-azul-2026-11-21': 0 };
const P = grafo.projecao;

const linhaGps = (gps) => {
  let s = 0; const out = [];
  gps.forEach(([la, lo], i) => { const q = P.paraXY(la, lo); if (i) s += Math.hypot(q.x - out[i - 1].x, q.y - out[i - 1].y); out.push({ ...q, s }); });
  return out;
};
// distância que o jogo usa hoje (refino + PistaReal), em km
const refinadas = refinarDistancias(perc.distancias.map((d) => ({ rotulo: d.rotulo, km: d.kmOficial, percurso: d.percurso })));
const hoje = Object.fromEntries(refinadas.map((d) => [d.rotulo, new PistaReal(d.percurso, { exagero: RELEVO[slug] ?? 1.6 }).total / 1000]));
// traçado que o jogo desenha hoje (GPS depois do refino), para a comparação "antes × depois"
const tracadoHoje = Object.fromEntries(refinadas.map((d) => [d.rotulo, d.percurso.map((q) => [+q[0].toFixed(6), +q[1].toFixed(6)])]));

// viradas de ~180° no traçado ajustado (retorno no meio da rua, no fim de rua ou trocando de pista na avenida dupla):
// rumo 40 m antes × 40 m depois do ponto, diferença > 150°; agrupadas a cada 100 m
const viradas = (linha) => {
  const at = (s) => { let i = linha.findIndex((q) => q.s >= s); if (i <= 0) i = 1; const a = linha[i - 1], b = linha[i], f = (s - a.s) / ((b.s - a.s) || 1); return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; };
  const tot = linha[linha.length - 1].s, out = [];
  for (let s = 40; s < tot - 40; s += 10) {
    const a = at(s - 40), m = at(s), b = at(s + 40);
    const h1 = Math.atan2(m.y - a.y, m.x - a.x), h2 = Math.atan2(b.y - m.y, b.x - m.x);
    let d = Math.abs(h2 - h1); if (d > Math.PI) d = 2 * Math.PI - d;
    if (d > (150 * Math.PI) / 180) { if (out.length && s - out[out.length - 1].s < 100) { if (d > out[out.length - 1].ang) Object.assign(out[out.length - 1], { s, ang: d }); } else out.push({ s, ang: d }); }
  }
  return out.map((v) => ({ km: +(v.s / 1000).toFixed(2), graus: Math.round((v.ang * 180) / Math.PI) }));
};

const saida = { slug, gerado: new Date().toISOString().slice(0, 10), distancias: {} };
for (const d of perc.distancias) {
  const t0 = Date.now();
  const r = casar(grafo, d.percurso);
  const ms = Date.now() - t0;
  const gps = linhaGps(d.percurso);
  const casadas = r.passagens.filter((p) => !p.semCasamento);
  const mCasado = casadas.reduce((t, p) => t + (p.sAte - p.sDe), 0);
  // confiança por ponto: distância do GPS até o traçado casado (só pontos não descartados)
  const af = afastamento(gps.filter((_, i) => !r.descartados.includes(i)), r.linha);
  // passagens repetidas: arestas percorridas mais de uma vez (com os sentidos)
  const repetidas = Object.entries(r.passagensPorAresta).filter(([, v]) => v.length > 1).map(([id, v]) => ({ aresta: id, nome: grafo.porId.get(id).nome || null, sentidos: v }));
  const contramao = casadas.filter((p) => !grafo.permite(grafo.porId.get(p.aresta), p.sent)).reduce((t, p) => t + (p.sAte - p.sDe), 0);
  saida.distancias[d.rotulo] = {
    distancias: { oficialKm: d.kmOficial, gpsKm: +(gps[gps.length - 1].s / 1000).toFixed(3), jogoHojeKm: +hoje[d.rotulo].toFixed(3), geometricaKm: +(r.comprimento / 1000).toFixed(3) },
    confianca: { ...r.confianca, percentAjustado: +(100 * mCasado / r.comprimento).toFixed(1), gpsAteTracadoMedioM: +af.media.toFixed(1), gpsAteTracadoMaxM: +af.max.toFixed(1), tempoMs: ms },
    passagens: r.passagens.map((p) => ({ ...p, sDe: +(p.sDe / 1000).toFixed(3), sAte: +(p.sAte / 1000).toFixed(3) })),
    retornos: r.retornos.map((x) => ({ ...x, km: +(r.linha.find((q, k) => k > 0 && q.s >= (r.passagens.find((p) => p.gpsAte >= x.gps)?.sDe ?? 0))?.s / 1000 || 0).toFixed(2) })),
    viradas: viradas(r.linha),
    semCasamento: r.semCasamento,
    descartados: r.descartados,
    repetidas, contramaoM: Math.round(contramao),
    pontes: casadas.filter((p) => p.ponte || p.tunel || p.camada).map((p) => ({ nome: p.nome, camada: p.camada, ponte: p.ponte, tunel: p.tunel, km: [p.sDe, p.sAte].map((v) => +(v / 1000).toFixed(2)) })),
    linhaJogoHoje: tracadoHoje[d.rotulo],
    linha: r.linha.map((q) => { const g = P.paraLatLon(q.x, q.y); return [+g.lat.toFixed(6), +g.lon.toFixed(6), +q.s.toFixed(1)]; }),
  };
  const x = saida.distancias[d.rotulo];
  console.log(`${d.rotulo}: oficial ${d.kmOficial} · GPS ${x.distancias.gpsKm} · jogo hoje ${x.distancias.jogoHojeKm} · ajustado ${x.distancias.geometricaKm} km | `
    + `ajustado ${x.confianca.percentAjustado}% · descartados ${r.descartados.length} · sem casamento ${r.semCasamento.length} trecho(s) · GPS→traçado médio ${x.confianca.gpsAteTracadoMedioM} m (máx ${x.confianca.gpsAteTracadoMaxM}) · `
    + `retornos ${r.retornos.length} · arestas repetidas ${repetidas.length} · contramão ${x.contramaoM} m · ${ms} ms`);
}
fs.mkdirSync(path.join(RAIZ, 'dados/casados'), { recursive: true });
fs.writeFileSync(path.join(RAIZ, 'dados/casados', `${slug}.json`), JSON.stringify(saida));
