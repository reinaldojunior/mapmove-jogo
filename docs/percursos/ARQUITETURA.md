# Percursos: arquitetura híbrida (GPS + grafo OSM)

Projeto aprovado em 25/11/2026 (alternativa **C**: map matching próprio, offline, sobre o grafo de ruas do
OpenStreetMap). Esta pasta documenta a **etapa 1** (fundação). Nada aqui muda o jogo: os arquivos novos ficam em
`scripts/percurso/`, `dados/` e `test/percursos.test.js`. O jogo continua usando `src/pista.js`, `src/refino.js` e
`src/faixas.js` como antes.

## Como é hoje (resumo)

GPS do Portal → `refino.js` (encaixa distância espaçada em outra mais densa) → `PistaReal` (Chaikin, reamostra a 5 m,
`colarVoltas` **move** pontos de passagens próximas para cima da anterior, `folgaLateral`) → `faixas.js` desenha
uma faixa por passagem → `osm.js` só decora e infere avenida dupla/viaduto. A **sequência da corrida e a geometria
da pista são a mesma coisa**, e a rua é o rastro do GPS com 8 m de largura. Daí os erros: ruas tortas lado a lado,
bordas no meio da rua, emendas em retornos, curvas cortadas e distância menor.

## Para onde vai (camadas)

| Camada | O que é | Origem | Etapa |
|---|---|---|---|
| 1. GPS original | sequência lógica da corrida, como veio do Portal | `corrida_distancias.percurso` | guardado como referência |
| 2. Grafo de ruas | nós com id, arestas cortadas nas junções, sentido, faixas, largura, ponte/túnel/camada | `scripts/percurso/exportar-grafo.py` → `dados/grafos/<slug>.json` | **1 (feito)** |
| 3. Casamento | sequência de **passagens**: (aresta, sentido, de, até), com confiança por trecho | matching HMM offline | 2 |
| 4. Percurso lógico | eixo `s` contínuo sobre a geometria casada; cada passagem tem seu próprio `s` | gerado da camada 3 | 3 |
| 5. Geometria visual | **cada aresta desenhada uma vez**; cruzamentos e retornos como nós; níveis pelas camadas | gerado da camada 2 + 3 | 4 |

A corrida (física, pontuação, postos, minimapa) só depende da interface do percurso lógico — `em(s)`, `projetar`,
`total`, `localizar`, `pertoDe`, `elevacao`… —, que será mantida. Por isso a troca pode ser feita por trás dela.

### Map matching (etapa 2) — critérios

- **Candidatos**: arestas a até ~30 m de cada ponto do GPS (`grafo.proximas`).
- **Pesos**: distância ao ponto; **direção** do GPS × direção da aresta; **continuidade** (distância pelo grafo entre
  candidatos consecutivos ≈ distância em linha reta entre os pontos do GPS); **ordem** (nunca voltar atrás numa aresta
  sem um retorno explícito).
- **Retornos** no meio da quadra (cones) são permitidos: a passagem pode inverter o sentido dentro de uma aresta.
- **Mão única** não proíbe (prova fecha a rua), mas pesa: entre duas pistas de uma avenida dupla, a do sentido certo
  ganha — é o que separa ida e volta (ex.: largada do 42K, abaixo).
- **Níveis**: troca de camada (chão ↔ ponte ↔ túnel) só por ligação real do grafo, nunca por proximidade em planta.

### Quando o matching não for confiável (requisito 3)

Cada trecho do casamento recebe uma **confiança** (distância média, concordância de direção, razão
caminho-pelo-grafo / linha reta, margem entre o melhor e o segundo candidato). Abaixo do limite:

1. o trecho é **marcado** (`semCasamento: [km de, km até]`) e aparece em vermelho na ferramenta de conferência;
2. o percurso lógico usa ali o **método atual** (GPS suavizado e reamostrado);
3. a emenda com os trechos casados acontece **só nos próprios pontos do GPS** nas pontas do trecho: nenhuma aresta,
   nó ou ligação é inventada no grafo;
4. o desenho desse trecho usa o desenho atual (faixas por passagem).

Testado na etapa 1 pelo caso sintético `rua-faltando` (diagonal num parque sem rua) e medido nas provas reais pela
`cobertura` do grafo (hoje 0 trechos sem rua a até 25 m em Sorocaba e Indaiatuba).

## Três distâncias (requisito 1)

| Distância | O que é | De onde vem | Uso |
|---|---|---|---|
| **Oficial** | a distância da prova (21,1 km, 42,2 km) | `corrida_distancias.km` (Portal) | nome, rótulo, medalhas, bônus de XP |
| **Geométrica** | comprimento do percurso lógico desenhado | soma do percurso casado (hoje: GPS reamostrado) | "/41,22 km" no HUD, minimapa, chegada |
| **Percorrida** | o que o jogador correu | `estado.sMax`, tempo de prova | pace, tempo, XP por km, recordes |

Regras: a geométrica pode mudar quando o percurso é corrigido; **recordes e resultados já gravados nunca são
recalculados sozinhos**. Na etapa 3 cada recorde passa a guardar a **versão do percurso** (hash do percurso lógico);
recorde de versão antiga continua aparecendo, marcado como "no percurso anterior", sem conversão automática.
Hoje: a chave é `mapmove-recorde-<slug>-<rótulo>` (sem versão) e o 42K de Sorocaba já mudou de 40,62 para 41,22 km
com o refino.

## Banco de testes (etapa 1)

- `scripts/percurso/sinteticos.mjs` — **cidade de teste** (grade de 150 m, avenida dupla de mão única, viaduto por
  cima de ruas sem ligar nelas, túnel por baixo da avenida, rua sem saída com balão, parque sem rua) e **11 casos**
  com a resposta conhecida: circuito de 2 voltas, ida e volta com retorno no meio da quadra, avenida dupla ida/volta,
  cruzamento em X, largada dentro do retorno, viaduto sobre o próprio percurso, túnel sem GPS, saltos de 40 m, rua
  faltando, curva cortada com GPS a cada 100 m, balão de retorno. GPS gerado com ruído, espaçamento e saltos
  controlados (semente fixa).
- `dados/percursos/<slug>.json` — cópia do GPS do Portal (25/11/2026) das provas reais, para testar sem rede.
- `dados/percursos/esperado.json` — o que o matching terá que responder nas provas reais (passagens, voltas, ponte).
- `test/percursos.test.js` — 9 testes já valendo (grafo, consultas, gerador, cobertura real) e 16 `todo` que viram
  testes da etapa 2.

## Achados da etapa 1 que orientam a etapa 2

- **Largada do 42K de Sorocaba**: não é um retorno numa rua só — a avenida tem **duas pistas de mão única separadas
  por canteiro** (~20 m). O GPS vai por uma e volta pela outra; o `colarVoltas` atual (raio 12 m) não junta nem
  separa direito, daí as bordas e emendas. No grafo as duas pistas existem com o sentido certo: o matching resolve.
- **Indaiatuba**: o GPS do Portal já está colado nas ruas do OSM (mediana 0,1 m) — foi desenhado sobre o mapa.
  Caso de controle: o matching não pode piorar.
- **Sorocaba**: GPS de relógio, 1,9 m (21K) e 2,3 m (42K) de mediana até a rua; 42K com um ponto a cada ~77 m.
- **Indaiatuba 21K: altitude do Portal inconsistente** (ver `NIVEIS-E-ELEVACAO.md`).
