# Etapa 4b — ruas do percurso e avenidas duplas no jogo (só com `?ruas=osm`)

25/11/2026. Ramo `claude/sharp-hamilton-08y1qi`. Nada na `main`, nada em produção. O Portal não foi alterado.

## Como ligar e desligar

| Endereço | O que aparece |
|---|---|
| sem parâmetro (padrão) | o jogo de sempre |
| `?percurso=ajustado` | etapa 3: percurso ajustado com o desenho de sempre |
| `?percurso=ajustado&ruas=osm` | etapa 4b: percurso ajustado com as ruas do mapa |
| `?ruas=atual` | volta ao desenho de sempre (o percurso ajustado continua, se estiver ligado) |
| `?percurso=gps` | volta a tudo de antes |
| `&fps=1` (com qualquer um) | mostra quadros por segundo, pior quadro, qualidade e triângulos (para medir no celular) |

As escolhas ficam lembradas no aparelho.

- **Arquivo da prova:** sem `public/ruas/<slug>.json`, com versão diferente da do percurso ou com origem diferente, a
  distância usa o desenho de sempre.
- **Tela da prova:** mostra "ruas do mapa (teste)" quando o modo está ativo.

## O que entrou nesta sub-etapa

- **Ruas do percurso** com a largura do mapa: `width`, senão `lanes` × 3,3 m, senão o padrão da categoria.
- **Largura mínima (D1):** 8,5 m de asfalto, e calçada até a linha da penalidade (7,6 m do eixo).
- **Avenidas de pista dupla:** as duas pistas do OSM com o canteiro real. O desenho antigo das avenidas fica desligado
  só nesse modo.
- **Remendos (D1):** nas trocas de pista, alças, pontas de retorno e esquinas que o eixo corta.
- **Ficam com a fita de sempre:**
  - **ponte/viaduto** (fica para a 4d);
  - **fallback** da Alameda CIESP (ligação que falta no OSM);
  - **passagens lado a lado com alturas diferentes** (anomalia de altitude do Indaiatuba 21K e cabeceiras da
    ponte);
  - os poucos **pontos onde um remendo cobriria outra passagem**.

  A fita de sempre se encolhe sozinha para não invadir outro trecho, e é o código de produção.
- **Ainda não** (próximas sub-etapas):
  - cruzamentos com recorte e cantos arredondados, e ruas que cruzam com 50 m (4c). As travessas antigas continuam;
  - ponte (4d);
  - pintura, linha azul, faixa de pedestre, cones, tom de rampa no asfalto e acostamento na largura real (4e).

| Prova | Fita de sempre | Ruas na largura real / alargadas (D1) | Remendos (asfalto) | Triângulos do desenho novo |
|---|---|---|---|---|
| Sorocaba 21K | 2,0% (415 m) | 14,8 / 6,4 km | 200 (1,6 km) | 37.961 |
| Sorocaba 42K | 2,2% (931 m) | 14,8 / 6,7 km | 436 (3,7 km) | 44.482 |
| Indaiatuba 6K | 2,3% (141 m) | 1,4 / 4,7 km | 81 (0,3 km) | 11.080 |
| Indaiatuba 10K | 14,0% (1,4 km) | 1,4 / 8,6 km | 140 (0,9 km) | 17.120 |
| Indaiatuba 21K | 21,5% (4,5 km) | 1,4 / 19,6 km | 213 (1,2 km) | 31.494 |

## Regras da corrida: medidas

Medição em toda a distância (`medirFaixa` em `src/ruasOSM.js`), a cada 1 m do percurso e a cada 0,5 m de lado, sobre os
**mesmos triângulos que o jogo desenha**. Conta desde 25 m antes da largada, onde o pelotão espera.

