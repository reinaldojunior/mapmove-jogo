# Etapa 4a — novo desenho das ruas, só dados e imagens

25/11/2026. Ramo `claude/sharp-hamilton-08y1qi`.

**Nenhum arquivo do jogo foi alterado.** `src/`, `public/` e `index.html` estão iguais, e um teste confere isso. O
desenho novo existe só como dados e imagens.

## Como rodar

```bash
node scripts/percurso/exportar-ruas.mjs --atual /tmp/ruas        # medidas em dados/ruas/; triângulos em /tmp/ruas
python3 scripts/percurso/desenhar-ruas.py /tmp/ruas docs/percursos/etapa4/img
```

| Arquivo novo | O quê |
|---|---|
| `scripts/percurso/ruas-geometria.mjs` | geometria pura: largura, ruas a partir do grafo, cruzamento como um polígono só, triangulação |
| `scripts/percurso/exportar-ruas.mjs` | monta o desenho novo de cada distância; mede a faixa do corredor; alarga onde precisa; mede degraus, ponte, vão livre e triângulos; monta também o desenho ATUAL (com `src/faixas.js`, só leitura) para comparar |
| `scripts/percurso/desenhar-ruas.py` | imagens vistas de cima, atual × novo |
| `dados/ruas/<slug>/<rótulo>.json` | medidas, ruas alargadas, remendos (km, lado, rua, motivo), cones |
| `docs/percursos/etapa4/img/` | 27 comparações |
| `test/ruas-osm.test.js` | 6 testes |

## Resultado por prova

A faixa medida é a do corredor: a cada 1 m do percurso e a cada 0,5 m de lado, até ±4 m sobre asfalto e até ±7,6 m
(onde vem a penalidade) sobre asfalto ou calçada, na mesma altura.

| Prova | Pontos sem asfalto ±4 m (antes do alargamento → depois) | Pontos sem chão até 7,6 m (antes → depois) | Ruas do percurso na largura real | Alargadas pela regra D1 | Remendos de asfalto | Triângulos novo × atual |
|---|---|---|---|---|---|---|
| Sorocaba 21K | 4.176 → **0** | 8.756 → **0** | 14,8 km | 6,4 km | 76 (1,7 km somando os lados) | 51.040 × 55.728 (−8%) |
| Sorocaba 42K | 10.034 → **0** | 17.689 → **0** | 14,8 km | 6,7 km | 168 (3,8 km) | 61.072 × 56.178 (+9%) |
| Indaiatuba 6K | 79 → **0** | 4.581 → **0** | 1,4 km | 4,7 km | 12 (0,2 km) | 19.070 × 17.112 (+11%) |
| Indaiatuba 10K | 1.714 → **0** | 6.333 → **0** | 1,4 km | 8,6 km | 39 (0,8 km) | 31.249 × 28.544 (+9%) |
| Indaiatuba 21K | 2.351 → **0** | 9.530 → **0** | 1,4 km | 19,6 km | 51 (1,1 km) | 54.407 × 63.526 (−14%) |

- No 42K as ruas são as mesmas do 21K; por isso as quilometragens se repetem.
- Os triângulos contam asfalto, cruzamentos, calçadas, remendos e o trecho de fallback.
- A pintura (faixas, linha azul) vai como textura do asfalto, como hoje, e não entra na conta. O desenho atual não
  conta as travessas, que vêm do Overpass na hora.

## O que mudou no desenho (ver as imagens)

- **Cada rua uma vez só, com a forma do mapa:**
  - avenidas de pista dupla com o canteiro real (Dom Aguirre, 15 de Agosto, Horst Heer);
  - cruzamentos como um polígono só com cantos arredondados;
  - rotatória e alças com a forma real;
  - ruas que cruzam com 50 m, sumindo no terreno nos últimos 15 m (D2).
- **Pintura:**
  - linha de borda;
  - linha central amarela nas ruas de mão dupla;
  - tracejado entre faixas pelo número de faixas do OSM;
  - faixa de pedestre onde o OSM marca travessia ou semáforo;
  - linha azul da prova no caminho do corredor.
- **Retornos:** cones no meio da rua, nos 20 m antes da ponta. Aparecem em Sorocaba (km 1,31, 9,43, 19,50 e os do
  42K) e em Indaiatuba (10K km 0,64; 21K km 6,14).

