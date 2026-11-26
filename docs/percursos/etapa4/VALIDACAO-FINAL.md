# Validação final — percurso ajustado + ruas do mapa (`?percurso=ajustado&ruas=osm`)

26/11/2026. Ramo `claude/sharp-hamilton-08y1qi`. **Nada foi publicado.** A `main` continua em `218b45d` (produção,
jogo.mapmove.com.br). O Portal não foi alterado. Sem parâmetro, o jogo é o de sempre.

Conforme decidido, não houve teste num Galaxy A05 real. O desempenho foi avaliado com as medições disponíveis
(perfil A05 no navegador do servidor, sem placa de vídeo).

## Resumo

| Verificação | Resultado |
|---|---|
| Testes automáticos (`node --test test/*.test.js`) | **132 passam**, 0 falham |
| Build (`npx vite build`) | ok |
| Comportamento padrão (sem parâmetro) | **igual à produção**: checador do desenho atual dá saída idêntica na `main` e no ramo; todo código novo só roda com a chave ligada |
| Percurso antigo × novo (5 provas) | novo sem recuo em nenhuma; distâncias +0,3% a +1,1% (ruas reais) |
| Corrida completa até a chegada (5 provas × 2 modos) | as 10 terminam, **0 penalidade, 0 erro**; colisões funcionam nos dois modos |
| Regras sobre o desenho novo (5 provas) | 0 ponto da faixa sem asfalto, 0 passagem por cima, 0 rua/calçada sobre o principal, 0 degrau, 0 fresta |
| Pontes | vão livre 7,0 m nas duas provas de Sorocaba; pontes baixas no chão; Rua Ubirajara sem viaduto falso |
| Desempenho (perfil A05, servidor) | FPS médio 6,34 → 6,68; triângulos médios 256 mil → 209 mil |

## 1. Comportamento padrão inalterado

- **Mesmo resultado na `main` e no ramo.** Uma cópia da `main` (`218b45d`) foi aberta ao lado do ramo. O
  `scripts/checar-sobreposicao.mjs` rodou nas duas com o mesmo cache do Portal. As saídas são idênticas, tirando o
  tempo de execução em ms.
- **Revisão do código.** No `git diff origin/main -- src/`, toda mudança está atrás de `?percurso=ajustado` ou
  `?ruas=osm`, ou é opção nova cujo padrão repete o comportamento de hoje:
  - `pista.js` `janela`: padrão 40/80;
  - `osm.js` `mesmaPassagem`: sem a opção, nada muda;
  - `viaduto.js` `alturaJunta`: padrão igual.
- **Código intocado:** movimentação, colisões (`tropecos`), obstáculos e penalidades.
- **Isolamento do modo de teste:**
  - os recordes têm sufixo `-ajustado`;
  - não envia ao ranking nem grava fantasma;
  - o cache das travessas é separado.
- **Como desligar:** `?percurso=gps` e `?ruas=atual`. A escolha fica lembrada no aparelho.

## 2. Percurso antigo × novo (`scripts/percurso/comparar-pistas.mjs`)

| Prova | Distância antiga → nova | Recuos (novo) | Maior salto entre pontos (novo) | Observação |
|---|---|---|---|---|
| Sorocaba 21K | 20,928 → 21,158 km | 0 | 11,1 m | |
| Sorocaba 42K | 41,522 → 41,870 km | 0 | 13,4 m | antigo: 177 recuos, salto de 90 m e ida-volta a 14 m no retorno da volta 2 |
| Indaiatuba 6K | 6,123 → 6,140 km | 0 | — | |
| Indaiatuba 10K | 9,938 → 10,001 km | 0 | — | |
| Indaiatuba 21K | 20,837 → 20,964 km | 0 | — | altitude do Portal incoerente, mantida como está |

A distância nova é a das ruas reais do mapa. A altitude do GPX não foi alterada.

## 3. Corrida completa nas cinco rotas

Piloto automático da largada à chegada, nos dois modos.

| Prova | Chega ao fim | Penalidades | Erros | Recuos de `s` (padrão / novo) | Tropeços (padrão / novo) |
|---|---|---|---|---|---|
| Sorocaba 21K | sim / sim | 0 / 0 | 0 / 0 | 0 / 0 | 149 / 164 |
| Sorocaba 42K | sim / sim | 0 / 0 | 0 / 0 | **54** / 0 | 318 / 290 |
| Indaiatuba 6K | sim / sim | 0 / 0 | 0 / 0 | 0 / 0 | 39 / 36 |
| Indaiatuba 10K | sim / sim | 0 / 0 | 0 / 0 | 0 / 0 | 60 / 70 |
| Indaiatuba 21K | sim / sim | 0 / 0 | 0 / 0 | 0 / 0 | 149 / 138 |

