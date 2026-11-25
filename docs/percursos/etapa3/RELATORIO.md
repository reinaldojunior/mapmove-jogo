# Etapa 3 — percurso lógico ajustado integrado à corrida (modo de teste)

25/11/2026. Ramo `claude/sharp-hamilton-08y1qi`. Nada na `main`, nada em produção. O Portal não foi alterado.

## O que mudou

Com o modo de teste ligado, a corrida usa como eixo o traçado do map matching (etapa 2) no lugar do GPS do Portal.

- **Mesma pista.** O eixo passa pela mesma `PistaReal`, com a mesma interface (`em`, `projetar`, `total`, `localizar`,
  `pertoDe`, `elevacao`…).
- **Mesmo desenho.** Ruas, calçadas, viaduto e cenário continuam desenhados pelo sistema atual. O novo desenho das
  ruas é a etapa 4, que não foi feita.

### Ligar e desligar

| | Como |
|---|---|
| Ligar | abrir o jogo com `?percurso=ajustado` (fica lembrado no aparelho) |
| Desligar | abrir com `?percurso=gps` |
| Padrão | **desligado** (sem parâmetro e sem nada lembrado = sistema anterior) |

Quando o modo está ligado, a tela da prova mostra "percurso ajustado (teste: recordes à parte, fora do ranking)".

**Segurança:**

- Se `public/percursos/<slug>.json` faltar, não carregar, estiver inválido ou tiver buraco de mais de 120 m, aquela
  distância volta sozinha para o percurso de antes.
- Desligar não apaga nada.

**Isolamento dos resultados no modo de teste**, para não misturar com o sistema anterior:

- O recorde local vai para a chave `…-ajustado`. O recorde antigo não é tocado.
- O cache de travessas usa uma chave própria, porque as posições `s` dependem da pista.
- A corrida não é enviada ao ranking.
- O desafio fantasma não é gravado: o botão fica escondido.
- XP, Move$, medalhas, Strava, postos, pelotão, colocação, minimapa e câmera funcionam normalmente.

## Arquivos

| Arquivo | O quê |
|---|---|
| `src/percursoAjustado.js` (novo) | chave liga/desliga, leitura e validação do percurso ajustado, sufixo das chaves locais, janela de projeção |
| `src/main.js` | aplica o percurso ajustado ao carregar a prova (só no modo de teste); chaves de recorde e travessas com sufixo; sem ranking e sem fantasma no modo de teste; aviso na tela da prova; `__dbg.pista()/prova()` (só em desenvolvimento) |
| `src/pista.js` | `PistaReal` aceita `janela` (busca de `projetar` atrás/à frente). Padrão 40/80 m, igual a antes. O modo de teste usa 15/15 m |
| `public/percursos/<slug>.json` (novo) | percurso ajustado por distância (lat, lon, altitude do GPS do Portal), distância geométrica e trechos de fallback |
| `scripts/percurso/exportar-jogo.mjs` (novo) | gera `public/percursos/` a partir de `dados/casados` e `dados/elevacao` |
| `scripts/percurso/comparar-pistas.mjs` (novo) | comparação antiga × nova (eixo, projeção, corrida simulada, retornos, postos) |
| `scripts/percurso/matching.mjs` | duas regras novas para retornos com GPS espaçado (ver "Problemas") |
| `test/percurso-ajustado.test.js` (novo) | 13 testes da integração |
| `dados/percursos/9-maratona…json` | cópia local do 42K atualizada: o Portal mudou o GPS do 42K (528 → 590 pontos) |

## Cuidados pedidos

- **Sorocaba 42K.** Fica com a geometria do matching, **41,944 km** contra 42,2 oficial (−0,6%), sem esticar. As 2
  voltas têm o comprimento do 21K (21,189 km); um teste confere isso.