| Prova | Faixa ±4 m sem asfalto | Até 7,6 m sem chão | Rua de outra passagem por cima | Calçada por cima do asfalto na faixa | Beira da própria rua acima, na faixa ±4 m |
|---|---|---|---|---|---|
| Sorocaba 21K | 0 | 0 | 0 | 0 | 0 |
| Sorocaba 42K | 0 | 0 | 0 | 0 | 0 |
| Indaiatuba 6K | 0 | 0 | 0 | 0 | 0 |
| Indaiatuba 10K | 0 | 0 | 0 | 0 | máx 0,18 m |
| Indaiatuba 21K | 0 | 0 | 0 | 0 | máx 0,15 m |

Os trechos de fita de sempre ficam de fora da medição, porque já são medidos pelo checador do desenho atual
(`scripts/checar-sobreposicao.mjs`).

**O desenho não mexe na corrida.** A pista (`em`, `projetar`, `total`, penalidade, postos, pelotão, minimapa) é
construída antes e não lê nada do desenho. Os testes da etapa 3 continuam iguais.

## Correção do viaduto falso (Rua Ubirajara, 42K, só no modo de teste)

- **Onde:** `src/osm.js` → `viadutosDoPercurso(osm, pista, { mesmaPassagem })`. O `main.js` só passa a opção quando a
  distância está no percurso ajustado.
- **O que a opção faz:** ignora como "trecho de baixo" o que corre ao longo do próprio caminho em volta da ponte, que é
  a mesma passagem em outra volta.
- **Resultado:**
  - 42K ajustado: 4 viadutos → 2 (só a Ponte Dom José, nas duas voltas).
  - As pistas de hoje (GPS + refino) dão exatamente o mesmo com e sem a opção.
  - O 21K ajustado também.
  - Há um teste para isso.

## Comparação no jogo (Playwright, as cinco provas, três modos)

Perfil Galaxy A05: tela 360×677, DPR 2, toque. Qualidade gráfica fixa em "baixa", que desliga a troca automática e é
o nível em que o A05 tende a ficar. Em cada ponto, teleporte e ~8 s de corrida real com piloto automático.

| Prova · km | FPS (hoje / etapa 3 / 4b) | Triângulos desenhados (hoje / 3 / 4b) | Chamadas de desenho (hoje / 3 / 4b) |
|---|---|---|---|
| Sorocaba 21K · 1,3 | 5,1 / 6,4 / 5,7 | 338k / 324k / 276k | 374 / 354 / 311 |
| Sorocaba 21K · 12,3 | 5,9 / 6,3 / 6,6 | 340k / 196k / 159k | 398 / 209 / 146 |
| Sorocaba 21K · 19,9 (ponte) | 6,0 / 4,4 / 5,1 | 133k / 242k / 205k | 48 / 296 / 283 |
| Sorocaba 42K · 0,5 | 6,8 / 6,2 / 6,7 | 159k / 203k / 161k | 211 / 207 / 166 |
| Sorocaba 42K · 16,05 | 6,5 / 5,2 / 5,6 | 419k / 154k / 126k | 527 / 103 / 176 |
| Sorocaba 42K · 40,0 | 8,0 / 7,1 / 6,8 | 140k / 167k / 144k | 133 / 32 / 25 |
| Indaiatuba 6K · 3,0 | 5,6 / 5,3 / 5,5 | 303k / 282k / 287k | 418 / 374 / 372 |
| Indaiatuba 10K · 4,0 | 5,9 / 6,6 / 7,5 | 181k / 104k / 87k | 371 / 212 / 247 |
| Indaiatuba 21K · 6,1 | 7,7 / 7,4 / 8,7 | 280k / 127k / 89k | 315 / 36 / 43 |
| Indaiatuba 21K · 7,4 | 5,9 / 6,7 / 6,8 | 265k / 131k / 93k | 250 / 145 / 169 |

- Zero erro de console.
- `s` nunca recuou e nenhuma penalidade nos 30 trechos.
- As ruas novas não aumentam o que a placa de vídeo desenha: nos mesmos pontos, os triângulos ficam iguais ou menores
  que na etapa 3, e as chamadas de desenho ficam parecidas.
- Os números de "hoje" × etapa 3 diferem também porque o cenário em volta muda com o percurso.

