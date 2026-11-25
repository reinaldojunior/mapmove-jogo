// Banco de testes da nova arquitetura de percursos: grafo OSM exportado e casos sintéticos com resposta conhecida
// (etapa 1), map matching e elevação nos casos sintéticos e reais (etapa 2). Nada aqui é usado pelo jogo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { carregarGrafo, validarGrafo, projecao } from '../scripts/percurso/grafo.mjs';
import { cidadeDeTeste, CASOS, gerarGps, comprimento, ORIGEM, terreno } from '../scripts/percurso/sinteticos.mjs';
import { casar, passagensPorNome, afastamento } from '../scripts/percurso/matching.mjs';

const ler = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const REAIS = ['9-maratona-sorocaba-novembro-azul-2026-11-21', '1-meia-maratona-de-indaiatuba-2026-12-13'];

// ─── grafo sintético ───────────────────────────────────────────────────────────────────────────────────────────
test('cidade de teste: grafo válido, cortado nas junções, com mão única, ponte, túnel e balão', () => {
  const dados = cidadeDeTeste();
  assert.deepEqual(validarGrafo(dados), []);
  const g = carregarGrafo(dados, { origem: ORIGEM });
  const av = g.arestas.filter((a) => a.nome === 'Avenida Dupla');
  assert.ok(av.some((a) => a.mao === 'ida') && av.some((a) => a.mao === 'volta'));
  const viaduto = g.arestas.find((a) => a.ponte), tunel = g.arestas.find((a) => a.tunel);
  assert.equal(viaduto.camada, 1); assert.equal(tunel.camada, -1);
  // o viaduto atravessa a rua x=300 sem nó em comum (cruza por cima, não liga)
  const x300 = g.arestas.find((a) => a.nome === 'Rua X300' && a.nos.includes('n300_0'));
  assert.ok(!viaduto.nos.some((n) => x300.nos.includes(n) && n !== 'n0_0'));
  assert.ok([...g.nos.values()].some((n) => n.info?.retorno));
});

test('consulta espacial: ponto entre as duas pistas da avenida acha as duas, com direções opostas', () => {
  const g = carregarGrafo(cidadeDeTeste(), { origem: ORIGEM });
  const perto = g.proximas(225, 300, 10).filter((c) => c.aresta.nome === 'Avenida Dupla');
  assert.equal(perto.length, 2);
  assert.ok(Math.abs(perto[0].dist - 7) < 0.01 && Math.abs(perto[1].dist - 7) < 0.01);
  assert.ok(perto[0].dir[0] * perto[1].dir[0] > 0); // mesma geometria leste-oeste; o sentido permitido é que difere
  const ida = perto.find((c) => c.aresta.mao === 'ida').aresta, volta = perto.find((c) => c.aresta.mao === 'volta').aresta;
  assert.ok(g.permite(ida, 1) && !g.permite(ida, -1) && g.permite(volta, -1) && !g.permite(volta, 1));
});

// ─── casos sintéticos ──────────────────────────────────────────────────────────────────────────────────────────
test('todo caso sintético anda só por ruas da cidade de teste (menos o trecho do parque, de propósito)', () => {
  const g = carregarGrafo(cidadeDeTeste(), { origem: ORIGEM });
  for (const [nome, caso] of Object.entries(CASOS)) {
    const rota = caso.rota || CASOS[caso.base].rota;
    for (let i = 0; i < rota.length - 1; i++) {
      const [ax, ay] = rota[i], [bx, by] = rota[i + 1], L = Math.hypot(bx - ax, by - ay);
      for (let d = 5; d < L - 5; d += 10) {
        const x = ax + ((bx - ax) * d) / L, y = ay + ((by - ay) * d) / L, perto = g.proximas(x, y, 1).length > 0;
        const noParque = nome === 'rua-faltando' && ax === 450 && ay === 450;
        assert.equal(perto, !noParque, `${nome}: (${x.toFixed(0)}, ${y.toFixed(0)})`);
      }
    }
  }
});

