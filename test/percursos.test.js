// Banco de testes da nova arquitetura de percursos (etapa 1): grafo OSM exportado, casos sintéticos com resposta
// conhecida e casos reais. Os testes do map matching (etapa 2) já estão descritos como `todo`: viram testes de
// verdade quando o matching existir. Nada aqui é usado pelo jogo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { carregarGrafo, validarGrafo, projecao } from '../scripts/percurso/grafo.mjs';
import { cidadeDeTeste, CASOS, gerarGps, comprimento, ORIGEM, terreno } from '../scripts/percurso/sinteticos.mjs';

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

// ─── etapa 2 (map matching): o que terá que passar ─────────────────────────────────────────────────────────────
for (const [nome, caso] of Object.entries(CASOS)) test.todo(`matching · ${nome}: ${caso.descricao}`);
test.todo('matching · Sorocaba 42K: avenida do km 2,6 com 4 passagens de sentidos alternados (esperado.json)');
test.todo('matching · Sorocaba 42K: 2 voltas do circuito do 21K, ponte passada 2 vezes na camada 1');
test.todo('matching · Sorocaba 42K: largada dentro do retorno, 4 passagens distintas perto da largada');
test.todo('matching · Indaiatuba (GPS já colado nas ruas): resultado igual ao GPS, sem piorar nada');
test.todo('distâncias · oficial, geométrica e percorrida separadas; recordes nunca recalculados sozinhos');
