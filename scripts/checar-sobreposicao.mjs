#!/usr/bin/env node
// Mede, no percurso inteiro, onde o desenho de um trecho (rua, calçada, guia, canteiro, avenida dupla) cai em cima
// da rua de OUTRO trecho do percurso (ida e volta na mesma avenida, voltas, retornos). Monta a pista exatamente como
// o jogo (PistaReal + src/faixas.js), rasteriza em planta cada triângulo das malhas e cruza tudo numa grade de 0,5 m.
//
// uso: node scripts/checar-sobreposicao.mjs [slug ...] [--cache pasta] [--falhar]
//   sem slug: Sorocaba (21K e 42K) e Indaiatuba. --cache guarda/lê o percurso baixado (JSON por slug).
//   --falhar: sai com código 1 se houver rua sobre rua (fora de cruzamentos), o caminho do corredor sair do asfalto ou
//   faltar asfalto onde o pelotão espera atrás da largada.
//   --mapa 21K:9.4[:...]: grava uma imagem PPM de 120 m em volta de cada km (PX=0.5 para 240 m) na pasta do --cache.
//   DEPURAR=9.4: lista as células sobrepostas perto desse km; VIRADOS=1: lista os triângulos virados.
// Também mede o caminho do corredor: passo máximo entre pontos (salto) e trechos fora do asfalto desenhado.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PistaReal, direita } from '../src/pista.js';
import { posicaoEstendida, amostrasDoPercurso, planoFita, faixasAvenida, faixasComuns, amostrasAvenida } from '../src/faixas.js';
import { prepararOSM, pistasDuplas, viadutosDoPercurso } from '../src/osm.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM'; // chave pública (a mesma de src/conta.js)
// relevo como em PROVAS (src/main.js)
const RELEVO = { '9-maratona-sorocaba-novembro-azul-2026-11-21': 0 };
const PADRAO = ['9-maratona-sorocaba-novembro-azul-2026-11-21', '1-meia-maratona-de-indaiatuba-2026-12-13'];

const args = process.argv.slice(2);
const opt = (nome) => { const i = args.indexOf(nome); return i >= 0 ? args.splice(i, 2)[1] : null; };
const cache = opt('--cache');
const falhar = args.includes('--falhar');
const mapa = opt('--mapa'); // depuração: "21K:9.4" grava um PPM de 120 m em volta do km 9,4 do 21K (pasta do --cache)
const slugs = args.filter((a) => !a.startsWith('--'));
if (!slugs.length) slugs.push(...PADRAO);

