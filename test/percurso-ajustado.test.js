// Etapa 3: percurso ajustado ao OSM integrado à corrida em modo de teste (src/percursoAjustado.js).
// Confere a chave liga/desliga, a volta ao percurso anterior em qualquer falha, e compara a pista de hoje com a
// ajustada nas cinco distâncias (distância, eixo, projeção, corrida simulada, retornos, postos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { modoPercurso, aplicarPercursoAjustado, percursoValido, sufixo, JANELA, CHAVE_MODO } from '../src/percursoAjustado.js';
import { PistaReal } from '../src/pista.js';
import { refinarDistancias } from '../src/refino.js';
import { comparar, PROVAS } from '../scripts/percurso/comparar-pistas.mjs';

const ler = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const memoria = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };

test('chave: desligado por padrão; ?percurso=ajustado liga e fica lembrado; ?percurso=gps desliga', () => {
  const st = memoria();
  assert.equal(modoPercurso('', st), 'gps');
  assert.equal(modoPercurso('?percurso=ajustado', st), 'ajustado');
  assert.equal(st.m.get(CHAVE_MODO), 'ajustado');
  assert.equal(modoPercurso('', st), 'ajustado');
  assert.equal(modoPercurso('?x=1&percurso=gps', st), 'gps');
  assert.equal(modoPercurso('', st), 'gps');
  assert.equal(modoPercurso('?percurso=qualquer', st), 'gps');
  assert.equal(modoPercurso('', { getItem() { throw new Error('bloqueado'); } }), 'gps');
});

const DIST = [{ rotulo: '21K', km: 21.1, percurso: [[0, 0, 1]] }, { rotulo: '42K', km: 42.2, percurso: [[0, 0, 2]] }];
const SORO = '9-maratona-sorocaba-novembro-azul-2026-11-21';
const arquivo = ler(`../public/percursos/${SORO}.json`);
const resp = (corpo, ok = true) => async () => ({ ok, json: async () => corpo });

test('qualquer falha deixa a distância como estava (sem arquivo, erro de rede, rótulo faltando, percurso inválido)', async () => {
  assert.equal(await aplicarPercursoAjustado(SORO, DIST, resp(null, false)), DIST);
  assert.equal(await aplicarPercursoAjustado(SORO, DIST, async () => { throw new Error('rede'); }), DIST);
  const so21 = { ...arquivo, distancias: { '21K': arquivo.distancias['21K'] } };
  const r = await aplicarPercursoAjustado(SORO, DIST, resp(so21));
  assert.ok(r[0].ajustado && r[0].percurso === so21.distancias['21K'].percurso && r[0].percursoGps === DIST[0].percurso);
  assert.equal(r[1], DIST[1]); // 42K sem arquivo: o de antes
  // buraco de 500 m no meio do percurso: recusado
  const p = arquivo.distancias['21K'].percurso.map((q) => [...q]); p[100][0] += 0.005;
  assert.equal(percursoValido(p), false);
  const ruim = { ...arquivo, distancias: { '21K': { ...arquivo.distancias['21K'], percurso: p } } };
  assert.equal((await aplicarPercursoAjustado(SORO, DIST, resp(ruim)))[0], DIST[0]);
  assert.equal(sufixo(r[0]), '-ajustado'); assert.equal(sufixo(r[1]), '');
});

test('o arquivo do jogo é o resultado da etapa 2 sem esticar: distância geométrica, fallback e altitude do Portal', () => {
  for (const { slug } of PROVAS) {
    const a = ler(`../public/percursos/${slug}.json`), c = ler(`../dados/casados/${slug}.json`);
    for (const [rot, d] of Object.entries(a.distancias)) {
      assert.ok(percursoValido(d.percurso), `${rot}`);
      assert.equal(d.kmGeometrico, c.distancias[rot].distancias.geometricaKm);
      assert.equal(d.fallbackKm.length, c.distancias[rot].passagens.filter((p) => p.semCasamento).length);
    }
  }
  // Alameda CIESP / alça da ponte: os trechos de fallback continuam lá (21K um, 42K dois)
  assert.equal(arquivo.distancias['21K'].fallbackKm.length, 1);
  assert.equal(arquivo.distancias['42K'].fallbackKm.length, 2);
  // 42K: não foi esticado para os 42,2 km oficiais (a diferença fica documentada); as 2 voltas têm o comprimento do 21K
  assert.ok(arquivo.distancias['42K'].kmGeometrico < 42.2 - 0.2);
  assert.ok(Math.abs(arquivo.distancias['42K'].kmGeometrico - 2 * arquivo.distancias['21K'].kmGeometrico) < 0.5);
  // Indaiatuba 21K: altitude do Portal mantida (anomalia preservada, nada trocado pelo terreno)
  const ind = ler('../public/percursos/1-meia-maratona-de-indaiatuba-2026-12-13.json').distancias['21K'];
  assert.equal(ind.altitudeGpsCoerente, false);
  const gps = ler('../dados/percursos/1-meia-maratona-de-indaiatuba-2026-12-13.json').distancias.find((d) => d.rotulo === '21K').percurso.map((p) => p[2]);
  const alt = ind.percurso.map((p) => p[2]);
  assert.ok(Math.abs(Math.max(...alt) - Math.max(...gps)) < 1 && Math.abs(Math.min(...alt) - Math.min(...gps)) < 1);
});

