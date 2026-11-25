# Etapa 4 — novo desenho das ruas: proposta (para aprovação, nada implementado)

25/11/2026. Ramo `claude/sharp-hamilton-08y1qi`. Este documento é só planejamento.

## Antes: as duas dúvidas da etapa 3

**Distância do 42K ajustado: 41,944 km é a do arquivo.** O arquivo do jogo guarda o traçado do map matching sem
esticar (`kmGeometrico: 41.944` em `public/percursos/9-maratona…json`).

- A linha gravada mede 41,937 km. Os 7 m a menos vêm do eixo 2 m à direita nos retornos (lado de dentro da curva).
- Os **41,870 km** são o que o jogo percorre depois que a `PistaReal` arredonda as esquinas. É o alisamento do
  sistema atual, o mesmo que já existe hoje, e é a distância que o HUD mostra.
- Como a etapa 4 redesenha as ruas a partir do mapa, ela é a ocasião de reduzir esse arredondamento só no percurso
  ajustado. A distância corrida ficaria a menos de 0,1% da do arquivo. Isso está no item **D4** das decisões abaixo,
  porque mexe na distância percorrida.

**Distância oficial: confirmado.** Nada é esticado para chegar aos 42,2 km. O percurso segue o traçado real e a
diferença fica documentada (−0,6% no arquivo; −0,8% no jogo hoje). O teste
`test/percurso-ajustado.test.js` falha se o 42K ficar a menos de 0,2 km do oficial ou se as duas voltas deixarem de
ter o comprimento do 21K.

## 1. O que muda visualmente

**Hoje** a rua é uma fita de largura fixa (8 m de asfalto + calçada + grama), desenhada ao longo do eixo do corredor:

- ida e volta coladas viram uma rua só;
- a avenida de pista dupla é "adivinhada" (`pistasDuplas` procura uma rua gêmea paralela no mapa);
- as ruas que cruzam são retângulos curtos (`travessas`) vindos de uma consulta ao Overpass na hora;
- o viaduto sobe a fita.

**Proposta:** desenhar as ruas a partir do grafo OSM das etapas 1 e 2, **cada rua uma vez só**, com a forma real.

| Elemento | Hoje | Proposta |
|---|---|---|
| Rua do percurso | fita de 8 m seguindo o eixo do corredor | a rua do mapa, com largura pela categoria e pelo número de faixas do OSM |
| Avenida de pista dupla | adivinhada por paralelismo | as duas pistas do OSM, com o canteiro entre elas e a largura real |
| Retorno | leque na ponta da fita | asfalto contínuo da rua; cones marcando o retorno (onde for no meio da rua) |
| Cruzamento | duas fitas sobrepostas, cantos ajustados | polígono de cruzamento único, com os cantos arredondados |
| Ruas que cruzam | retângulos curtos (Overpass na hora) | trechos reais do mapa, 40–60 m para cada lado, sumindo no chão |
| Faixas pintadas | textura fixa | linha central (mão dupla), tracejado entre faixas pelo número de faixas, linhas de borda; faixa de pedestre nos cruzamentos principais |
| Linha azul da prova | nas bordas da fita | segue o eixo do corredor (o caminho da prova), por cima do asfalto |
| Ponte/viaduto | a fita sobe sobre a estrutura do `viaduto.js` | mesma estrutura, mas o tabuleiro é a ponte do OSM (camada 1); as ruas de baixo continuam no chão |
| Calçada e grama | fitas paralelas ao eixo | ao longo das bordas reais das ruas desenhadas |
| Trecho de fallback (ligação que falta no OSM: Alameda CIESP → alça da ponte) | fita | **fita do sistema atual só nesse trecho**, emendada nas ruas do mapa |

**Não muda:** prédios, árvores, marcos, céu e clima, personagem, NPCs, HUD, minimapa, câmera, sons, obstáculos.

## 2. Como será feito o desenho

**Dados (offline, como nas etapas 1–3).** Um script novo, `scripts/percurso/exportar-ruas.mjs`, gera
`public/ruas/<slug>.json` a partir de `dados/grafos/` e `dados/casados/`.

1. **Ruas a desenhar:** as arestas por onde o percurso passa, mais os trechos de rua que tocam o percurso, cortados a
   40–60 m.
2. **Largura:**
   - `width` do OSM quando existir (só ~2% das arestas têm);
   - senão `lanes` × 3,3 m (34% têm);
   - senão o padrão da categoria: avenida principal 2×3,5 m, rua local 7 m, serviço 5 m.
   - Calçada de 2,5–3 m dos dois lados.
3. **Cruzamentos:** em cada nó, as pontas das ruas que chegam são recortadas e o espaço entre elas vira um polígono
   (cantos arredondados de raio ~4 m). Assim não há rua sobre rua nem cintilação.