- **Indaiatuba 21K.** A altitude é a do Portal, com a anomalia preservada. Um teste confere que a faixa de altitude é
  a mesma do Portal. A subida que o jogo calcula passa de 241 m para 249 m, pela mesma altitude ao longo do traçado
  ajustado.
- **Alameda CIESP.** Os trechos de fallback continuam: 1 no 21K e 2 no 42K. Ali o eixo segue os pontos do GPS, sem
  ligação inventada.
  - Na borda desses trechos o traçado usa só as ruas do percurso real (CIESP antes; alça, Camilo Júlio e ponte depois).
    Nenhuma rua vizinha é aproveitada.
  - O caso sintético "rua-faltando" ainda empresta ~13 m (limitação conhecida, sem efeito nos percursos reais).
- **Retornos.** Onde a mesma rua é percorrida nos dois sentidos, cada sentido usa a sua metade da rua, com o eixo 2 m à
  direita, como numa prova com retorno em cones.

## Comparação das cinco provas (pista antiga × nova, mesma `PistaReal`)

`node scripts/percurso/comparar-pistas.mjs`. As distâncias são as da pista no jogo, em km.

### Distâncias e traçado

| Prova | Oficial | Antes | Agora | Subida antes → agora | Trecho repetido antes → agora | Retornos (km) antes → agora |
|---|---|---|---|---|---|---|
| Sorocaba 21K | 21,1 | 20,928 | **21,158** | 62 → 65 m | 5,20 → 1,29 km | 1,25 · 19,27 → 1,29 · 19,48 |
| Sorocaba 42K | 42,2 | 41,522 | **41,870** | 127 → 81 m | 25,75 → 21,99 km | 1,19 · 19,2 · 22,14 · 40,16 → 1,25 · 19,43 · 22,39 · 40,53 |
| Indaiatuba 6K | 6 | 6,123 | **6,140** | 34 → 35 m | 0 → 0 | — |
| Indaiatuba 10K | 10 | 9,938 | **10,001** | 68 → 69 m | 0,71 → 0,63 km | 0,64 → 0,66 |
| Indaiatuba 21K | 21,097 | 20,837 | **20,964** | 241 → 249 m | 0,66 → 0,67 km | 6,11 → 6,13 |

- A pista arredonda as esquinas, por isso fica até 0,5% abaixo da distância geométrica do matching.
- No 21K de Sorocaba, os "5,2 km repetidos" de antes eram ida e volta coladas pelo GPS. No ajustado, a avenida de
  pista dupla tem uma pista por sentido.

### Corrida simulada

| Prova | Recuos de s | Maior salto de s | Ida e volta `em` → `projetar` | Eixo contínuo (máx entre `em(s)` e `em(s+1)`) |
|---|---|---|---|---|
| Sorocaba 21K | 0 → 0 | 17,4 → 11,1 m | 0 → 0 m | 1,25 m |
| Sorocaba 42K | **177 → 0** | **89,5 → 13,4 m** | **14 → 0 m** | 1,25 m |
| Indaiatuba 6K | 0 → 0 | 2,3 → 7,3 m | 0 → 0 | 1,0 m |
| Indaiatuba 10K | 0 → 0 | 6,4 → 9,9 m | 0 → 0 | 1,23 m |
| Indaiatuba 21K | 0 → 0 | 5,4 → 9,9 m | 0 → 0 | 1,22 m |

- O maior salto de s no ajustado é sempre um corte de esquina, no máximo 13 m.
- **Achado:** o 42K que está em produção hoje, com o GPS atual do Portal, tem 177 recuos de s e um salto de 90 m na
  simulação. É o problema das duas voltas sobrepostas. No ajustado não acontece.

### Postos de hidratação

- **Marcados no Portal (Indaiatuba):** caem no mesmo lugar, 0,3–0,7% mais adiante no km, porque o traçado é um pouco
  mais longo.
  - 6K: 2,04 / 4,04 → 2,05 / 4,05.
  - 21K: 7 postos, deslocamento de 7 a 110 m no km.
