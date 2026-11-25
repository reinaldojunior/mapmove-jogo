# Viadutos, pontes, túneis, níveis e elevação do terreno

## Duas alturas diferentes (não podem se misturar)

- **Terreno**: a altitude do chão. Dá a subida/descida que o jogo usa (inclinação, energia, pace).
- **Estrutura**: quanto uma via está **acima ou abaixo do chão** (tabuleiro de ponte, viaduto, túnel). É informação
  do **grafo** (tags `bridge`, `tunnel`, `layer`, `level`), não da altitude.

Altura desenhada de um ponto da via = `terreno(sob a via) + estrutura(camada, posição na ponte/túnel)`.

## O que o grafo OSM traz (medido na etapa 1)

| | Sorocaba | Indaiatuba |
|---|---|---|
| arestas / nós | 1.529 / 4.359 | 1.894 / 4.805 |
| pontes (`bridge`) | 35 (camada 1; inclui a **Ponte Dom José Melhado Campos**) | 21 |
| túneis (`tunnel`) | 0 (1 aresta camada −1) | 1 (6 arestas camada −1) |
| com `level` | 0 | 0 |
| mão única | 692 | 814 |
| com `lanes` / `width` | 521 / 27 | 162 / — |

Regras de exportação (`exportar-grafo.py`): ponte sem `layer` = camada 1; túnel sem `layer` = camada −1; `level` é
guardado como texto quando existir (estacionamento, shopping). **Arestas que se cruzam em planta sem nó em comum
não estão ligadas** (viaduto por cima de rua): é assim que o OSM representa níveis diferentes, e o grafo preserva.

## Como cada caso será tratado

- **Ponte/viaduto do percurso**: a passagem fica na camada da aresta. Altura do tabuleiro = terreno interpolado entre
  as duas cabeceiras (pontas da ponte, que estão no chão) + vão. Vão mínimo de 5,5 m sobre rua e o que o GPS medir
  sobre rio, se for coerente. Rampas pelas arestas de acesso (as que ligam a ponte ao chão), não por proximidade.
- **Passar por baixo de uma ponte** (o percurso na camada 0 cruzando uma aresta de camada 1 sem nó em comum): a altura
  é a do chão; o modelo de terreno é **mascarado** na faixa da ponte (ver achado 2).
- **Túnel**: camada −1. Pontos do GPS dentro do túnel são **ignorados** (o relógio perde o sinal ou grava lixo); a
  altura vai das bocas do túnel, interpolada. O caso sintético `tunel-sem-gps` testa isso.
- **Mesmo lugar em planta, níveis diferentes** (viaduto sobre o próprio percurso, alças): duas passagens só viram "a
  mesma rua" se estiverem na **mesma aresta** do grafo — nunca por estarem perto em planta.
- **`level`** (rampas de estacionamento etc.): tratado como camada; trocas só por ligação real.

## Elevação do terreno: investigação com dados reais

Fonte testada: blocos **terrarium** (AWS Open Data, `elevation-tiles-prod`, zoom 14, ~9 m por pixel em −23°, base
SRTM 30 m). Script: `scripts/percurso/relevo.py` → `dados/relevo/<slug>.json` (amostras a cada 25 m).

| Distância | GPS × terreno no chão (erro médio / p95) | subida GPS | subida terreno (bruto) |
|---|---|---|---|
| Sorocaba 21K | 1,9 m / 4,6 m | 66 m | 339 m |
| Sorocaba 42K | 1,8 m / 4,4 m | 86 m | 700 m |
| Indaiatuba 6K | 1,4 m / 3,5 m | 36 m | 113 m |
| Indaiatuba 10K | 1,5 m / 3,8 m | 69 m | 177 m |
| Indaiatuba 21K | **17,8 m / 50,6 m** | 254 m | 464 m |

### Achados

1. **No chão, o GPS do Portal e o modelo de terreno concordam (~1,5–2 m)**, mas o modelo bruto é "serrilhado"
   (árvores, prédios, ruído do SRTM): somando as subidas a cada 25 m ele dá 4 a 8 vezes mais subida que o GPS.
   → O terreno só pode ser usado **suavizado** (janela de ~150–200 m) e nunca para contar subida bruta.
2. **O modelo de terreno enxerga algumas pontes como chão.** Em Sorocaba, onde o percurso passa **por baixo** da
   Ponte Francisco Dell'Osso, o GPS fica 3–5 m **abaixo** do terreno: o SRTM "vê" o aterro/tabuleiro. Já sobre a
   **Ponte Dom José Melhado Campos** (onde o percurso passa **por cima**), o GPS fica 5–9 m **acima** do terreno: aí o
   modelo mostra o vale e o relógio mediu o tabuleiro.
   → É exatamente a confusão a evitar: o terreno precisa ser **mascarado sob as pontes do grafo** (faixa da ponte +
   margem) e interpolado a partir do chão em volta; a altura da estrutura vem do grafo.
3. **Indaiatuba 21K: altitude do Portal inconsistente.** No 6K e no 10K (que dividem boa parte das ruas) o GPS bate
   com o terreno (1,4–1,5 m); no 21K erra 18 m em média e até 60 m, e nenhum deslocamento ao longo do percurso
   corrige (melhor caso: 12 m com 2,15 km de atraso). Explica a subida de 246 m que o jogo mostra no 21K (o 10K mostra
   70 m). → Antes de corrigir a geometria, **validar a altitude**: se o GPS não bate com o terreno, usar o terreno
   suavizado. Nada foi alterado na prova (regra desta etapa); fica como pendência para decidir.

### Proposta para a altitude (etapa 3, a aprovar)

1. Altitude de cada distância validada contra o terreno; se a concordância for ruim (erro médio > ~5 m), o terreno
   suavizado substitui o GPS, com aviso na ferramenta de conferência.
2. Terreno suavizado e **mascarado** sob pontes/viadutos e sobre túneis do grafo.
3. Estrutura somada pela camada da aresta casada (vão e rampas pelas arestas de acesso).
4. A inclinação usada pela física continua limitada a ±12% e não muda nesta etapa.
