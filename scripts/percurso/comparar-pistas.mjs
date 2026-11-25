// Etapa 3: compara a pista de HOJE (GPS do Portal + refino) com a pista do PERCURSO AJUSTADO (public/percursos),
// as duas montadas pela mesma PistaReal que o jogo usa. Não é usado pelo jogo.
// Uso: NODE_USE_ENV_PROXY=1 node scripts/percurso/comparar-pistas.mjs [--json saida.json]
//   (com rede, busca no Portal os postos marcados no KML para comparar onde caem nas duas pistas)
//
// Para cada distância: distância, continuidade do eixo (em(s) a cada 1 m), ida e volta em → projetar, simulação de
// corrida (o corredor mira à frente, oscila de lado, s vem de projetar com a dica, como no jogo: s tem que crescer
// sempre, sem salto nem recuo), retornos, trechos repetidos, postos, marcos de km e subida.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PistaReal, difAngulo } from '../../src/pista.js';
import { refinarDistancias } from '../../src/refino.js';
import { percursoValido, JANELA } from '../../src/percursoAjustado.js';
import { POSTO_PADRAO_M, LIMITE_CALCADA } from '../../src/regras.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ler = (p) => JSON.parse(fs.readFileSync(path.join(RAIZ, p)));
export const PROVAS = [
  { slug: '9-maratona-sorocaba-novembro-azul-2026-11-21', nome: 'Sorocaba', relevo: 0 },
  { slug: '1-meia-maratona-de-indaiatuba-2026-12-13', nome: 'Indaiatuba', relevo: 1.6 },
];

// eixo: passo entre em(s) e em(s+1) e virada por metro
export function continuidade(p) {
  let maxPasso = 0, minPasso = Infinity, maxVirada = 0, ondeVirada = 0;
  let a = p.em(0);
  for (let s = 1; s <= p.total; s += 1) {
    const b = p.em(s), d = Math.hypot(b.x - a.x, b.z - a.z);
    maxPasso = Math.max(maxPasso, d); minPasso = Math.min(minPasso, d);
    const v = Math.abs(difAngulo(b.ang, a.ang));
    if (v > maxVirada) { maxVirada = v; ondeVirada = s; }
    a = b;
  }
  return { maxPasso, minPasso, maxViradaGrausPorM: (maxVirada * 180) / Math.PI, ondeVirada };
}

// em(s) → projetar(x, z, s) tem que devolver o mesmo s (inclusive onde o percurso passa de novo pelo mesmo lugar)
export function idaEVolta(p, passo = 2) {
  let max = 0, onde = 0;
  for (let s = 0; s <= p.total; s += passo) {
    const q = p.em(s), r = p.projetar(q.x, q.z, s);
    if (Math.abs(r.s - s) > max) { max = Math.abs(r.s - s); onde = s; }
  }
  return { maxErroM: max, onde };
}

// corrida simulada como no jogo: anda na direção que escolhe (mira 10 m à frente, com oscilação lateral de até
// `lado` m), e s = projetar(x, z, s) a cada quadro
export function simular(p, { v = 4.5, dt = 1 / 30, lado = 2.5 } = {}) {
  const ini = p.em(0);
  let x = ini.x, z = ini.z, s = 0, t = 0, recuos = 0, maiorRecuo = 0, maiorSalto = 0, ondeSalto = 0, maxD = 0, foraDaRua = 0;
  const passoEsperado = v * dt;
  while (s < p.total - 1 && t < 4 * 3600) {
    t += dt;
    const off = Math.sin(t / 7) * lado;
    const alvo = p.em(Math.min(p.total, s + 10)), [rx, rz] = [Math.cos(alvo.ang), Math.sin(alvo.ang)];
    const ax = alvo.x + rx * off, az = alvo.z + rz * off, L = Math.hypot(ax - x, az - z) || 1;
    x += ((ax - x) / L) * passoEsperado; z += ((az - z) / L) * passoEsperado;
    const q = p.projetar(x, z, s), ns = Math.max(-20, q.s);
    if (ns < s - 0.01) { recuos++; maiorRecuo = Math.max(maiorRecuo, s - ns); }
    if (ns - s > maiorSalto) { maiorSalto = ns - s; ondeSalto = s; }
    s = Math.max(s, ns); // o jogo guarda o máximo em sMax; aqui s segue o máximo para medir o resto da volta
    maxD = Math.max(maxD, Math.abs(q.d)); if (Math.abs(q.d) > LIMITE_CALCADA) foraDaRua++;
  }
  return { tempoMin: t / 60, chegou: s >= p.total - 1, recuos, maiorRecuoM: maiorRecuo, maiorSaltoM: maiorSalto, ondeSalto, passoEsperadoM: passoEsperado, maxLateralM: maxD, quadrosForaDaRua: foraDaRua };
}

