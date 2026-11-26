# Etapa 4d — pontes com o desenho novo (só com `?percurso=ajustado&ruas=osm`)

26/11/2026. Ramo `claude/sharp-hamilton-08y1qi`. Nada na `main`, nada em produção. O Portal não foi alterado. Sem
parâmetro, o jogo é o de sempre.

## O que mudou

**Altitude e movimentação não mudam.**

- A altitude do GPX e a pista (incluindo `pista.elevar`, que cria as rampas e o tabuleiro de 7 m) são as mesmas.
- A estrutura da ponte continua a do jogo (`src/viaduto.js`): aterros com muro, pilares, vigas, barreira New Jersey a
  7,6 m do eixo e postes.
- Muda só o asfalto e a calçada por cima, que agora vêm das ruas do mapa como no resto do percurso.

1. **Tabuleiro e rampas na mesma passagem.** A altura da rua do percurso vem só das próprias passagens, sem separar
   "chão" de "ponte". Na cabeceira, a rua sobe junto com a rampa. Antes, filtrar por camada pegava a altura do chão
   30 m adiante.
2. **Nada além da barreira.** No trecho elevado (rampa e tabuleiro), pedaço de rua, cruzamento ou calçada do mapa que
   passe de 7,6 m do eixo (a barreira) não é desenhado. Assim não fica asfalto pendurado fora da ponte.
3. **Nenhuma rua que cruza sai do trecho elevado.** Ela ficaria flutuando ao lado da rampa.
4. **Calçada entre duas passagens em alturas diferentes** (rampa ao lado da avenida de baixo): termina onde a outra
   começa, como a fita de sempre faz (`folgaLateral`). Ela não precisa ir até 7,6 m ali.
   - Só vira zona da fita de sempre quando as faixas de asfalto (±4 m) se encostariam (eixos a menos de 9,5 m) com
     0,3–5,5 m de diferença de altura.
   - Antes a regra valia a 16,5 m.
   - A exigência de nada por cima do corredor continua igual.
5. **Pontes baixas** (sobre córrego, onde o jogo não eleva) continuam no chão: Indaiatuba e Rua Ubirajara.

## Pontos pedidos

| Pedido | Resultado |
|---|---|
| 1. Tabuleiro integrado às rampas | 21K: rampa de subida e tabuleiro com o desenho novo; a descida (~70 m, km 20,055–20,127) fica com a fita, porque o cruzamento do mapa no pé da rampa deixaria degrau ou fresta. 42K: tabuleiro central com o desenho novo (~92 m por volta); as rampas ficam com a fita (item 6) |
| 2. Cabeceiras sem degraus ou frestas | degrau entre peças 0 e fresta 0 nas 5 distâncias (medido nos pedaços desenhados); onde o mapa não deixava fechar, fica a fita de sempre |
| 3. Vão livre | **7,0 m** sob o tabuleiro nas duas provas de Sorocaba (medido no desenho; mínimo exigido 5,5 m) |
| 4. Ruas de baixo não cobrem o tabuleiro | zero "outra passagem por cima" e zero "rua que cruza ou calçada por cima do asfalto principal"; as ruas de baixo ficam no chão, 7 m abaixo |
| 5. Pontes baixas no nível do terreno | Indaiatuba: nenhum trecho elevado, todas as ruas na camada do chão; Rua Ubirajara (42K) no chão, sem o viaduto falso |
| 6. Duas passagens do 42K | as duas voltas têm a mesma altura na rampa e no tabuleiro (diferença ≤ 0,1 m) e o mesmo desenho: tabuleiro novo e rampas com fita, iguais nas duas voltas. No jogo, as duas passagens sem recuo de `s` e sem penalidade |

**Por que as rampas do 42K ficam com a fita de sempre.** A rampa do 42K é curta e íngreme: sobe ~5 m em 20 m. É a
rampa que o jogo já calcula hoje (`elevar`), que para a rampa quando outro trecho chega perto. O pé da rampa passa a
menos de 9,5 m da avenida de baixo, a 0,3–5,5 m de altura. Desenhar com as ruas do mapa deixaria um pedaço de rampa
por cima da faixa de quem corre embaixo, na altura da cabeça. A fita de sempre se encolhe ali.

## Medidas (5 provas, sobre o que o jogo desenha)

| Prova | Faixa ±4 m sem asfalto | Outra passagem por cima | Rua que cruza / calçada sobre o principal | Degrau entre peças | Fresta | Vão livre | Fita de sempre |
|---|---|---|---|---|---|---|---|
| Sorocaba 21K | 0 | 0 | 0 | 0 | 0 | 7,0 m | 2,8% (antes 4,0%) |
| Sorocaba 42K | 0 | 0 | 0 | 0 | 0 | 7,0 m | 3,1% (antes 3,5%) |
| Indaiatuba 6K | 0 | 0 | 0 | 0 | 0 | — (sem ponte elevada) | 1,6% |
| Indaiatuba 10K | 0 | 0 | 0 | 0 | 0 | — | 12,9% (antes 13,8%) |
| Indaiatuba 21K | 0 | 0 | 0 | 0 | 0 | — | 17,7% (antes 20,5%) |

Indaiatuba também caiu na fita de sempre por causa da regra da calçada compartilhada (item 4).