async function baixar(slug) {
  const arq = cache && path.join(cache, `${slug}.json`);
  if (arq && fs.existsSync(arq)) return JSON.parse(fs.readFileSync(arq, 'utf8'));
  const url = `${SUPABASE_URL}/rest/v1/corridas?slug=eq.${slug}&select=nome,cidade,corrida_distancias(rotulo,km,percurso)`;
  const r = await fetch(url, { headers: { apikey: SUPABASE_KEY } }).catch((e) => {
    throw new Error(`não consegui baixar o percurso (${e.cause?.code || e.message}); atrás de proxy rode com NODE_USE_ENV_PROXY=1`);
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  const dados = await r.json();
  if (arq) { fs.mkdirSync(cache, { recursive: true }); fs.writeFileSync(arq, JSON.stringify(dados)); }
  return dados;
}

const CEL = 0.5; // grade de 0,5 m
const chave = (ix, iz) => (ix + 60000) * 200000 + (iz + 60000);
const RUAS = new Set(['rua', 'ruaFaixas', 'ruaOutra']);

// células (centros) cobertas por um triângulo
function rasterizar(ax, az, bx, bz, cx, cz, cb) {
  const area = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  if (Math.abs(area) < 1e-6) return;
  const x0 = Math.floor(Math.min(ax, bx, cx) / CEL), x1 = Math.floor(Math.max(ax, bx, cx) / CEL);
  const z0 = Math.floor(Math.min(az, bz, cz) / CEL), z1 = Math.floor(Math.max(az, bz, cz) / CEL);
  const sg = Math.sign(area);
  for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
    const px = (ix + 0.5) * CEL, pz = (iz + 0.5) * CEL;
    const w0 = ((bx - ax) * (pz - az) - (bz - az) * (px - ax)) * sg;
    const w1 = ((cx - bx) * (pz - bz) - (cz - bz) * (px - bx)) * sg;
    const w2 = ((ax - cx) * (pz - cz) - (az - cz) * (px - cx)) * sg;
    if (w0 > 0 && w1 > 0 && w2 > 0) cb(ix, iz);
  }
}

// percorre os triângulos de uma faixa (mesmos índices de fita() em main.js)
function triangulos(amostras, plano, cb) {
  const { xz, ativo } = plano;
  for (let i = 0; i < amostras.length - 1; i++) {
    if (!ativo[i]) continue;
    const a = i * 4, b = (i + 1) * 4;
    const v = [[xz[a], xz[a + 1]], [xz[a + 2], xz[a + 3]], [xz[b], xz[b + 1]], [xz[b + 2], xz[b + 3]]];
    const s = (amostras[i].s + amostras[i + 1].s) / 2, ang = amostras[i].ang, y = (amostras[i].y + amostras[i + 1].y) / 2;
    rasterizar(...v[0], ...v[1], ...v[2], (ix, iz) => cb(ix, iz, s, ang, y));
    rasterizar(...v[1], ...v[3], ...v[2], (ix, iz) => cb(ix, iz, s, ang, y));
  }
}

function analisar(pista, osm) {
  // viaduto (como em carregarOSM no jogo): o trecho de cima sobe 7 m
  const viadutos = osm ? viadutosDoPercurso(osm, pista) : [];
  if (viadutos.length) pista.elevar(viadutos, { altura: 7 });
  const amostras = amostrasDoPercurso(pista);
  const faixas = faixasComuns(!!osm).map(([d0, d1, tipo]) => ({ tipo, amostras, plano: planoFita(amostras, d0, d1) }));
  if (osm) {
    const ocupado = new Map();
    for (const t of pistasDuplas(osm, pista)) for (const sub of amostrasAvenida(t, amostras)) {
      for (const [f0, f1, tipo] of faixasAvenida(t, sub, pista, ocupado).lista) faixas.push({ tipo, amostras: sub, plano: planoFita(sub, f0, f1) });
    }
  }
  // 1) onde há rua (de qualquer trecho)
  const ruas = new Map();
  for (const f of faixas) {
    if (!RUAS.has(f.tipo)) continue;
    triangulos(f.amostras, f.plano, (ix, iz, s, ang, y) => {
      const k = chave(ix, iz);
      let l = ruas.get(k);
      if (!l) ruas.set(k, (l = []));
      for (let j = 0; j < l.length; j += 3) if (Math.abs(l[j] - s) < 30) return;
      l.push(s, ang, y);
    });
  }
  // 2) cada faixa contra a rua dos outros trechos (|Δs| > 60 m)
  const cats = {}; // categoria → Map(chave → [sRua, sOutro])
  const marcar = (cat, k, sRua, sOutro) => { (cats[cat] ||= new Map()).set(k, [sRua, sOutro]); };
  for (const f of faixas) {
    const grupo = RUAS.has(f.tipo) ? 'rua' : f.tipo === 'grama' ? 'grama' : 'calcada';
    triangulos(f.amostras, f.plano, (ix, iz, s, ang, y) => {
      const k = chave(ix, iz), l = ruas.get(k);
      if (!l) return;
      for (let j = 0; j < l.length; j += 3) {
        // mesmo trecho, logo antes/depois (retorno, curva fechada): só conta se a faixa "dobrou" para cima da rua
        if (Math.abs(l[j] - s) <= 60) {
          if (Math.abs(l[j] - s) > 12 && grupo === 'calcada' && Math.abs(l[j + 2] - y) < 3) marcar('dobra', k, l[j], s);
          continue;
        }
        // um em cima do outro com vão livre (viaduto): não é sobreposição
        if (Math.abs(l[j + 2] - y) > 3) { if (grupo === 'rua') marcar('viaduto', k, l[j], s); continue; }
        const cruz = Math.abs(Math.cos(l[j + 1] - ang)) < 0.5;
        marcar(`${grupo}${cruz ? ' (cruzamento)' : ''}`, k, l[j], s);
        if (process.env.DEPURAR && !cruz && Math.abs(s - Number(process.env.DEPURAR) * 1000) < 40) console.log('dep', f.tipo, s.toFixed(0), l[j].toFixed(0), ix * CEL, iz * CEL);
      }
    });
  }
  // 3) triângulo virado (faixa dobrada sobre si mesma numa esquina fechada): a placa de vídeo não desenha, vira buraco.
  // Na faixa d0 < d1 andando para a frente, (borda d0 em i, borda d1 em i, borda d0 em i+1) gira sempre do mesmo jeito.
  let virados = 0;
  for (const f of faixas) {
    if (!RUAS.has(f.tipo) && f.tipo !== 'calcada') continue;
    const { xz, ativo } = f.plano;
    for (let i = 0; i < f.amostras.length - 1; i++) {
      if (!ativo[i]) continue;
      const a = i * 4, b = (i + 1) * 4;
      const v = [[xz[a], xz[a + 1]], [xz[a + 2], xz[a + 3]], [xz[b], xz[b + 1]], [xz[b + 2], xz[b + 3]]];
      for (const [p, q, r] of [[v[0], v[1], v[2]], [v[1], v[3], v[2]]]) {
        const area = ((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) / 2;
        if (area > 0.01) { virados += area; if (process.env.VIRADOS) console.log('virado', f.tipo, f.amostras[i].s, area.toFixed(2)); }
      }
    }
  }
  // 4) o corredor anda sempre em cima de asfalto? (eixo do percurso, inclusive trechos repetidos, contra as ruas desenhadas)
  const foraDaRua = [];
  for (let i = 0; i < pista.s.length; i++) {
    const ix = Math.floor(pista.x[i] / CEL), iz = Math.floor(pista.z[i] / CEL);
    let ok = false;
    for (let a = -1; a <= 1 && !ok; a++) for (let b = -1; b <= 1 && !ok; b++) {
      const l = ruas.get(chave(ix + a, iz + b));
      if (l) for (let j = 0; j < l.length; j += 3) if (Math.abs(l[j + 2] - pista.y[i]) < 1.5) ok = true;
    }
    if (!ok) foraDaRua.push(pista.s[i]);
  }
  // 5) largada: o pelotão espera até ~20 m atrás do tapete, em toda a largura da rua (src/pelotao.js) — tem asfalto?
  const largadaSemRua = [];
  for (let s = -22; s <= 0; s += 1) for (let d = -3.4; d <= 3.41; d += 0.85) {
    const p = posicaoEstendida(pista, s), [rx, rz] = direita(p.ang);
    const ix = Math.floor((p.x + rx * d) / CEL), iz = Math.floor((p.z + rz * d) / CEL);
    let ok = false;
    for (let a = -1; a <= 1 && !ok; a++) for (let b = -1; b <= 1 && !ok; b++) if (ruas.get(chave(ix + a, iz + b))) ok = true;
    if (!ok) largadaSemRua.push(s);
  }
  return { cats, amostras, faixas, viadutos, foraDaRua, virados, largadaSemRua };
}

// imagem de 120 m x 120 m em volta do km: rua do trecho do km em cinza escuro, ruas de outros trechos em azul,
// calçada/guia/canteiro em bege (trecho do km) ou verde (outros), sobreposição de rua em vermelho, eixos em branco
function desenharMapa(pista, faixas, cats, km, arq) {
  const sC = km * 1000, c = pista.em(sC), PX = Number(process.env.PX || 0.25), N = 480;
  const img = Buffer.alloc(N * N * 3, 60);
  const pinta = (x, z, cor) => {
    const ix = Math.floor((x - c.x) / PX + N / 2), iz = Math.floor((z - c.z) / PX + N / 2);
    if (ix < 0 || iz < 0 || ix >= N || iz >= N) return;
    img.set(cor, (iz * N + ix) * 3);
  };
  const ordem = ['grama', 'calcada', 'calcadaLisa', 'guia', 'canteiro', 'rua', 'ruaFaixas', 'ruaOutra'];
  for (const tipo of ordem) for (const f of faixas.filter((q) => q.tipo === tipo)) {
    triangulos(f.amostras, f.plano, (ix, iz, s) => {
      const meu = Math.abs(s - sC) < 150, rua = RUAS.has(tipo);
      const cor = tipo === 'grama' ? [70, 120, 60] : rua ? (meu ? [110, 110, 110] : [60, 90, 200]) : (meu ? [210, 200, 170] : [120, 220, 120]);
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) pinta((ix + 0.25 + a * 0.5) * CEL, (iz + 0.25 + b * 0.5) * CEL, cor);
    });
  }
  for (const [cat, m] of Object.entries(cats)) {
    if (cat.startsWith('grama')) continue;
    for (const k of m.keys()) {
      const ix = Math.floor(k / 200000) - 60000, iz = (k % 200000) - 60000;
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) pinta((ix + 0.25 + a * 0.5) * CEL, (iz + 0.25 + b * 0.5) * CEL, cat.startsWith('rua') ? [255, 0, 0] : [255, 140, 0]);
    }
  }
  for (let i = 0; i < pista.s.length; i++) pinta(pista.x[i], pista.z[i], pista.dup[i] ? [255, 0, 255] : [255, 255, 255]);
  // seta do sentido no km
  for (let t = 0; t < 12; t += 0.2) pinta(c.x + Math.sin(c.ang) * t, c.z - Math.cos(c.ang) * t, [255, 255, 0]);
  fs.writeFileSync(arq, Buffer.concat([Buffer.from(`P6 ${N} ${N} 255\n`), img]));
}