4. **Altura:**
   - As ruas do percurso pegam a altura do próprio eixo (a mesma `PistaReal`).
   - As ruas que cruzam pegam a altura do ponto do percurso onde tocam e vão até o chão suavemente.
   - Pontes usam a camada do OSM com a estrutura do `viaduto.js`.
5. **Saída:** polígonos já prontos em coordenadas locais (metros), com tipo (asfalto, canteiro, calçada, cruzamento,
   faixa pintada) e altura por vértice. O jogo só triangula e monta as malhas.

**Jogo.** Um módulo novo, `src/ruasOSM.js`:

- monta poucas malhas mescladas, por material e por pedaço do percurso (como o `viaduto.js`, para ser leve no
  celular);
- liga só quando o percurso ajustado está ligado **e** existe `public/ruas/<slug>.json`;
- tem uma chave própria: `?ruas=osm` liga, `?ruas=atual` desliga. Assim dá para testar o percurso da etapa 3 com o
  desenho antigo ou com o novo.

## 3. Como os percursos e as regras da etapa 3 ficam preservados

- **O desenho não manda em nada da corrida.** Todos estes continuam vindo só do eixo lógico (`public/percursos` +
  `PistaReal` com a janela curta):
  - `s`, `d`, distância, ritmo e velocidade;
  - projeção, penalidade (`|d| > 7,6 m`) e colocação;
  - postos, marcos de km, pelotão, minimapa e câmera.
  - O desenho novo lê a pista; a pista não lê o desenho. Um teste garante que a pista é idêntica com e sem o desenho
    novo.
- **Faixa jogável sempre no asfalto.** O corredor pode andar até ±4 m do eixo sem penalidade. A regra é que essa
  faixa tenha asfalto desenhado embaixo em todo o percurso.
  - Onde a rua real for mais estreita (ex.: pista de 7 m com o eixo no meio), o desenho alarga a rua só o necessário
    e o lugar fica listado no relatório.
  - Ver decisão **D1**.
- **Obstáculos e NPCs** continuam posicionados pelo eixo (`s`, `d`), dentro da faixa jogável. Nada na altura da
  cabeça (regra do `CLAUDE.md`). Pilares do viaduto continuam fora da rua de baixo.
- **Fallback (CIESP):** esse trecho continua com a fita atual, sem rua inventada no mapa.
- **Retornos:** o eixo continua com cada sentido na sua metade da rua (etapa 3). O desenho só põe o asfalto e os
  cones.
- **Recordes, ranking e fantasma:** mesmo isolamento da etapa 3 (chaves `-ajustado`, fora do ranking, sem fantasma).
- **Sistema antigo:** o código do desenho atual (`construirVisual`, `faixas.js`, `pistasDuplas`, travessas) **não é
  removido nem alterado no caminho padrão**. Sem as chaves, o jogo é exatamente o de hoje.

## 4. Arquivos

| Arquivo | Mudança |
|---|---|
| `scripts/percurso/exportar-grafo.py` | levar também `width`, `lanes:forward/backward`, `sidewalk`, `turn:lanes` e o corredor das ruas que cruzam (só regera `dados/grafos`) |
| `scripts/percurso/exportar-ruas.mjs` | **novo**: polígonos de rua, cruzamento, canteiro, calçada e pintura → `public/ruas/<slug>.json` |
| `src/ruasGeometria.js` | **novo**: contas de geometria puras (sem Three.js), usadas pelo exportador, pelo medidor e pelos testes |
| `src/ruasOSM.js` | **novo**: monta as malhas no jogo a partir de `public/ruas` |
| `src/main.js` | `construirVisual`: se o desenho novo estiver ligado, usa `ruasOSM`; senão, o de hoje. Travessas e cenário respeitam as bordas reais |
| `src/viaduto.js` | aceitar o tabuleiro vindo do OSM (camada/ponte) além do de hoje |
| `src/percursoAjustado.js` | chave `?ruas=osm` / `?ruas=atual` |
| `scripts/checar-ruas.mjs` | **novo**: medidor do desenho novo (ver validação), com imagens vistas de cima |
| `test/ruas-osm.test.js` | **novo** |
| `public/ruas/*.json` | **novo** (dados gerados) |
| `docs/percursos/etapa4/` | relatório |

**Não mexe:** `src/pista.js` (regras da pista), `src/regras.js`, `src/pelotao.js`, `src/refino.js`,
`public/percursos/`, `dados/percursos/`, Portal.

## 5. Riscos e impactos