## D1 — ruas mais estreitas que a faixa do corredor (achado importante)

A faixa do corredor tem 8 m (±4 m), mas uma rua comum de 2 faixas tem 6,5–7 m no mapa. Por isso a regra D1 alarga
**quase todas as ruas de 2 faixas**:

- em Indaiatuba, 93% do 21K;
- em Sorocaba, ~30%.

As ruas largas (3 faixas, 9,9 m), as avenidas de pista dupla e as pontes ficam na largura real.

| Rua (exemplos) | Real | Desenhada | Fonte da largura |
|---|---|---|---|
| Av. 15 de Agosto (Sorocaba) | 6,6 m | 8,5 m | OSM lanes = 2 |
| Av. Dom Aguirre, trechos de 2 faixas | 6,6 m | 8,5 m | OSM lanes = 2 |
| Av. Dom Aguirre, trechos marcados com 1 faixa no OSM | 3,3 m | 8,5 m | OSM lanes = 1 (provável erro do mapa) |
| Av. Horst Frederico João Heer (Indaiatuba) | 6,6–7 m | 8,5 m | lanes / padrão |
| Estrada General Motors | 7 m | 8,5 m | padrão da categoria |
| Av. Eng. Fábio Roberto Barnabé | 6,6–7 m | 8,5 m | lanes / padrão |
| Rua Martinho Lutero | 6,5 m | 8,5 m | padrão da categoria |

- Onde o eixo tem 2 m de deslocamento (rua percorrida nos dois sentidos, etapa 3), a rua desenhada vai a 12,5 m.
- A lista completa de cada distância está em `dados/ruas/<slug>/<rótulo>.json` (`ruasAlargadas`).

**Remendos.** Fora a largura mínima, sobram remendos curtos, de 10 a 70 m, só onde o eixo do corredor sai do meio da
rua:

- **pontas dos retornos:** o lado de dentro da meia-volta;
- **trocas de pista e alças:** ex. Rua Martinho Lutero, km 3,7–4,5 do 10K, onde o percurso passa de uma pista para a
  paralela pela alça;
- **esquinas que a pista do jogo arredonda:** ex. Av. Dom Aguirre km 12,3 do 21K, onde o eixo corta o canteiro na
  junção das pistas. É o mesmo arredondamento do D4, deixado para depois.
- **emenda com o fallback:** 10 m no 21K e 55 m no 42K.

Cada remendo tem km, lado, rua e motivo no JSON. Nas imagens, o asfalto alargado aparece em vermelho e a calçada
alargada em laranja.

**Proposta para não perder a fidelidade visual (decisão para a 4e):**

- o asfalto continua alargado onde a regra pede;
- a **pintura fica na largura real**: as linhas de borda marcam a rua de verdade (ex.: 6,6 m);
- o asfalto extra aparece como acostamento/sarjeta, num tom um pouco diferente;
- o jogo continua com as mesmas regras, e o visual mostra a rua real.

## Cuidados especiais

- **Alameda CIESP (fallback).**
  - Os trechos sem ligação no OSM continuam com a fita do sistema atual (roxo nas imagens): 1 no 21K e 2 no 42K.
  - A emenda com as ruas do mapa precisou de 10–55 m de remendo.
  - Não aparece nenhuma rua inventada.
  - Imagens: `s21k-5`, `s42k-7`.
- **Retornos.**
  - Asfalto contínuo e cones; o lado de dentro da ponta é remendado.
  - A troca de pista na Av. Dr. Artur Bernardes (km 1,31) e o retorno da Alameda CIESP (km 19,50) estão nas imagens
    `s21k-2` e `s21k-4`.
  - No 42K estão as duas voltas.
- **Pontes.**
  - A Ponte Dom José (OSM camada 1) cai exatamente no trecho que o jogo eleva: 100% das pontas.
  - Vão livre sobre as avenidas de baixo: 7 m.
  - As pontes baixas sobre córregos (Indaiatuba, Rua Ubirajara no 21K) o jogo não eleva; no desenho elas ficam no
    chão, como no jogo.