- **Sorocaba:** não tem posto marcado; o jogo põe um a cada 2 km, com a mesma quantidade.
- **Marcos de km:** os que cabem na distância. O 21K de Sorocaba ganha o "21 KM", porque agora tem 21,16 km.

### No jogo de verdade (Playwright, `npx vite`, os dois modos, as cinco distâncias)

- **Trechos.** Largada, retornos, ponte e chegada, ~40 s de corrida em cada um, com piloto automático.
  - 0 erros.
  - Modo ajustado: 0 recuos de s.
  - Modo antigo: o 42K recua 17 vezes no retorno da volta 2.
- **Corrida inteira até a chegada (6K)** nos dois modos:
  - termina normalmente;
  - o recorde ajustado vai para a chave à parte e o antigo fica intacto;
  - o botão de desafio fica escondido no modo de teste;
  - no modo antigo, tudo igual a antes.
- HUD, minimapa, marcos e pelotão aparecem normalmente (capturas na conversa da etapa 3).

## Problemas encontrados e como foram tratados

1. **Ida e volta exatamente sobrepostas.** No retorno, o matching põe ida e volta no mesmo eixo da rua. Perto da
   ponta, o corredor "pulava" para a volta: s saltava até 90 m.
   - Correção no dado: cada sentido corre na sua metade da rua (2 m).
   - Correção na pista: no modo de teste, `projetar` procura só 15 m à frente e atrás, contra 80/40 no padrão. Por
     quadro o corredor anda menos de 1 m.
   - Quem cortar a ponta do retorno não ganha distância: fica fora do percurso e leva a penalidade normal.
2. **O Portal mudou o GPS do 42K** (528 → 590 pontos) depois da etapa 1. A cópia local foi atualizada, só leitura, e
   o matching do 42K foi refeito.
3. **Retorno da Alameda CIESP sumia no 42K novo.**
   - Causa: a ponta do retorno tem um único ponto de GPS (espaçamento ~70 m), logo depois de uma esquina. Ela era
     descartada como salto, e passar 2 pontos "sem casamento" custava menos que o retorno.
   - Regra nova: um ponto em cima da rua, onde o GPS dá meia-volta no ritmo da corrida (ida + volta ≤ 2,4 intervalos
     do GPS) com uma perna ao longo da rua, é ponta de retorno. Ali o retorno custa pouco, e só em rua de mão dupla.
   - Agora as duas voltas do 42K fazem os mesmos retornos do 21K.
   - Os 12 casos sintéticos dão exatamente o resultado de antes.
4. **Volta 1 do 42K com meia-volta na contramão na largada.** A regra do item 3 permitiu isso numa pista de mão única.
   Corrigido limitando a regra a ruas de mão dupla. A troca de pista volta a ser pela Rua Ribeiro de Andrade, como no
   21K.
5. **Erro de build** (nome `JANELA` repetido em `main.js`). Os testes unitários não pegam `main.js`, então o build e o
   Playwright ficaram como verificação obrigatória.

## Como voltar ao sistema anterior

- **No aparelho:** abrir o jogo com `?percurso=gps`, ou apagar a chave `mapmove-percurso` do armazenamento local.
  Recordes e dados continuam lá: o modo de teste grava em chaves separadas.
- **No código:** sem `?percurso=ajustado` nada muda.
  - Para remover a integração de vez, basta tirar a chamada de `aplicarPercursoAjustado` em `carregarProva`
    (`src/main.js`).
  - Ou apagar `public/percursos/`: sem o arquivo, a distância usa o percurso de antes.

## Produção

Nada foi para a `main`. A produção (jogo.mapmove.com.br) continua no commit `218b45d`. O push do ramo de
desenvolvimento só gera uma prévia da Vercel. Lá também o padrão é desligado: para testar, abra a prévia com
`?percurso=ajustado`.