test('GPS sintético: determinístico, com o espaçamento e o ruído pedidos', () => {
  assert.deepEqual(gerarGps('circuito-2-voltas'), gerarGps('circuito-2-voltas'));
  const P = projecao(...ORIGEM), rota = CASOS['circuito-2-voltas'].rota;
  const gps = gerarGps('circuito-2-voltas', { passo: 20, sigma: 5 });
  assert.ok(Math.abs(gps.length - comprimento(rota) / 20) < 3);
  // erro médio em relação à rota verdadeira ≈ sigma·√(π/2) para o desvio lateral (~6 m com sigma 5)
  const g = carregarGrafo(cidadeDeTeste(), { origem: ORIGEM });
  const erros = gps.map(([la, lo]) => { const { x, y } = P.paraXY(la, lo); return g.proximas(x, y, 60)[0]?.dist ?? 60; });
  const media = erros.reduce((a, b) => a + b, 0) / erros.length;
  assert.ok(media > 2 && media < 7, `erro médio ${media.toFixed(1)} m`);
});

test('GPS sintético: túnel sem pontos, ponte com altitude do tabuleiro, saltos de 40 m', () => {
  const P = projecao(...ORIGEM);
  const xy = (gps) => gps.map(([la, lo, alt]) => ({ ...P.paraXY(la, lo), alt }));
  const tunel = xy(gerarGps('tunel-sem-gps', { sigma: 0 }));
  assert.ok(!tunel.some((p) => Math.abs(p.x - 525) < 3 && p.y > 265 && p.y < 335));
  const ponte = xy(gerarGps('viaduto-sobre-o-percurso', { sigma: 0, semente: 1 }));
  // os primeiros pontos sobem o viaduto (tabuleiro ~7 m acima do terreno); os que passam por baixo, na rua x=300,
  // ficam no chão mesmo estando no mesmo x,y do viaduto
  const subindo = ponte.filter((p) => Math.abs(p.y - p.x / 4) < 1 && p.x > 150 && p.x < 450 && Math.abs(p.x - 300) > 5);
  assert.ok(subindo.length > 5);
  const media = (l) => l.reduce((acc, p) => acc + p.alt - terreno(p.x, p.y), 0) / l.length;
  assert.ok(media(subindo) > 5, `na ponte o GPS mede o tabuleiro (${media(subindo).toFixed(1)} m acima do terreno)`);
  const porBaixo = ponte.filter((p) => Math.abs(p.x - 300) < 1 && Math.abs(p.y - 75) < 15);
  assert.ok(porBaixo.length > 0);
  for (const p of porBaixo) assert.ok(Math.abs(p.alt - terreno(p.x, p.y)) < 7, 'por baixo do viaduto o GPS está no chão');
  const saltos = xy(gerarGps('gps-com-saltos', { sigma: 0 }));
  const g = carregarGrafo(cidadeDeTeste(), { origem: ORIGEM });
  const longe = saltos.filter((p) => (g.proximas(p.x, p.y, 60)[0]?.dist ?? 60) > 25).length;
  assert.ok(longe >= 5, `${longe} saltos`);
});

test('caso "curva-cortada": GPS a cada 100 m corta as esquinas (é o problema que o matching resolve)', () => {
  const P = projecao(...ORIGEM), gps = gerarGps('curva-cortada-gps-espacado', { sigma: 0 });
  let L = 0;
  for (let i = 1; i < gps.length; i++) { const a = P.paraXY(gps[i - 1][0], gps[i - 1][1]), b = P.paraXY(gps[i][0], gps[i][1]); L += Math.hypot(b.x - a.x, b.y - a.y); }
  assert.ok(L < comprimento(CASOS['curva-cortada-gps-espacado'].rota) - 20, `GPS ${L.toFixed(0)} m`);
});

