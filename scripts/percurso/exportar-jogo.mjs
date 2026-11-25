// Etapa 3: gera public/percursos/<slug>.json, o percurso ajustado ao OSM que o jogo usa quando o modo de teste
// "percurso ajustado" está ligado (src/percursoAjustado.js). Lê dados/casados (etapa 2), dados/elevacao e
// dados/percursos (GPS do Portal). Nada é gravado no Portal.
// Uso: node scripts/percurso/exportar-jogo.mjs <slug> [<slug>…]
//
// - Geometria: a linha do matching como está (sem esticar para a distância oficial). Trechos sem casamento já vêm
//   com os pontos do GPS (método alternativo), ligados só nesses pontos.
// - Altitude: a do GPS do Portal levada para o km do traçado ajustado (dados/elevacao, série `gps`), inclusive onde
//   ela é incoerente (Indaiatuba 21K): nada é trocado pelo terreno.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ler = (p) => JSON.parse(fs.readFileSync(path.join(RAIZ, p)));
export const VERSAO = 'etapa3-v1';

const interp = (xs, ys, x) => {
  let lo = 0, hi = xs.length - 1;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[hi]) return ys[hi];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  return ys[lo] + ((ys[hi] - ys[lo]) * (x - xs[lo])) / ((xs[hi] - xs[lo]) || 1);
};

// Rua percorrida nos dois sentidos (retorno no meio da rua, ida e volta na mesma rua): cada sentido corre na sua
// metade, com o eixo METADE m à direita de quem corre, como numa prova com retorno em cones. Sem isso as duas
// passagens ficariam exatamente uma em cima da outra e, perto da ponta do retorno, o corredor "pularia" para a volta
// (a projeção não teria como escolher). Cada segmento da linha é deslocado conforme a aresta em que está; o ponto
// fica com a média dos dois segmentos vizinhos (na ponta do retorno, o meio da rua).
export const METADE = 2;
export function metadeDaRua(casado) {
  const L = casado.linha, ps = casado.passagens.filter((p) => !p.semCasamento);
  const sentidos = new Map();
  for (const p of ps) { if (!sentidos.has(p.aresta)) sentidos.set(p.aresta, new Set()); sentidos.get(p.aresta).add(p.sent); }
  const dupla = (p) => p && sentidos.get(p.aresta)?.size === 2;
  const lat0 = L[0][0], kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110540;
  const xy = L.map(([la, lo]) => [lo * kx, la * ky]);
  // deslocamento de cada segmento i → i+1
  let k = 0;
  const desl = [];
  for (let i = 0; i < L.length - 1; i++) {
    const sm = (L[i][2] + L[i + 1][2]) / 2000; // km
    while (k < ps.length - 1 && ps[k].sAte < sm) k++;
    const p = ps[k].sDe <= sm && sm <= ps[k].sAte ? ps[k] : null;
    const dx = xy[i + 1][0] - xy[i][0], dy = xy[i + 1][1] - xy[i][1], l = Math.hypot(dx, dy);
    desl.push(dupla(p) && l > 1e-6 ? [(dy / l) * METADE, (-dx / l) * METADE] : null); // direita de (dx, dy) = (dy, -dx)
  }
  return L.map(([la, lo, s], i) => {
    const a = desl[i - 1], b = desl[i];
    if (!a && !b) return [la, lo, s];
    // ponto entre um segmento deslocado e um não deslocado (ou ponta de retorno): média dos dois
    const ox = ((a?.[0] || 0) + (b?.[0] || 0)) / (a && b ? 2 : (i === 0 || i === L.length - 1 ? 1 : 2));
    const oy = ((a?.[1] || 0) + (b?.[1] || 0)) / (a && b ? 2 : (i === 0 || i === L.length - 1 ? 1 : 2));
    return [la + oy / ky, lo + ox / kx, s];
  });
}

// pontos a cada ≤ PASSO m (retas longas do grafo ganham pontos no meio só para carregar a altitude do GPS)
const PASSO = 20;
export function percursoDoJogo(casado, elevacao) {
  const xs = elevacao.serie.map((q) => q.km * 1000), ys = elevacao.serie.map((q) => q.gps);
  const out = [], sOut = [];
  const por = (la, lo, s) => { out.push([+la.toFixed(6), +lo.toFixed(6), +interp(xs, ys, s).toFixed(1)]); sOut.push(s); };
  const L = metadeDaRua(casado);
  for (let i = 0; i < L.length; i++) {
    const [la, lo, s] = L[i];
    if (i && s - sOut[sOut.length - 1] < 0.05) continue; // ponto repetido (junção de passagens)
    if (i) {
      const [la0, lo0, s0] = L[i - 1], n = Math.floor((s - s0) / PASSO);
      for (let k = 1; k <= n; k++) { const f = (k * PASSO) / (s - s0); if (f < 0.999) por(la0 + (la - la0) * f, lo0 + (lo - lo0) * f, s0 + (s - s0) * f); }
    }
    por(la, lo, s);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const slug of process.argv.slice(2)) {
    const casados = ler(`dados/casados/${slug}.json`), elev = ler(`dados/elevacao/${slug}.json`);
    const saida = { slug, versao: VERSAO, gerado: casados.gerado, fonte: 'map matching OSM (etapa 2)', distancias: {} };
    for (const [rot, c] of Object.entries(casados.distancias)) {
      const percurso = percursoDoJogo(c, elev.distancias[rot]);
      saida.distancias[rot] = {
        kmOficial: c.distancias.oficialKm, kmGeometrico: c.distancias.geometricaKm, kmGps: c.distancias.gpsKm,
        percentAjustado: c.confianca.percentAjustado,
        fallbackKm: c.passagens.filter((p) => p.semCasamento).map((p) => [p.sDe, p.sAte]),
        altitudeGpsCoerente: elev.distancias[rot].resumo.altitudeGpsCoerente,
        percurso,
      };
      console.log(`${slug.slice(0, 24)} ${rot}: ${percurso.length} pontos · ${c.distancias.geometricaKm} km · fallback ${saida.distancias[rot].fallbackKm.length}`);
    }
    fs.mkdirSync(path.join(RAIZ, 'public/percursos'), { recursive: true });
    fs.writeFileSync(path.join(RAIZ, 'public/percursos', `${slug}.json`), JSON.stringify(saida));
  }
}