function resumo(cats) {
  const linhas = [];
  const ordem = ['rua', 'calcada', 'dobra', 'grama', 'rua (cruzamento)', 'calcada (cruzamento)', 'grama (cruzamento)', 'viaduto'];
  const nomes = { rua: 'rua sobre rua', calcada: 'calçada/guia/canteiro sobre rua', grama: 'grama sob rua (escondida)', viaduto: 'viaduto (rua por cima de rua, vão livre)', dobra: 'calçada dobrada sobre a rua (retorno/curva)' };
  const res = {};
  for (const cat of ordem) {
    const m = cats[cat];
    const area = m ? m.size * CEL * CEL : 0;
    // metros do percurso afetados (faixas de 10 m em que a rua é invadida)
    const bins = new Map();
    if (m) for (const [sRua, sOutro] of m.values()) {
      const b = Math.floor(sRua / 10);
      const e = bins.get(b) || { area: 0, outro: [] };
      e.area += CEL * CEL; if (e.outro.length < 50) e.outro.push(sOutro);
      bins.set(b, e);
    }
    res[cat] = { area, metros: bins.size * 10 };
    const nome = nomes[cat.replace(' (cruzamento)', '')] + (cat.includes('cruz') ? ' em cruzamento' : '');
    if (cat === 'viaduto' && !bins.size) continue;
    linhas.push(`  ${nome.padEnd(44)} ${area.toFixed(1).padStart(8)} m²  em ${String(bins.size * 10).padStart(5)} m do percurso`);
    if (!cat.includes('cruz') && cat !== 'grama' && bins.size) {
      if (cat === 'viaduto') linhas[linhas.length - 1] += ' (esperado)';
      // piores pontos: trechos contínuos
      const ks = [...bins.keys()].sort((a, b) => a - b), grupos = [];
      for (const b of ks) {
        const g = grupos[grupos.length - 1];
        if (g && b - g.fim <= 3) { g.fim = b; g.area += bins.get(b).area; g.outro.push(...bins.get(b).outro); } else grupos.push({ ini: b, fim: b, area: bins.get(b).area, outro: [...bins.get(b).outro] });
      }
      grupos.sort((a, b) => b.area - a.area);
      for (const g of grupos.slice(0, 8)) {
        const om = g.outro.reduce((a, b) => a + b, 0) / g.outro.length;
        linhas.push(`      km ${(g.ini / 100).toFixed(2)}–${((g.fim + 1) / 100).toFixed(2)}: ${g.area.toFixed(1)} m² (outro trecho ~km ${(om / 1000).toFixed(2)})`);
      }
    }
  }
  return { texto: linhas.join('\n'), res };
}