### Trechos que continuam com o desenho antigo (fita de sempre)

| Prova | Fallback (ligação que falta no OSM) | Alturas diferentes lado a lado | Cruzamento torto / remendo que não cabe |
|---|---|---|---|
| Sorocaba 21K | 103 m | — | 522 m (inclui a descida da ponte) |
| Sorocaba 42K | 404 m | 336 m (rampas da ponte, nas duas voltas) | 587 m |
| Indaiatuba 6K | — | — | 115 m |
| Indaiatuba 10K | — | 484 m | 894 m |
| Indaiatuba 21K | — | 284 m | 3.598 m (anomalia de altitude do Portal) |

## Comparação visual

Ficam em `docs/percursos/etapa4/img4d/`, sempre o mesmo ponto antes (4c, fita na ponte) e depois (4d):

- **21K:** km 19,84 (subida), 19,9 (tabuleiro, câmera normal e afastada), 20,02 (descida) e 18,56 (debaixo da ponte).
- **42K:** km 19,87 e 19,92 (volta 1), 40,97 (volta 2, câmera normal e afastada), 39,6 (debaixo) e 16,05 (Rua
  Ubirajara, ponte baixa).

O tabuleiro aparece com o asfalto do mapa entre as barreiras, a calçada encostada na barreira e as rampas contínuas.
A câmera afastada no tabuleiro também foi conferida (era pendência antiga), sem atravessar a estrutura.

## Desempenho

Sem placa de vídeo no servidor: os valores absolutos de FPS não valem para o celular, só a comparação entre versões.
Perfil Galaxy A05 (360×677), qualidade "baixa", ~8 s de corrida em cada ponto.

| Prova · km | FPS (4c → 4d) | Triângulos desenhados, mil (4c → 4d) | Chamadas de desenho (4c → 4d) |
|---|---|---|---|
| Sorocaba 21K · 1,3 | 6,9 → 6,7 | 270 → 283 | 268 → 260 |
| Sorocaba 21K · 12,3 | 6,7 → 6,2 | 165 → 161 | 139 → 138 |
| Sorocaba 21K · 19,9 (ponte) | 5,3 → 4,9 | 225 → 215 | 290 → 298 |
| Sorocaba 42K · 0,5 | 6,6 → 6,4 | 184 → 176 | 161 → 160 |
| Sorocaba 42K · 16,05 | 6,0 → 5,4 | 138 → 140 | 79 → 81 |
| Sorocaba 42K · 40,0 | 7,5 → 7,1 | 159 → 159 | 32 → 29 |
| Indaiatuba 6K · 3,0 | 5,4 → 5,4 | 299 → 289 | 375 → 362 |
| Indaiatuba 10K · 4,0 | 7,6 → 6,0 | 104 → 103 | 241 → 179 |
| Indaiatuba 21K · 6,1 | 8,7 → 8,6 | 107 → 106 | 47 → 30 |
| Indaiatuba 21K · 7,4 | 7,4 → 7,7 | 127 → 109 | 159 → 106 |

- Triângulos e chamadas de desenho ficam iguais ou menores; o FPS varia dentro do ruído do renderizador por software.
- No arquivo, a ponte troca a fita por triângulos do mapa: ~+800 triângulos no 21K e ~+200 no 42K.
- Zero erro, `s` nunca recuou e nenhuma penalidade em todos os pontos, incluindo as duas voltas do 42K na ponte e
  embaixo dela.

**Galaxy A05 real, ainda pendente.** Prévia com `?percurso=ajustado&ruas=osm&fps=1`, comparando com `?fps=1` nos
mesmos km. Sugestão: Sorocaba 21K km 19,9 (tabuleiro), 18,56 (debaixo da ponte) e 12,3.

## Limitações

1. **Juntas de dilatação** do tabuleiro (`viaduto.js`) ficam escondidas debaixo do asfalto novo, que é desenhado 6 cm
   acima. Fica para a 4e (pintura e acabamento).
2. **Rampas curtas e íngremes do 42K** (~26% no trecho mais inclinado) são a geometria que o jogo já calcula hoje.
   Mudar a rampa mexeria na pista e na altitude, o que não é permitido. Por isso as rampas do 42K ficam com a fita.
3. **Descida da ponte no 21K** (~70 m): fica com a fita por causa de um cruzamento do mapa no pé da rampa.
4. Sem pintura, linha azul nem cones (4e).

## Arquivos

| Arquivo | Mudança |
|---|---|
| `src/ruasOSM.js` | altura das ruas do percurso só pelas próprias passagens; nada além da barreira no trecho elevado; rua que cruza não sai do elevado; medição com calçada compartilhada |
| `src/main.js` | só comentário (a ponte deixa de ser zona da fita) |
| `scripts/percurso/exportar-ruas-jogo.mjs` | a ponte deixa de ser zona da fita; conflito de alturas só quando o asfalto se encostaria (9,5 m); vão livre e trechos elevados no resumo; versão `etapa4d-v1` |
| `public/ruas/*.json` | regenerados |
| `test/ruas-osm.test.js` | vão livre ≥ 5,5 m, tabuleiro fora da fita, nada além da barreira, rua que cruza não sai do elevado, pontes baixas no chão |

## Testes

`node --test test/*.test.js`: **131 passam**. `npx vite build`: ok.