// ─── casos reais ───────────────────────────────────────────────────────────────────────────────────────────────
for (const slug of REAIS) {
  test(`grafo real (${slug.slice(0, 22)}…): válido, conexo no corredor e cobrindo o GPS`, () => {
    const dados = ler(`../dados/grafos/${slug}.json`);
    assert.deepEqual(validarGrafo(dados), []);
    const r = dados.resumo;
    assert.ok(r.maiorComponente / r.nos > 0.9, 'quase tudo numa componente só');
    for (const [rot, c] of Object.entries(r.cobertura)) {
      assert.ok(c.ate20m >= 99, `${rot}: só ${c.ate20m}% do GPS a até 20 m de uma rua`);
      assert.equal(c.trechosSemRuaKm.length, 0, `${rot}: trechos sem rua`);
    }
    // o GPS guardado para os testes é o mesmo que gerou o grafo
    const perc = ler(`../dados/percursos/${slug}.json`);
    assert.deepEqual(perc.distancias.map((d) => d.rotulo).sort(), Object.keys(r.cobertura).sort());
  });
}

test('Sorocaba: a ponte Dom José Melhado Campos está no grafo como ponte de camada 1', () => {
  const dados = ler('../dados/grafos/9-maratona-sorocaba-novembro-azul-2026-11-21.json');
  const ponte = dados.arestas.filter((a) => /Melhado Campos/.test(a.nome || ''));
  assert.ok(ponte.length > 0);
  assert.ok(ponte.every((a) => a.ponte && a.camada >= 1));
});

// ─── etapa 2: map matching ─────────────────────────────────────────────────────────────────────────────────────
const gSint = carregarGrafo(cidadeDeTeste(), { origem: ORIGEM });
const rotaDe = (nome) => (CASOS[nome].rota || CASOS[CASOS[nome].base].rota).map(([x, y]) => ({ x, y }));
const casos = {};
const sint = (nome, opcoesGps) => {
  const k = nome + JSON.stringify(opcoesGps || {});
  if (!casos[k]) casos[k] = casar(gSint, gerarGps(nome, opcoesGps));
  return casos[k];
};
const contramao = (g, r) => r.passagens.filter((p) => !p.semCasamento && !g.permite(g.porId.get(p.aresta), p.sent));
// afastamento máximo: traçado → rota verdadeira (nada inventado) e rota → traçado (nada cortado), com tolerância
const confere = (nome, r, { inventa = 1, corta = 1, comp = 5 } = {}) => {
  const rota = rotaDe(nome);
  assert.ok(afastamento(r.linha, rota).max <= inventa, `${nome}: traçado sai da rota ${afastamento(r.linha, rota).max.toFixed(1)} m`);
  assert.ok(afastamento(rota, r.linha).max <= corta, `${nome}: rota cortada ${afastamento(rota, r.linha).max.toFixed(1)} m`);
  const L = comprimento(CASOS[nome].rota || CASOS[CASOS[nome].base].rota);
  assert.ok(Math.abs(r.comprimento - L) <= comp, `${nome}: ${r.comprimento.toFixed(0)} × ${L.toFixed(0)} m`);
};
// sequência: as passagens seguem a ordem do GPS (nunca voltam no índice) e o km só cresce
const sequencia = (r) => {
  for (let i = 1; i < r.passagens.length; i++) {
    assert.ok(r.passagens[i].gpsDe >= r.passagens[i - 1].gpsDe, `ordem do GPS na passagem ${i}`);
    assert.ok(r.passagens[i].sDe >= r.passagens[i - 1].sDe - 0.01, `km na passagem ${i}`);
  }
  for (let i = 1; i < r.linha.length; i++) assert.ok(r.linha[i].s >= r.linha[i - 1].s);
};

test('matching · circuito com 2 voltas: cada rua 2 vezes, no mesmo sentido, sem retorno', () => {
  const r = sint('circuito-2-voltas');
  confere('circuito-2-voltas', r); sequencia(r);
  assert.equal(r.retornos.length, 0); assert.equal(r.semCasamento.length, 0);
  for (const v of Object.values(r.passagensPorAresta)) { assert.equal(v.length, 2); assert.equal(v[0], v[1]); }
});

test('matching · ida e volta pela mesma rua: um retorno no meio, sentidos opostos', () => {
  const r = sint('ida-e-volta-mesma-rua');
  confere('ida-e-volta-mesma-rua', r);
  assert.deepEqual(r.retornos.map((x) => x.tipo), ['meio']);
  for (const v of Object.values(r.passagensPorAresta)) if (v.length > 1) assert.ok(v.includes(1) && v.includes(-1));
});