- **Degraus de altura.** Uma diferença de altura acima de 0,3 m com inclinação acima de 25% dentro de uma peça do
  desenho conta como degrau.

  | Prova | Degraus | Onde |
  |---|---|---|
  | Indaiatuba 6K | 0 | — |
  | Indaiatuba 10K | 6, até 0,9 m | km 1,9 e 2,9 (pontes baixas; ajuste fino na 4b) |
  | Sorocaba 21K | 23, até 6,3 m | só nas cabeceiras da Ponte Dom José (km 18,6, 19,8–19,9 e 20,07): ruas que cruzam e cruzamentos encostados na rampa do viaduto |
  | Sorocaba 42K | 159, até 6 m | as mesmas cabeceiras nas duas voltas, mais o viaduto falso da Rua Ubirajara (abaixo) |
  | Indaiatuba 21K | 99, até 4,9 m | anomalia de altitude do Portal |

  - **Sorocaba (21K e 42K):** é a etapa 4d (ponte). Proposta: as ruas que encostam na rampa acompanham a rampa ou
    terminam antes dela.
  - **Indaiatuba 21K:** é a anomalia de altitude do Portal, preservada como você pediu. Onde duas passagens do
    percurso ficam lado a lado com altitudes que não batem (ex. km 6,1, 7,4, 12,8), a rua que as liga vira um degrau.
    Na 4b proponho não desenhar a ligação nesses pontos, ou fazê-la sumir no chão, sem trocar a altitude. Ao todo
    eram 3.932 degraus de até 77 m. Caíram para 99 depois que cada rua passou a tirar a altura só das passagens que
    andam nela, interpolada.

## Achado da etapa 3 (não corrigido: a 4a não pode mexer no jogo)

**Viaduto falso na Rua Ubirajara, só no 42K com o percurso ajustado (modo de teste, desligado por padrão).**

- **O que acontece:** o jogo monta um viaduto de 7 m nos km 16,03–16,11 e 37,17–37,25.
- **Causa:** na ponte baixa da Rua Ubirajara, a esquina da volta 2 passa a menos de 4 m da volta 1, porque as duas
  voltas agora caem exatamente no mesmo lugar. A detecção de viaduto do jogo (`viadutosDoPercurso` em `src/osm.js`)
  toma a mesma esquina, uma volta depois, por "outro trecho passando por baixo".
- **Não afeta** o sistema antigo, a produção nem o 21K.
- **Correção proposta, só no modo ajustado:** ignorar como "trecho de baixo" um ponto que também fica a menos de 4 m do
  próprio caminho dentro de ±60 m (é a mesma passagem). Precisa de autorização para mexer em `src/osm.js` e
  `src/main.js`.

## Desempenho (Galaxy A05)

- **Triângulos:** de −14% a +11% em relação ao desenho atual, dentro da meta de +15%. A pintura como textura não
  soma triângulos.
- **Malhas:** dá para mesclar por material, ~4–5 malhas por pedaço, como hoje: asfalto, calçada, faixa de pedestre e
  cones em instância. Chamadas de desenho parecidas com as de hoje.
- **Arquivo:** os triângulos prontos ficam grandes (2–7 MB em JSON). Para o jogo (4b), o arquivo guarda só as linhas
  das ruas e larguras (dezenas de KB) e o jogo monta as malhas ao carregar, como já faz com a fita.
- **Pendente:** FPS de verdade só dá para medir no jogo. Fica para a 4b, com o celular emulado (CPU 4× mais lenta).

## Testes

- 127 testes passam (6 novos) e o build funciona.
- Os testes novos conferem:
  - a geometria;
  - a cobertura total nas 5 distâncias;
  - os alargamentos listados com km e motivo;
  - a ponte no viaduto;
  - o vão ≥ 5,5 m;
  - os triângulos ≤ +15%;
  - que nenhum arquivo do jogo usa o desenho novo.

## Para aprovar

1. O resultado visual (imagens) e a regra D1 na prática: quase todas as ruas de 2 faixas alargadas para 8,5 m.
2. A proposta da pintura na largura real (asfalto extra como acostamento), para a 4e.
3. Autorização separada para corrigir o viaduto falso da Rua Ubirajara (etapa 3, modo de teste).
4. A etapa 4b (ruas do percurso e avenidas duplas no jogo, atrás de `?ruas=osm`) só depois da sua aprovação.