- **Tropeços.** A diferença vem dos obstáculos sorteados ao longo de um percurso de tamanho diferente. A regra de
  colisão é a mesma nos dois modos.
- **Recordes.** O modo novo grava nas chaves `…-ajustado`; o padrão grava nas de sempre.
- **Os 54 recuos do 42K padrão já existem em produção.** Vêm do GPS atual do Portal, alterado em 25/11, e não de
  mudança nossa. O modo novo resolve.

## 4. Pontes, cruzamentos, avenidas e retornos

| Item | Resultado |
|---|---|
| Ponte Dom José (21K e as duas voltas do 42K) | tabuleiro com o desenho novo entre as barreiras, vão livre 7,0 m, 0 degrau e 0 fresta nas cabeceiras; as duas voltas do 42K com a mesma altura (≤ 0,1 m) |
| Rampas do 42K e descida do 21K (~70 m) | continuam com o desenho antigo (fita): rampa íngreme a menos de 9,5 m da avenida de baixo, e um cruzamento do mapa no pé da descida |
| Pontes baixas (Indaiatuba, Rua Ubirajara) | no nível do chão; o viaduto falso da Ubirajara não aparece mais |
| Cruzamentos | um polígono por encontro de ruas, cantos arredondados, ruas que cruzam com 50 m sumindo no fim; nada por cima da faixa do corredor |
| Avenidas de pista dupla (Av. Dr. Artur Bernardes, Av. Dom Aguirre) | duas pistas com o canteiro real, tracejado entre faixas, bordas na largura real e linha azul |
| Retornos | Alameda CIESP com cones a cada 4 m entre ida e volta; as meias-voltas de Indaiatuba (troca de pista ou rotatória) sem cones |
| Faixas de pedestre | onde o OSM marca travessia ou semáforo (20 a 25 por prova) |

### Desenho antigo que permanece (fita)

| Prova | Trecho com fita | Onde |
|---|---|---|
| Sorocaba 21K | 3,0% | fallback da Alameda CIESP (ligação que falta no OSM), descida da ponte, alguns cruzamentos tortos |
| Sorocaba 42K | 3,1% | o mesmo do 21K, mais as rampas da ponte nas duas voltas |
| Indaiatuba 6K | 1,6% | cruzamentos tortos |
| Indaiatuba 10K | 13,1% | passagens lado a lado com alturas diferentes e cruzamentos tortos |
| Indaiatuba 21K | 17,8% | anomalia de altitude do Portal (preservada) |

## 5. Desempenho

Perfil Galaxy A05: tela 360×677, DPR 2, qualidade "baixa", ~8 s de corrida em cada ponto. O servidor desenha por
software, então o FPS absoluto não representa o celular. Os números servem para comparar produção com o modo novo.

| Prova · km | FPS (produção / novo) | Triângulos desenhados, mil (produção / novo) | Chamadas de desenho (produção / novo) |
|---|---|---|---|
| Sorocaba 21K · 1,3 | 5,1 / 6,8 | 338 / 314 | 374 / 271 |
| Sorocaba 21K · 12,3 | 5,9 / 6,6 | 340 / 210 | 398 / 144 |
| Sorocaba 21K · 19,9 (ponte) | 6,0 / 5,1 | 133 / 257 | 48 / 302 |
| Sorocaba 42K · 0,5 | 6,8 / 6,5 | 159 / 220 | 211 / 167 |
| Sorocaba 42K · 16,05 | 6,5 / 5,7 | 419 / 179 | 527 / 82 |
| Sorocaba 42K · 40,0 | 8,0 / 7,5 | 140 / 199 | 133 / 36 |
| Indaiatuba 6K · 3,0 | 5,6 / 5,6 | 303 / 310 | 418 / 367 |
| Indaiatuba 10K · 4,0 | 5,9 / 6,6 | 181 / 119 | 371 / 174 |
| Indaiatuba 21K · 6,1 | 7,7 / 8,9 | 280 / 134 | 315 / 33 |
| Indaiatuba 21K · 7,4 | 5,9 / 7,5 | 265 / 151 | 250 / 150 |
| **Média** | **6,34 / 6,68** | **256 / 209** | **305 / 173** |

