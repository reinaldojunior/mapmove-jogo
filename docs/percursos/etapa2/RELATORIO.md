# Etapa 2 — map matching offline: relatório

25/11/2026. Ramo `claude/sharp-hamilton-08y1qi`. **O jogo não foi alterado**: nada em `src/`, `public/` ou `index.html`.
As pistas atuais continuam as mesmas. Tudo desta etapa fica em `scripts/percurso/`, `dados/` e `docs/percursos/`, e
um teste confere que nenhum arquivo do jogo lê esses dados.

## Como foi feito

`scripts/percurso/matching.mjs` usa um modelo oculto de Markov (Viterbi) sobre o grafo OSM da etapa 1:

- **Estados.** Cada ponto do GPS tem como candidatos as ruas a até 30 m, nos dois sentidos, mais um estado "sem casamento".
- **Custos.** O custo de cada candidato soma a distância até a rua, a direção do GPS, a contramão e a penalidade de
  calçada ou via de serviço.
- **Transição.** O custo de passar de um ponto ao outro é a diferença entre o caminho pelo grafo e a distância do GPS.
  Um retorno custa mais (40). Retorno no fim de uma rua sem saída ou num balão não custa nada.
- **Sem conexões artificiais.** Quando o caminho pelo grafo fica muito mais longo que o do GPS (mais de 60 m ou de 60% a
  mais), a ligação não é usada. O trecho vira "sem casamento" e vai para o **método alternativo**: o traçado do GPS
  como o jogo faz hoje, ligado só nos pontos do próprio GPS.
- **Saltos.** Um ponto isolado fora da linha é tratado como salto do GPS e descartado. A ponta de um retorno com GPS
  espaçado não conta como salto, porque continua o rumo de chegada e de volta. Um salto só é descartado se o caminho
  pelo grafo for plausível e não tiver meia-volta.
- **Níveis.** O caminho entre duas ruas só passa por nós do grafo. Viaduto e rua de baixo não têm nó em comum, então
  o casamento nunca "pula" de um nível para o outro.

Outros scripts desta etapa:

- `scripts/percurso/casar.mjs <slug>` grava `dados/casados/<slug>.json`.
- `scripts/percurso/elevacao.py <slug> <cache>` grava `dados/elevacao/<slug>.json`.
- `scripts/percurso/relatorio-imagens.sh` gera as imagens em `img/`.

## 1. Resultados de cada prova

| Prova | Ruas usadas | Retornos e meias-voltas (km) | Pontes e viadutos (camada 1) | Trechos repetidos |
|---|---|---|---|---|
| Sorocaba 21K | 16 (Dom Aguirre 11,1 km; Juvenal de Campos 2,9; 15 de Agosto 2,7; Pereira Inácio 1,7; Artur Bernardes 1,3) | 1,32 (troca de pista na Av. Dr. Artur Bernardes); 19,53 (retorno na Alameda CIESP) | Ponte Dom José Melhado Campos km 19,95–20,07; 3 pontes baixas sobre córregos | 3 arestas (cruzamentos na largada/chegada) |
| Sorocaba 42K | 16 (as mesmas, ×2) | 0,75 e 21,88 (troca de pista na Artur Bernardes, uma por volta); Alameda CIESP nas duas voltas (km 18,93 e ~40,0) | Ponte Dom José 2× (km 19,32 e 40,38), sempre camada 1 | 238 arestas, cada uma 2× no mesmo sentido (2 voltas) |
| Indaiatuba 6K | 6 | nenhum | 3 (Av. Fábio Roberto Barnabé, Jacob Lyra, Elevado Agostinho de Mello Gonçalves) | 0 |
| Indaiatuba 10K | 10 | nenhum (o "km 3,19" é uma esquina fechada Jabaquara → Martinho Lutero, não retorno) | 3 | 0 |
| Indaiatuba 21K | 11 | 6,16 (meia-volta) | 5 | 0 |

**Prioridades pedidas:**