test('matching · retorno com GPS espaçado (~75 m): a ponta do retorno não é tratada como salto', () => {
  const r = sint('ida-e-volta-mesma-rua', { passo: 75 });
  assert.equal(r.descartados.length, 0);
  assert.deepEqual(r.retornos.map((x) => x.tipo), ['meio']);
  assert.ok(r.comprimento > 750 - 80, `${r.comprimento.toFixed(0)} m (perde no máximo um espaçamento na ponta)`);
});

test('matching · avenida de pista dupla: ida numa pista, volta na outra, nunca na contramão', () => {
  const r = sint('avenida-dupla-ida-e-volta');
  confere('avenida-dupla-ida-e-volta', r);
  assert.equal(contramao(gSint, r).length, 0); assert.equal(r.retornos.length, 0);
  const pistas = new Set(r.passagens.filter((p) => p.nome === 'Avenida Dupla').map((p) => gSint.porId.get(p.aresta).mao));
  assert.deepEqual([...pistas].sort(), ['ida', 'volta']);
});

test('matching · cruzamento em X: passa reto pelo cruzamento duas vezes, sem retorno', () => {
  const r = sint('cruzamento-em-x');
  confere('cruzamento-em-x', r); sequencia(r);
  assert.equal(r.retornos.length, 0);
});

test('matching · largada dentro do retorno: sequência preservada (limitação: ponta até 1 espaçamento curta)', () => {
  const r = sint('largada-dentro-do-retorno');
  confere('largada-dentro-do-retorno', r, { corta: 20, comp: 35 }); sequencia(r);
  assert.deepEqual(r.retornos.map((x) => x.tipo), ['meio']);
});

test('matching · viaduto sobre o percurso: sobe o viaduto e depois passa por baixo, sem trocar de nível', () => {
  const r = sint('viaduto-sobre-o-percurso');
  confere('viaduto-sobre-o-percurso', r); sequencia(r);
  assert.equal(passagensPorNome(r).Viaduto, 1);
  // entre duas passagens seguidas, a troca de aresta é sempre por nó comum (nunca "pula" do viaduto para a rua de baixo)
  const casadas = r.passagens.filter((p) => !p.semCasamento);
  for (let i = 1; i < casadas.length; i++) {
    const a = gSint.porId.get(casadas[i - 1].aresta), b = gSint.porId.get(casadas[i].aresta);
    if (a === b) continue;
    assert.ok([a.de, a.para].some((n) => n === b.de || n === b.para), `${a.nome} → ${b.nome} sem nó comum`);
  }
});

test('matching · túnel sem GPS: atravessa o túnel pelo grafo (sem fallback)', () => {
  const r = sint('tunel-sem-gps');
  confere('tunel-sem-gps', r, { inventa: 3 });
  assert.equal(passagensPorNome(r)['Túnel'], 1); assert.equal(r.semCasamento.length, 0);
});

test('matching · GPS com saltos: saltos descartados, resultado igual ao circuito limpo', () => {
  const r = sint('gps-com-saltos');
  confere('gps-com-saltos', r);
  assert.ok(r.descartados.length >= 5);
  assert.deepEqual(passagensPorNome(r), passagensPorNome(sint('circuito-2-voltas')));
});

test('matching · rua que falta no mapa: vira trecho sem casamento (fallback), sem ligação inventada', () => {
  const r = sint('rua-faltando');
  assert.equal(r.semCasamento.length, 1);
  confere('rua-faltando', r, { inventa: 20, comp: 25 }); // limitação: ~19 m emprestados da rua X450 na borda
  // o desvio pelas ruas que existem (bem mais longo) não é usado
  assert.ok(r.comprimento < comprimento(CASOS['rua-faltando'].rota) + 25);
});

test('matching · curva cortada (GPS a cada 100 m): o traçado segue as esquinas das ruas', () => {
  const r = sint('curva-cortada-gps-espacado');
  confere('curva-cortada-gps-espacado', r, { corta: 12, comp: 12 });
});