**Limite desta medição de FPS:** o navegador do servidor desenha sem placa de vídeo (por software), então os valores
absolutos (5–9 fps) não representam o celular. Eles servem para comparar os modos entre si, e aí ficam iguais dentro
da variação.

**FPS de verdade no Galaxy A05:** abrir a prévia da Vercel no celular com
`?percurso=ajustado&ruas=osm&fps=1`, comparar com `?percurso=gps&fps=1` e anotar os fps nos mesmos km.

## Imagens

Cada imagem em `docs/percursos/etapa4/img4b/` mostra o mesmo ponto nos três modos (hoje, etapa 3, 4b).

**O que aparece:**

- **Avenida e retorno, Sorocaba 21K km 1,3:** as duas pistas da Av. Dr. Artur Bernardes com o canteiro real.
- **Ruas do mapa:** asfalto liso, calçada de placas.
- **Ponte:** fita de sempre na ponte.

**Pendências visuais:**

- **Sem pintura:** sem faixas, sem linha azul e sem cones, que vêm na 4e. Por isso as ruas novas parecem "vazias".
- **Bordas em degrau:** nos remendos e nas calçadas onde duas ruas se encontram, porque ainda não há cruzamentos
  (4c).
- **Diferença de tom:** a fita de sempre pinta a rampa de avermelhado e o asfalto novo não. Isso aparece no
  Indaiatuba 21K, onde 21,5% é fita. Fica para a 4e.

## Problemas encontrados e como foram tratados

1. **Calçada de uma rua por cima do asfalto da vizinha numa rampa.**
   - Visto no jogo, no Indaiatuba 21K km 7,4: o corredor aparecia "em cima da calçada".
   - A medição antiga só pedia que houvesse asfalto embaixo.
   - Correção no desenho: a calçada nunca é desenhada por cima do asfalto.
   - Correção na medição: dentro da faixa, a superfície de cima tem que ser asfalto.
2. **Rua ou remendo de uma passagem por cima de outra passagem** (altitudes que não batem, Indaiatuba 21K).
   - Esses pedaços não são desenhados.
   - Onde as duas passagens ficam lado a lado (< 16,5 m) com 0,3–5,5 m de diferença de altura, fica a fita de sempre.
   - A medição exige zero.
3. **Fresta no eixo** em curva fechada (os remendos dos dois lados agora passam 0,5 m do eixo).
4. **Asfalto com o tracejado da textura antiga** espalhado pelas ruas novas: elas usam uma textura lisa.
5. **FPS no servidor sem placa de vídeo:** a medição compara triângulos e chamadas de desenho, e o FPS só entre modos.
   O medidor `?fps=1` serve para o celular.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `src/ruasOSM.js` | novo, com a geometria movida de `scripts/percurso/ruas-geometria.mjs` (que agora só reexporta) mais `montarRuas`, `medirFaixa` e afins |
| `src/main.js` | chave `?ruas=osm`; `construirVisual` desenha as ruas do mapa e a fita só nas zonas; avenidas antigas desligadas só nesse modo; opção do viaduto no modo ajustado; `?fps=1`; `__dbg.renderer` (só em desenvolvimento) |
| `src/percursoAjustado.js` | `modoRuas`, `aplicarRuasOSM` |
| `src/osm.js` | opção `mesmaPassagem` em `viadutosDoPercurso` (sem a opção, nada muda) |
| `scripts/percurso/exportar-ruas-jogo.mjs` | novo: gera `public/ruas/<slug>.json` (~115 KB por prova) e mede |
| `public/ruas/*.json` | novo |
| `test/ruas-osm.test.js`, `test/percurso-ajustado.test.js` | testes da chave, do arquivo, da cobertura ao vivo e do viaduto |

## Testes

`node --test test/*.test.js`: **129 passam**. `npx vite build`: ok.

## Como voltar atrás

- **No aparelho:** tirar o parâmetro (`?ruas=atual`).
- **Remover o modo novo:** apagar `public/ruas/`.
- **No código:** sem `?ruas=osm` o caminho é exatamente o de antes.