// retornos e curvas muito fechadas: rumo 20 m antes × 20 m depois virando mais de 150°
export function retornos(p) {
  const out = [];
  for (let s = 20; s < p.total - 20; s += 5) {
    const d = Math.abs(difAngulo(p.em(s + 20).ang, p.em(s - 20).ang));
    if (d > (150 * Math.PI) / 180) { if (out.length && s - out[out.length - 1] < 80) continue; out.push(s); }
  }
  return out.map((s) => +(s / 1000).toFixed(2));
}

export function comparar(antigo, novo, marcadores = []) {
  const medir = (p) => {
    const dup = p.dup.reduce((a, v) => a + v, 0) * 5;
    const postos = marcadores.map((m) => p.localizar(m.la, m.lo)).map((q) => ({ km: +(q.s / 1000).toFixed(3), dM: +q.d.toFixed(1) }));
    const padrao = []; for (let s = POSTO_PADRAO_M; s < p.total - 300; s += POSTO_PADRAO_M) padrao.push(s);
    return {
      totalKm: +(p.total / 1000).toFixed(3), subidaM: Math.round(p.subidaM), marcosKm: Math.max(0, Math.ceil((p.total - 150) / 1000) - 1),
      repetidoKm: +(dup / 1000).toFixed(2), retornosKm: retornos(p), postosMarcados: postos, postosPadrao: padrao.length,
      continuidade: continuidade(p), idaEVolta: idaEVolta(p), simulacao: simular(p),
    };
  };
  return { antigo: medir(antigo), novo: medir(novo) };
}

async function marcadoresDoPortal(slug) {
  try {
    const url = `https://ssfsxdmzbubvygctdjgf.supabase.co/rest/v1/corridas?slug=eq.${slug}&select=percurso_3d`;
    const chave = fs.readFileSync(path.join(RAIZ, 'src/conta.js'), 'utf8').match(/sb_publishable_\w+/)?.[0]; // chave pública
    const [c] = await (await fetch(url, { headers: { apikey: chave } })).json();
    const out = {};
    for (const [rot, v] of Object.entries(c.percurso_3d?.por || {})) out[rot.toUpperCase()] = (v.pontos || []).filter((m) => /^H\d+/i.test(m.orig || '') || /hidrat/i.test(m.name || ''));
    return out;
  } catch { return null; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const resultado = {};
  for (const prova of PROVAS) {
    const perc = ler(`dados/percursos/${prova.slug}.json`), novo = ler(`public/percursos/${prova.slug}.json`);
    const marc = await marcadoresDoPortal(prova.slug);
    const refinadas = refinarDistancias(perc.distancias.map((d) => ({ rotulo: d.rotulo, km: d.kmOficial, percurso: d.percurso })));
    for (const d of refinadas) {
      const a = novo.distancias[d.rotulo];
      if (!a || !percursoValido(a.percurso)) { console.log(prova.nome, d.rotulo, 'SEM percurso ajustado válido'); continue; }
      const r = comparar(new PistaReal(d.percurso, { exagero: prova.relevo }), new PistaReal(a.percurso, { exagero: prova.relevo, janela: JANELA }), marc?.[d.rotulo] || []);
      r.kmOficial = d.km; r.kmGeometrico = a.kmGeometrico; r.postosDoPortal = marc ? (marc[d.rotulo] || []).length : 'sem rede';
      resultado[`${prova.nome} ${d.rotulo}`] = r;
      const l = (x) => `${x.totalKm} km · subida ${x.subidaM} m · repetido ${x.repetidoKm} km · retornos [${x.retornosKm}] · eixo passo ${x.continuidade.maxPasso.toFixed(2)} m, virada máx ${x.continuidade.maxViradaGrausPorM.toFixed(1)}°/m · ida-volta ${x.idaEVolta.maxErroM.toFixed(2)} m · sim: ${x.simulacao.chegou ? 'chegou' : 'NÃO chegou'} ${x.simulacao.tempoMin.toFixed(0)} min, recuos ${x.simulacao.recuos} (máx ${x.simulacao.maiorRecuoM.toFixed(2)} m), salto máx ${x.simulacao.maiorSaltoM.toFixed(2)} m, lateral máx ${x.simulacao.maxLateralM.toFixed(1)} m · postos ${x.postosMarcados.map((q) => q.km).join(' ')}`;
      console.log(`\n${prova.nome} ${d.rotulo} (oficial ${d.km} km)\n  antes: ${l(r.antigo)}\n  agora: ${l(r.novo)}`);
    }
  }
  const i = process.argv.indexOf('--json');
  if (i > 0) fs.writeFileSync(process.argv[i + 1], JSON.stringify(resultado, null, 1));
}