- **Sorocaba 42K, largada.** As duas pistas da Av. Dr. Artur Bernardes ficam separadas: a ida vai pela pista de mão
  única e a volta pela outra pista. Isso acontece nas duas voltas, nas mesmas arestas e no mesmo sentido, sem
  contramão.
  - Imagens: `img/s42-largada-*.jpg`.
  - Teste: "largada nas duas pistas certas".
- **Sorocaba 21K.** A sequência e os retornos foram preservados, e o km só cresce. O retorno da Alameda CIESP está no
  lugar certo. O desvio inventado pela Alameda SENAI, que somava +440 m, não acontece mais.
- **Indaiatuba (controle).** 100% casado; o GPS fica a 0–1,1 m do traçado e a distância varia menos de 1% em relação
  ao GPS. Nada piorou.
- **Voltas repetidas, ida e volta, níveis, pontes e túnel.** Todos cobertos pelos casos sintéticos (ver item 7).
  No real, a ponte do 42K aparece 2× e as avenidas de pista dupla têm uma aresta por sentido.

## 2. Comparação visual antes × depois

Cada par tem `-antes` (traçado que o jogo desenha hoje, em verde-água) e `-depois` (ajustado ao OSM, colorido pela ordem
da corrida de azul a magenta, com setas de sentido e km). Embaixo de cada imagem está o perfil de elevação.

| Imagem | O que mostra |
|---|---|
| `s21-geral`, `s42-geral`, `i06-geral`, `i10-geral`, `i21-geral` | percurso inteiro |
| `s21-retorno-largada` | troca de pista na Av. Dr. Artur Bernardes, km 1,3 |
| `s21-ponte`, `s42-ponte-volta1`, `s42-ponte-volta2` | retorno da CIESP, ligação que falta no OSM (fallback em vermelho tracejado), ponte sobre o trevo |
| `s42-largada` | as duas voltas na largada, pistas separadas |
| `i10-km3` | km 3,19 do 10K: esquina, não retorno |

## 3. Distâncias antes e depois

| Prova | Oficial | GPS do Portal | Jogo hoje | Ajustado (geométrica) | Ajustado − oficial |
|---|---|---|---|---|---|
| Sorocaba 21K | 21,100 | 21,040 | 20,928 | **21,189** | +0,4% |
| Sorocaba 42K | 42,200 | 41,144 | 41,225 | **41,592** | −1,4% |
| Indaiatuba 6K | 6,000 | 6,152 | 6,123 | **6,158** | +2,6% |
| Indaiatuba 10K | 10,000 | 10,006 | 9,938 | **10,025** | +0,3% |
| Indaiatuba 21K | 21,097 | 20,935 | 20,837 | **21,001** | −0,5% |

As três distâncias continuam separadas (oficial / geométrica / percorrida), e nada é recalculado nos recordes.
O 42K fica abaixo da oficial porque o GPS do Portal tem um ponto a cada ~77 m e as pontas dos retornos encurtam em até
um espaçamento. Usar o 21K, que é denso, como referência do 42K (o refino já faz isso) dá 41,676 km. Fica como opção
para a etapa 3.

## 4. Percentual ajustado com sucesso

Sorocaba 21K 99,7% · Sorocaba 42K 99,3% · Indaiatuba 6K / 10K / 21K 100%.

Distância média do GPS até o traçado ajustado: 2,8 / 2,3 / 0,8 / 1,1 / 0,0 m.

## 5. Trechos que foram para o fallback

| Prova | km | GPS | Motivo |
|---|---|---|---|
| Sorocaba 21K | 19,76–19,84 (73 m) | pontos 538–540 | o OSM não tem a ligação entre a Alameda CIESP e a alça da ponte Dom José |
| Sorocaba 42K | 19,08–19,25 (167 m) e 40,19–40,32 (138 m) | 240–242 e 508–510 | mesma ligação, nas duas voltas |

Pontos descartados como salto de GPS: 21K ponto 256; 42K ponto 505.

## 6. Problemas encontrados e limitações