test('matching · rua sem saída com balão: retorno no fim da rua, sem custo de retorno proibido', () => {
  const r = sint('sem-saida-com-balao');
  confere('sem-saida-com-balao', r);
  assert.deepEqual(r.retornos.map((x) => x.tipo), ['no-beco']);
});

// casos reais: o casamento roda aqui mesmo (≈0,2 s por distância) e compara com o que foi conferido nas imagens
const SORO = '9-maratona-sorocaba-novembro-azul-2026-11-21', INDA = '1-meia-maratona-de-indaiatuba-2026-12-13';
const real = {};
const casarReal = (slug, rot) => {
  const k = slug + rot;
  if (!real[k]) {
    const g = carregarGrafo(ler(`../dados/grafos/${slug}.json`));
    const d = ler(`../dados/percursos/${slug}.json`).distancias.find((x) => x.rotulo === rot);
    real[k] = { g, r: casar(g, d.percurso), d };
  }
  return real[k];
};
const casadas = (r) => r.passagens.filter((p) => !p.semCasamento);

test('matching · Sorocaba 42K: largada nas duas pistas certas da Av. Dr. Artur Bernardes, iguais nas 2 voltas', () => {
  const { g, r } = casarReal(SORO, '42K');
  sequencia(r);
  const trecho = (de, ate) => casadas(r).filter((p) => p.sDe >= de && p.sAte <= ate && /Artur Bernardes/.test(p.nome || ''));
  const v1 = trecho(0, 1400), v2 = trecho(21100, 22500);
  assert.ok(v1.length > 10 && v2.length > 10);
  for (const p of [...v1, ...v2]) assert.ok(g.permite(g.porId.get(p.aresta), p.sent), `contramão em ${p.aresta}`);
  // a pista de mão única (ida) é usada nas duas voltas, nas mesmas arestas e no mesmo sentido
  const ida = (l) => l.filter((p) => g.porId.get(p.aresta).mao === 'ida').map((p) => p.aresta + p.sent);
  assert.ok(ida(v1).length > 10);
  const comum = ida(v1).filter((x) => ida(v2).includes(x));
  assert.ok(comum.length >= ida(v1).length - 3, `${comum.length} de ${ida(v1).length}`);
});

test('matching · Sorocaba 42K: 2 voltas, ponte 2 vezes na camada 1, avenida do km 2,6 uma vez por volta em cada pista', () => {
  const { g, r, d } = casarReal(SORO, '42K');
  const ponte = casadas(r).filter((p) => /Melhado Campos/.test(p.nome || ''));
  const passagensPonte = ponte.filter((p, i) => i === 0 || p.sDe - ponte[i - 1].sAte > 500);
  assert.equal(passagensPonte.length, 2);
  assert.ok(ponte.every((p) => p.camada >= 1 && p.ponte));
  // Av. Dom Aguirre (km 2,5 / 14,5 / 23,1 / 35,0): pista dupla no OSM → cada aresta 2 vezes, sempre no sentido permitido
  for (const km of [2.5, 14.5, 23.1, 35.0]) {
    const p = casadas(r).find((q) => q.sDe <= km * 1000 && q.sAte >= km * 1000);
    assert.match(p.nome, /Dom Aguirre/);
    assert.deepEqual(r.passagensPorAresta[p.aresta], [p.sent, p.sent]);
    assert.ok(g.permite(g.porId.get(p.aresta), p.sent));
  }
  assert.ok(Math.abs(r.comprimento / 1000 - d.kmOficial) / d.kmOficial < 0.03);
  assert.ok(r.semCasamento.length <= 2 && r.passagens.filter((p) => p.semCasamento).every((p) => p.sAte - p.sDe < 250));
});