| Risco | Impacto | Como tratar |
|---|---|---|
| Desempenho em celular fraco (Galaxy A05) | mais triângulos (cruzamentos, ruas que cruzam) | malhas mescladas por pedaço, ruas que cruzam curtas, medir quadros por segundo e triângulos antes × depois (meta: no máximo +15% de triângulos, mesmo FPS) |
| Eixo do corredor fora do asfalto desenhado | corredor "na calçada" sem penalidade, ou o contrário | métrica obrigatória: faixa jogável ±4 m 100% sobre asfalto (fora do fallback); alargamento local quando preciso |
| OSM sem largura ou com faixas erradas | rua larga ou estreita demais | padrões por categoria; relatório lista onde foi usado padrão; conferência visual |
| Emenda com o fallback (CIESP) | degrau ou buraco entre a fita e a rua do mapa | emenda medida (sem buraco > 0,2 m, sem degrau > 0,1 m) e conferida em imagem |
| Alturas (rua que cruza em rampa, ponte) | degrau, rua flutuando ou enterrada | ruas que cruzam acompanham a altura do percurso; medidor de degraus; conferência na ponte |
| Cintilação onde dois polígonos se sobrepõem | piscar no asfalto | cruzamento como polígono único, ordem de desenho fixa; medidor de sobreposição |
| Ruas que cruzam vinham do Overpass na hora | mudança no cenário (placas e aberturas na grade de torcida) | travessas passam a vir do grafo no modo novo; cache com chave própria |
| Câmera afastada atravessando o tabuleiro (pendência antiga) | visual na ponte | conferir e tratar dentro da etapa |
| Indaiatuba foi calibrado no desenho atual | regressão visual | comparação antes × depois nas 5 distâncias |
| Tamanho dos arquivos | carregamento | meta < 400 KB por prova; carregado só com a chave ligada |

## 6. Validação antes de qualquer publicação

1. **Etapa 4a, só dados (sem mexer no jogo).**
   - `exportar-ruas` + `checar-ruas`, com imagens vistas de cima de cada prova: largada, retornos, cruzamentos, ponte,
     fallback e avenidas duplas.
   - Relatório para sua aprovação **antes** de o jogo usar o desenho.
2. **Testes automáticos:**
   - polígonos válidos (sem auto-interseção nem `NaN`);
   - faixa jogável 100% sobre asfalto;
   - nenhuma rua de outro nível por cima do caminho;
   - nenhuma sobreposição fora dos cruzamentos;
   - degraus de altura < 0,1 m;
   - pista idêntica com e sem o desenho novo;
   - comparação da etapa 3 (`comparar-pistas`) inalterada.
   - Todos os testes atuais continuam passando, e o build também.
3. **Jogo de verdade (Playwright), modo novo × antigo, nas 5 distâncias:**
   - capturas nos mesmos pontos;
   - corrida até a chegada;
   - FPS e triângulos com celular emulado (CPU 4× mais lenta);
   - zero erro no console.
4. **Prévia da Vercel do ramo** com `?percurso=ajustado&ruas=osm`, para você testar no celular.
5. **Só depois da sua aprovação** se discute ligar por padrão. Ir para a produção depende de uma autorização sua
   separada.

## 7. Como voltar atrás

- **No aparelho:** `?ruas=atual` volta ao desenho de hoje (o percurso da etapa 3 continua). `?percurso=gps` volta a
  tudo de antes.
- **Sem os arquivos:** apagar `public/ruas/` tem o mesmo efeito.
- **Código:** o caminho padrão não muda.
- **Git:** cada sub-etapa é um commit separado no ramo de desenvolvimento.

## Ordem de trabalho proposta (cada passo com conferência)

| Passo | Conteúdo | Entrega para conferir |
|---|---|---|
| 4a | dados: exportar ruas e cruzamentos, medidor, imagens de cima | relatório visual, sem mudar o jogo |
| 4b | jogo: ruas do percurso e avenidas duplas (sem cruzamentos detalhados) | capturas + métricas |
| 4c | cruzamentos e ruas que cruzam | capturas + métricas |
| 4d | ponte/viaduto e emenda do fallback | capturas na ponte (câmeras normal e afastada) |
| 4e | pintura (faixas, linha azul, cones, faixa de pedestre) e desempenho | relatório final das 5 provas |

## Decisões que preciso de você

- **D1 — rua real mais estreita que a faixa jogável.**
  - **(a)** Alargar o desenho só ali, mantendo as regras de corrida (recomendado).
  - (b) Manter a largura real e reduzir a faixa jogável naquele trecho. Isso muda regra de corrida.
- **D2 — comprimento das ruas que cruzam:** 50 m para cada lado, sumindo no chão (recomendado), ou o quarteirão
  inteiro (mais pesado).
- **D3 — chave separada `?ruas=osm`** (recomendado), ou o desenho novo junto com `?percurso=ajustado`.
- **D4 — arredondamento das esquinas no percurso ajustado.**
  - Hoje o jogo corre 41,870 km de 41,944 no 42K.
  - Reduzir o alisamento faria a distância corrida bater com a do arquivo (< 0,1%), mas mexe na distância percorrida.
  - Recomendo deixar para depois da 4e, como item separado, com a sua aprovação.