test('pista de hoje continua igual: janela padrão 40/80 m e mesmas distâncias de antes da etapa 3', () => {
  // (42K: 41,522 km com o GPS que está no Portal desde 25/11/2026, o mesmo número que o jogo mostra hoje)
  const esperado = { [SORO]: { '21K': 20.928, '42K': 41.522 }, '1-meia-maratona-de-indaiatuba-2026-12-13': { '6K': 6.123, '10K': 9.938, '21K': 20.837 } };
  for (const { slug, relevo } of PROVAS) {
    const perc = ler(`../dados/percursos/${slug}.json`);
    for (const d of refinarDistancias(perc.distancias.map((x) => ({ rotulo: x.rotulo, km: x.kmOficial, percurso: x.percurso })))) {
      const p = new PistaReal(d.percurso, { exagero: relevo });
      assert.equal(p.janelaAtras, 40); assert.equal(p.janelaFrente, 80);
      assert.equal(+(p.total / 1000).toFixed(3), esperado[slug][d.rotulo], `${slug} ${d.rotulo}`);
    }
  }
});

// comparação antiga × nova nas cinco distâncias (≈5 s)
const resultados = {};
for (const { slug, nome, relevo } of PROVAS) {
  const perc = ler(`../dados/percursos/${slug}.json`), novo = ler(`../public/percursos/${slug}.json`);
  for (const d of refinarDistancias(perc.distancias.map((x) => ({ rotulo: x.rotulo, km: x.kmOficial, percurso: x.percurso })))) {
    test(`${nome} ${d.rotulo}: percurso ajustado funciona na corrida (eixo contínuo, s sempre crescendo, sem pular retorno)`, () => {
      const a = novo.distancias[d.rotulo];
      const r = comparar(new PistaReal(d.percurso, { exagero: relevo }), new PistaReal(a.percurso, { exagero: relevo, janela: JANELA }));
      resultados[`${nome} ${d.rotulo}`] = r;
      const n = r.novo;
      // distância: a do traçado ajustado (a PistaReal arredonda as esquinas: até 0,5% a menos), nunca esticada
      assert.ok(n.totalKm <= a.kmGeometrico + 0.001 && n.totalKm > a.kmGeometrico * 0.995, `${n.totalKm} × ${a.kmGeometrico}`);
      // eixo contínuo: em(s) e em(s+1) nunca a mais de 1,5 m
      assert.ok(n.continuidade.maxPasso < 1.5, `passo ${n.continuidade.maxPasso}`);
      // posição do jogador: em(s) → projetar devolve o mesmo s
      assert.ok(n.idaEVolta.maxErroM < 1, `ida e volta ${n.idaEVolta.maxErroM} m em ${n.idaEVolta.onde}`);
      // corrida simulada: chega, s nunca recua, nenhum salto maior que um corte de esquina (≤ 25 m)
      assert.ok(n.simulacao.chegou);
      assert.equal(n.simulacao.recuos, 0);
      assert.ok(n.simulacao.maiorSaltoM <= 25, `salto ${n.simulacao.maiorSaltoM.toFixed(1)} m no km ${(n.simulacao.ondeSalto / 1000).toFixed(2)}`);
      assert.ok(n.simulacao.maiorSaltoM <= Math.max(12, r.antigo.simulacao.maiorSaltoM), 'não pode pular mais que a pista de hoje');
      // retornos: os mesmos da pista de hoje (±150 m), nenhum inventado
      // (o km muda um pouco porque o traçado ajustado é mais longo: tolerância de 0,25 km + 1,2% do km)
      for (const k of n.retornosKm) assert.ok(r.antigo.retornosKm.some((v) => Math.abs(v - k) < 0.25 + k * 0.012), `retorno ${k} não existe na pista de hoje`);
      // marcos de km e postos padrão: os que cabem na distância (mesma regra do jogo)
      assert.equal(n.marcosKm, Math.max(0, Math.ceil((n.totalKm * 1000 - 150) / 1000) - 1));
      assert.ok(Math.abs(n.postosPadrao - r.antigo.postosPadrao) <= 1);
    });
  }
}

test('viaduto falso da Rua Ubirajara corrigido só no modo de teste (mesmaPassagem); produção e sistema antigo iguais', async () => {
  const { prepararOSM, viadutosDoPercurso } = await import('../src/osm.js');
  const osmJ = ler(`../public/osm/${SORO}.json`);
  const v = (perc, op) => { const p = new PistaReal(perc, { exagero: 0, janela: JANELA }); return viadutosDoPercurso(prepararOSM(osmJ, p.paraLocal), p, op).map((t) => [Math.round(t.s0), Math.round(t.s1)]); };
  const a42 = arquivo.distancias['42K'].percurso;
  // sem a opção (comportamento de sempre): 4 viadutos, 2 deles falsos na Rua Ubirajara (km 16 e 37)
  assert.equal(v(a42).length, 4);
  // com a opção: só a Ponte Dom José, nas duas voltas
  const corr = v(a42, { mesmaPassagem: true });
  assert.equal(corr.length, 2); assert.ok(corr.every(([s0]) => s0 > 19000 && (s0 < 21000 || s0 > 40000)));
  // 21K ajustado e as pistas de hoje (GPS + refino): nada muda com ou sem a opção
  assert.deepEqual(v(arquivo.distancias['21K'].percurso, { mesmaPassagem: true }), v(arquivo.distancias['21K'].percurso));
  for (const d of refinarDistancias(ler(`../dados/percursos/${SORO}.json`).distancias.map((x) => ({ rotulo: x.rotulo, km: x.kmOficial, percurso: x.percurso })))) {
    assert.deepEqual(v(d.percurso, { mesmaPassagem: true }), v(d.percurso), d.rotulo);
  }
  // o jogo só passa a opção quando a distância está no percurso ajustado
  assert.match(fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8'), /viadutosDoPercurso\(osm, pistaAlvo, \{ mesmaPassagem: !!distancia\.ajustado \}\)/);
});