test('matching · Sorocaba 21K: sequência e retorno da Alameda CIESP preservados; ligação da ponte que falta vai para o fallback', () => {
  const { r } = casarReal(SORO, '21K');
  sequencia(r);
  assert.equal(r.retornos.length, 1);
  assert.match(r.passagens.find((p) => p.aresta === r.retornos[0].aresta).nome, /CIESP/);
  const fb = r.passagens.filter((p) => p.semCasamento);
  assert.equal(fb.length, 1);
  assert.ok(fb[0].sAte - fb[0].sDe < 150 && fb[0].sDe > 19500 && fb[0].sDe < 20000);
  // o desvio inventado pela Alameda SENAI perto da ponte (antes +440 m, km 19,9) não volta; a passagem real pela
  // Alameda SENAI é antes, no km 18,9
  assert.ok(!casadas(r).some((p) => /SENAI/.test(p.nome || '') && p.sDe > 19500));
  assert.ok(r.comprimento / 1000 > 21.0 && r.comprimento / 1000 < 21.3);
});

for (const rot of ['6K', '10K', '21K']) {
  test(`matching · Indaiatuba ${rot} (controle, GPS já colado nas ruas): 100% casado, igual ao GPS`, () => {
    const { r, d } = casarReal(INDA, rot);
    sequencia(r);
    assert.equal(r.semCasamento.length, 0);
    const P = carregarGrafo(ler(`../dados/grafos/${INDA}.json`)).projecao;
    const gps = d.percurso.map(([la, lo]) => P.paraXY(la, lo));
    const af = afastamento(gps, r.linha);
    assert.ok(af.media < 2 && af.max < 5, `GPS → traçado médio ${af.media.toFixed(1)} m, máx ${af.max.toFixed(1)} m`);
    let L = 0; for (let i = 1; i < gps.length; i++) L += Math.hypot(gps[i].x - gps[i - 1].x, gps[i].y - gps[i - 1].y);
    assert.ok(Math.abs(r.comprimento - L) / L < 0.01);
  });
}

test('distâncias · oficial, GPS, jogo hoje e geométrica separadas; o jogo não usa nada da etapa 2', () => {
  for (const slug of REAIS) {
    const c = ler(`../dados/casados/${slug}.json`);
    for (const x of Object.values(c.distancias)) {
      assert.deepEqual(Object.keys(x.distancias).sort(), ['geometricaKm', 'gpsKm', 'jogoHojeKm', 'oficialKm']);
      for (const v of Object.values(x.distancias)) assert.equal(typeof v, 'number');
    }
  }
  // nenhum arquivo do jogo lê os dados ou scripts da etapa 2 (recordes e resultados continuam como estão)
  for (const arq of fs.readdirSync(new URL('../src/', import.meta.url))) {
    const txt = fs.readFileSync(new URL(`../src/${arq}`, import.meta.url), 'utf8');
    assert.ok(!/dados\/(casados|elevacao|grafos)|scripts\/percurso/.test(txt), `src/${arq}`);
  }
});

test('elevação · três séries separadas; Indaiatuba 21K marcado como altitude do GPS incoerente, sem correção', () => {
  const so = ler(`../dados/elevacao/${SORO}.json`), ind = ler(`../dados/elevacao/${INDA}.json`);
  for (const e of [...Object.values(so.distancias), ...Object.values(ind.distancias)]) {
    const s = e.serie[0];
    assert.ok('gps' in s && 'terreno' in s && 'terrenoBruto' in s && 'alturaEstrutura' in s);
  }
  assert.equal(ind.distancias['21K'].resumo.altitudeGpsCoerente, false);
  for (const rot of ['6K', '10K']) assert.equal(ind.distancias[rot].resumo.altitudeGpsCoerente, true);
  for (const rot of ['21K', '42K']) assert.equal(so.distancias[rot].resumo.altitudeGpsCoerente, true);
  // a série do GPS continua sendo a do Portal (não foi trocada pelo terreno)
  const gps21 = ler(`../dados/percursos/${INDA}.json`).distancias.find((d) => d.rotulo === '21K').percurso.map((p) => p[2]);
  const serie = ind.distancias['21K'].serie.map((s) => s.gps);
  assert.ok(Math.abs(Math.max(...serie) - Math.max(...gps21)) < 1 && Math.abs(Math.min(...serie) - Math.min(...gps21)) < 1);
  // ponte Dom José: altura da estrutura sobre o terreno embaixo medida separadamente
  assert.ok(so.distancias['21K'].pontes.some((p) => /Melhado/.test(p.nome) && p.alturaMaxM > 3));
});