- Na média, o modo novo desenha menos triângulos e faz menos chamadas de desenho que a produção.
- **Ponto mais pesado: a ponte do 21K (km 19,9).** Ali o modo novo desenha cerca de 2× os triângulos e ~6× as
  chamadas de desenho da produção, porque desenha cruzamentos e ruas embaixo da ponte que a produção não tem.
- **Arquivo da prova** (`public/ruas/<slug>.json`): ~430–510 KB, ~100 KB comprimido. Só é baixado com `?ruas=osm`.

## 6. Comparação visual

`docs/percursos/etapa4/img-final/`: produção (esquerda) e modo novo (direita), no mesmo ponto e no mesmo instante da
corrida.

| Arquivo | Ponto |
|---|---|
| `9-ma-21K-1.3.jpg` | Sorocaba 21K km 1,3, Av. Dr. Artur Bernardes |
| `9-ma-21K-12.3.jpg` | Sorocaba 21K km 12,3, Av. Dom Aguirre |
| `9-ma-21K-19.9.jpg` | Sorocaba 21K km 19,9, Ponte Dom José |
| `9-ma-42K-0.5.jpg` | Sorocaba 42K km 0,5, largada |
| `9-ma-42K-16.05.jpg` | Sorocaba 42K km 16,05, Rua Ubirajara |
| `9-ma-42K-40.jpg` | Sorocaba 42K km 40 |
| `1-me-6K-3.jpg` | Indaiatuba 6K km 3 |
| `1-me-10K-4.jpg` | Indaiatuba 10K km 4 |
| `1-me-21K-6.1.jpg`, `1-me-21K-7.4.jpg` | Indaiatuba 21K km 6,1 e 7,4 |

As imagens de cada sub-etapa continuam em `img4b`, `img4c`, `img4c-planta`, `img4d` e `img4e`.

## 7. Pontos que ainda precisam de atenção

1. **FPS no Galaxy A05 real não foi medido** (decisão sua). Recomendo conferir antes de publicar:
   - abrir a prévia com `?percurso=ajustado&ruas=osm&fps=1` e depois com `?percurso=gps&fps=1`;
   - comparar nos mesmos km: Sorocaba 21K km 12,3 e 19,9 (ponte, o ponto mais pesado) e Indaiatuba 21K km 6,1.
2. **Trechos com o desenho antigo:** ~3% em Sorocaba, 13,1% no Indaiatuba 10K e 17,8% no Indaiatuba 21K. Nas emendas,
   o estilo muda (cor, pintura e linha azul). No Indaiatuba 21K, a causa é a altitude incoerente do GPS no Portal.
   Corrigir o GPS lá reduziria a fita, mas exige mexer no Portal, o que não foi feito.
3. **Faltas e aproximações do mapa (OSM):**
   - ligação Alameda CIESP → alça da ponte (fica no fallback);
   - número de faixas estimado onde o OSM não informa;
   - faixa de pedestre só onde está marcada;
   - cones só nos retornos dentro da mesma rua.
4. **Pequenas ilhas de calçada** em cruzamentos muito próximos no mapa (ex.: Rua Ubirajara). Ficam fora da faixa do
   corredor.
5. **Ruas que cruzam são planas**, na altura de onde saem do percurso.
6. **42K de produção hoje:** com o GPS atual do Portal, o jogo publicado recua 54 vezes e tem um salto de 90 m no
   retorno da volta 2. O problema já existe, não foi causado por este trabalho, e o modo novo corrige.
7. **Recordes e ranking do modo novo:** hoje ficam à parte (sufixo `-ajustado`, sem ranking, sem fantasma). Se o
   modo virar padrão, é preciso decidir:
   - se os recordes antigos continuam valendo, já que a distância muda até 1,1%;
   - se os rankings serão zerados ou separados.
8. **Teste do protótipo 4a** (só gera imagens) tolera até 2 degraus. O jogo exige zero e cumpre.
9. **Publicação:** nada foi para a `main`. Publicar exige sua autorização explícita, e também decidir se o modo novo
   passa a ser padrão ou fica atrás da chave.

## Como voltar atrás

- No aparelho: `?percurso=gps` (tudo de antes) ou `?ruas=atual` (só o desenho).
- Sem parâmetro, nada muda.
- Apagar `public/ruas/` e `public/percursos/` desliga os dois modos.