1. **Ligação que falta no OSM (Sorocaba, alça da ponte).** O matching agora manda o trecho para o fallback, mas o
   certo seria corrigir o OSM ou desenhar a ligação à mão na etapa 3.
2. **Ponta de retorno com GPS espaçado.** Pode ficar até um espaçamento mais curta (42K: até ~77 m; caso sintético
   "largada dentro do retorno": 18,5 m).
   - Corrigido nesta etapa: a ponta do retorno do 42K, volta 2, era descartada como salto.
   - Corrigido nesta etapa: um salto descartado deixava passar um desvio com meia-volta pela Alameda SENAI na volta 1.
3. **Contramão em Indaiatuba (0,7–2,4 km).** O percurso do Portal foi desenhado sobre o mapa e a prova fecha ruas de
   mão única. Isso é informativo: a contramão tem custo, mas não é proibida.
4. **Borda de trecho sem rua no mapa.** Ainda empresta ~19 m de uma rua vizinha no caso sintético "rua-faltando".
5. **Elevação.** O modelo de terreno (SRTM, ~30 m) tem ruído de prédios e árvores: a subida bruta é 2–8× a do GPS,
   então o terreno é suavizado (mediana de 150 m). Pontes baixas sobre córregos aparecem com altura ~0 porque o
   modelo não enxerga o vale. A ponte Dom José dá 5,5–5,9 m acima do terreno embaixo.
6. **Indaiatuba 21K: altitude do GPS incoerente (caso separado, sem correção).**
   - O erro médio contra o terreno é de 18,2 m (p95 50 m, máx 59 m), contra 1,1–1,7 m nas outras distâncias.
   - São 13 trechos incoerentes, somando ~13 km.
   - A subida do GPS é 253 m e a do terreno suavizado é 337 m.
   - Nos últimos ~5 km a altitude do GPS fica quase constante.
   - O 6K e o 10K, que usam as mesmas ruas, batem com o terreno. O problema é a altitude do 21K no Portal, não o
     terreno.
   - Imagem: `img/i21-geral-depois.jpg` (faixa vermelha = trechos incoerentes).
   - Nada foi alterado. A decisão fica para a etapa 3.

## 7. Testes executados e resultados

`node --test test/*.test.js`: **112 passam, 0 falham, 0 pendentes** (antes eram 92 + 16 `todo`). `npx vite build` ok.

Novos testes em `test/percursos.test.js`:

- **Sintéticos.** Comparam o traçado com a rota verdadeira nos dois sentidos (nada inventado, nada cortado):
  - circuito com 2 voltas;
  - ida e volta pela mesma rua;
  - retorno com GPS a cada 75 m;
  - avenida de pista dupla (sem contramão);
  - cruzamento em X;
  - largada dentro do retorno (tolerância de 20 m, limitação);
  - viaduto sobre o percurso (troca de aresta só por nó comum);
  - túnel sem GPS;
  - GPS com saltos;
  - rua faltando no mapa (fallback, sem desvio);
  - curva cortada;
  - rua sem saída com balão.
- **Reais:**
  - largada do 42K;
  - 2 voltas do 42K, com a ponte 2× na camada 1 e a Dom Aguirre 1× por volta em cada pista;
  - sequência, retorno e fallback do 21K;
  - Indaiatuba 6K, 10K e 21K como controle.
- **Distâncias.** As quatro ficam separadas, e nenhum arquivo do jogo lê os dados desta etapa.
- **Elevação.** São três séries separadas. O 21K de Indaiatuba fica marcado como incoerente sem correção, e a altura
  da ponte é medida.

Casos sintéticos (afastamento máximo traçado → rota / rota → traçado):

- 0,0 m: circuito, avenida dupla, cruzamento em X, viaduto, saltos, balão.
- Ida e volta: 0,6 m. Túnel: 2,6 m. Curva cortada: 11 m. Largada dentro do retorno: 18,5 m. Rua faltando: 13 m.

**Não passar para a etapa 3 sem aprovação.**