// suavidade do caminho do corredor: maior virada em 5 m (graus) fora dos retornos
function suavidade(p) {
  let pior = 0, viradas = 0, salto = 0;
  for (let i = 0; i < p.s.length - 1; i++) salto = Math.max(salto, Math.hypot(p.x[i + 1] - p.x[i], p.z[i + 1] - p.z[i]) / Math.max(0.5, p.s[i + 1] - p.s[i]));
  for (let i = 2; i < p.s.length - 2; i++) {
    const a1 = Math.atan2(p.x[i] - p.x[i - 1], -(p.z[i] - p.z[i - 1])), a2 = Math.atan2(p.x[i + 1] - p.x[i], -(p.z[i + 1] - p.z[i]));
    const da = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1))) * 180 / Math.PI;
    if (da > 30) viradas++;
    else pior = Math.max(pior, da);
  }
  return { pior, viradas, salto };
}

let erro = false;
for (const slug of slugs) {
  const [c] = await baixar(slug);
  const arqOsm = path.join(RAIZ, 'public/osm', `${slug}.json`);
  const dadosOsm = fs.existsSync(arqOsm) ? JSON.parse(fs.readFileSync(arqOsm, 'utf8')) : null;
  for (const d of (c.corrida_distancias || []).filter((x) => Array.isArray(x.percurso) && x.percurso.length > 10).sort((a, b) => a.km - b.km)) {
    const t0 = Date.now();
    const pista = new PistaReal(d.percurso, { exagero: RELEVO[slug] ?? 1.6 });
    const osm = dadosOsm ? prepararOSM(dadosOsm, pista.paraLocal) : null;
    const { cats, faixas, viadutos, foraDaRua, virados, largadaSemRua } = analisar(pista, osm);
    if (mapa && mapa.split(':')[0].toUpperCase() === d.rotulo.toUpperCase()) {
      for (const km of mapa.split(':').slice(1)) {
        const arq = path.join(cache || '.', `mapa-${slug.split('-').slice(0, 3).join('-')}-${d.rotulo.toUpperCase()}-${km}.ppm`);
        desenharMapa(pista, faixas, cats, Number(km), arq);
        console.log('mapa:', arq);
      }
    }
    const { texto, res } = resumo(cats);
    const dup = pista.dup.reduce((a, b) => a + b, 0) * 5, sv = suavidade(pista);
    console.log(`\n${c.nome} · ${d.rotulo.toUpperCase()} · ${(pista.total / 1000).toFixed(2)} km · colado ${dup} m · virada máx ${sv.pior.toFixed(1)}°/5 m (+${sv.viradas} retornos) · passo máx ${sv.salto.toFixed(2)}x · ${Date.now() - t0} ms`);
    for (const v of viadutos) console.log(`  viaduto: km ${(v.s0 / 1000).toFixed(2)}–${(v.s1 / 1000).toFixed(2)} por cima do percurso no km ${v.sob.map((x) => (x / 1000).toFixed(2)).join(', ')}`);
    console.log(texto);
    const fr = foraDaRua.length ? ` (km ${[...new Set(foraDaRua.map((v) => (v / 1000).toFixed(2)))].slice(0, 12).join(', ')})` : '';
    console.log(`  caminho do corredor fora do asfalto desenhado    ${String(foraDaRua.length * 5).padStart(5)} m${fr}`);
    if (foraDaRua.length) erro = true;
    const lg = largadaSemRua.length ? ` (s ${[...new Set(largadaSemRua)].slice(0, 8).join(', ')} m)` : '';
    console.log(`  área do pelotão atrás da largada sem asfalto    ${String(largadaSemRua.length).padStart(5)} pontos${lg}`);
    if (largadaSemRua.length) erro = true;
    console.log(`  rua/calçada dobrada (triângulo virado = buraco)  ${virados.toFixed(1).padStart(8)} m²`);
    if (res.rua.area > 0) erro = true;
  }
}
if (falhar && erro) process.exit(1);
