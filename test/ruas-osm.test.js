// Etapa 4a: novo desenho das ruas (só dados; o jogo ainda não usa). Geometria e regras da corrida.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { larguraAresta, poligonoTriangulos, faixaTriangulos, cruzamentos, montarRede, densificar } from '../scripts/percurso/ruas-geometria.mjs';
import { desenharDistancia } from '../scripts/percurso/exportar-ruas.mjs';

const area = (t) => Math.abs((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1])) / 2;

test('largura: OSM width > lanes × 3,3 m > padrão da categoria', () => {
  assert.deepEqual(larguraAresta({ tipo: 'primary', largura: 12, faixas: 2, mao: 'ida' }), { w: 12, fonte: 'OSM width' });
  assert.equal(larguraAresta({ tipo: 'primary', faixas: 3, mao: 'ida' }).w.toFixed(1), '9.9');
  assert.equal(larguraAresta({ tipo: 'residential', mao: 'dupla' }).fonte, 'padrão da categoria');
  assert.equal(larguraAresta({ tipo: 'cycleway', largura: 1.5 }).w, 2.5);
});

test('triangulação: polígono côncavo preenchido sem sobrar nem passar', () => {
  const L = [[0, 0], [10, 0], [10, 10], [5, 4], [0, 10]];
  const tri = poligonoTriangulos(L);
  assert.equal(tri.length, 3);
  assert.ok(Math.abs(tri.reduce((s, t) => s + area(t), 0) - 70) < 1e-6);
  const f = faixaTriangulos(densificar([[0, 0], [20, 0], [20, 20]], 4), -3, 3);
  assert.ok(f.every((t) => area(t) > 0.01));
});

test('cruzamento em X: um polígono só, as quatro pontas recortadas', () => {
  const grafo = { nos: { c: [0, 0], n: [0.001, 0], s: [-0.001, 0], l: [0, 0.001], o: [0, -0.001] }, arestas: [
    { id: 'a', nos: ['c', 'n'], tipo: 'residential', mao: 'dupla' }, { id: 'b', nos: ['c', 's'], tipo: 'residential', mao: 'dupla' },
    { id: 'c1', nos: ['c', 'l'], tipo: 'primary', mao: 'dupla', faixas: 2 }, { id: 'd', nos: ['c', 'o'], tipo: 'primary', mao: 'dupla', faixas: 2 }] };
  const conv = (la, lo) => ({ x: lo * 100000, z: -la * 100000 });
  const rede = montarRede(grafo, conv, new Set(['a', 'b', 'c1', 'd']));
  const { polis, recorte } = cruzamentos(rede);
  assert.equal(polis.length, 1);
  assert.ok(recorte.every(([r0, r1]) => r0 > 2 || r1 > 2));
  assert.ok(poligonoTriangulos(polis[0].pol).reduce((s, t) => s + area(t), 0) > 40);
});

test('Indaiatuba 6K: faixa do corredor (±4 m) e calçada (±7,6 m) 100% cobertas; pintura fora da contagem', () => {
  const r = desenharDistancia('1-meia-maratona-de-indaiatuba-2026-12-13', '6K');
  assert.equal(r.resumo.cobertura.depois.faltaAsfaltoPontos, 0);
  assert.equal(r.resumo.cobertura.depois.faltaCalcadaPontos, 0);
  assert.equal(r.resumo.degraus, 0);
  assert.ok(r.resumo.triangulos.novoMalha <= r.resumo.triangulos.atualFaixas * 1.15);
});

test('as cinco distâncias (resultado gravado): cobertura total, alargamentos listados, ponte Dom José no viaduto', () => {
  for (const [slug, rots] of [['9-maratona-sorocaba-novembro-azul-2026-11-21', ['21K', '42K']], ['1-meia-maratona-de-indaiatuba-2026-12-13', ['6K', '10K', '21K']]]) {
    for (const rot of rots) {
      const d = JSON.parse(fs.readFileSync(new URL(`../dados/ruas/${slug}/${rot}.json`, import.meta.url)));
      assert.equal(d.resumo.cobertura.depois.faltaAsfaltoPontos, 0, `${rot} asfalto`);
      assert.equal(d.resumo.cobertura.depois.faltaCalcadaPontos, 0, `${rot} calçada`);
      assert.ok(d.alargamentos.every((a) => a.km && a.motivo), 'todo alargamento tem km e motivo');
      assert.ok(d.resumo.ruasAlargadas.every((a) => a.larguraRealM < a.desenhadaM));
      assert.ok(d.resumo.triangulos.novoMalha <= d.resumo.triangulos.atualFaixas * 1.15, `${rot} triângulos`);
      if (slug.startsWith('9-')) {
        assert.equal(d.resumo.pontesOsmNoPercurso.find((p) => /Melhado/.test(p.nome)).noTrechoElevado, 1);
        assert.ok(d.resumo.vaoLivreMinM >= 5.5, `${rot} vão livre`);
      }
    }
  }
});

test('etapa 4a não mexe no jogo: src/ e public/ não usam o desenho novo', () => {
  for (const arq of fs.readdirSync(new URL('../src/', import.meta.url))) {
    const txt = fs.readFileSync(new URL(`../src/${arq}`, import.meta.url), 'utf8');
    assert.ok(!/ruas-geometria|exportar-ruas|dados\/ruas|public\/ruas|\/ruas\//.test(txt), `src/${arq}`);
  }
  assert.ok(!fs.existsSync(new URL('../public/ruas', import.meta.url)));
});
