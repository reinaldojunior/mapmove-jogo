# Etapa 4e — acabamento visual das ruas do mapa (só com `?percurso=ajustado&ruas=osm`)

26/11/2026. Ramo `claude/sharp-hamilton-08y1qi`. Nada na `main`, nada em produção. O Portal não foi alterado. Sem
parâmetro, o jogo é o de sempre.

Só visual. Não mudam a distância, a altitude do GPX, as penalidades, as colisões nem a movimentação dos corredores.
Pintura, linha azul e cones não são obstáculos: não têm colisão e não entram na pista. Um teste confere que medir a
faixa do corredor com e sem a pintura dá o mesmo.

## Os 7 pedidos

| Pedido | O que foi feito |
|---|---|
| 1. Linhas de borda na largura real | Bordas brancas a 0,2 m da beira da largura **real** da rua (OSM `width`/`lanes` ou padrão da categoria), mesmo onde a regra D1 alargou o asfalto |
| 2. Asfalto excedente como acostamento | O que a D1 pôs além da largura real vira `acostamento`: mesmo asfalto, um tom mais claro. Continua contando como asfalto para a faixa do corredor (nada muda na corrida) |
| 3. Tom avermelhado das subidas | Cada vértice do asfalto e do acostamento leva o km da pista. A cor vem da inclinação da pista naquele km, com a mesma função da fita de sempre (`corInclinacao`): avermelhado na subida, azulado na descida. A altitude não muda |
| 4. Juntas de dilatação da Ponte Dom José | `viaduto.js` ganhou a opção `alturaJunta` (padrão igual ao de sempre). No modo novo, a junta fica 2 cm acima do asfalto novo e da calçada nova |
| 5. Pintura viária | Eixo amarelo contínuo nas ruas de mão dupla; tracejado branco (3 m pintado, 6 m de vão) entre as faixas pelo número de faixas do OSM; na pista dupla, só os tracejados e as bordas de cada pista |
| 6. Faixas de pedestre | Nas pontas de rua do percurso onde o OSM marca travessia ou semáforo: zebra de 3 m de comprimento, listras de 0,5 m, na largura real. A faixa antiga do jogo sobre a rua da prova sai nesse modo |
| 7. Linha azul e cones nos retornos | Linha azul nas beiras da faixa do corredor, na mesma posição da fita de sempre (3,48–3,72 m do eixo). Em volta repetida no mesmo sentido (42K) é desenhada uma vez só, e nunca entra na faixa de uma passagem no sentido contrário. Cones a cada 4 m na linha do meio entre ida e volta (dos 6 aos 22 m antes da ponta), só em retorno dentro da mesma rua (Alameda CIESP) |

Toda a pintura é assentada na superfície desenhada embaixo dela (altura tirada do próprio asfalto). Onde não há
asfalto do desenho novo (trechos da fita de sempre, que já têm as linhas dela), não se pinta.

## Regras da corrida (medidas sobre o que o jogo desenha)

| Prova | Faixa ±4 m sem asfalto | Outra passagem por cima | Rua que cruza / calçada por cima do principal | Degrau entre peças | Fresta | Vão livre | Fita de sempre |
|---|---|---|---|---|---|---|---|
| Sorocaba 21K | 0 | 0 | 0 | 0 | 0 | 7,0 m | 3,0% |
| Sorocaba 42K | 0 | 0 | 0 | 0 | 0 | 7,0 m | 3,1% |
| Indaiatuba 6K | 0 | 0 | 0 | 0 | 0 | — | 1,6% |
| Indaiatuba 10K | 0 | 0 | 0 | 0 | 0 | — | 13,1% |
| Indaiatuba 21K | 0 | 0 | 0 | 0 | 0 | — | 17,8% |

A divisão do asfalto em rua e acostamento mudou alguns pontos de remendo. A fita de sempre variou ±0,2 ponto
percentual em relação à 4d.

## Pintura por prova (triângulos)

| Prova | Pintura branca (bordas, tracejados, zebras) | Eixo amarelo | Linha azul | Faixas de pedestre (pontas de rua) | Cones |
|---|---|---|---|---|---|
| Sorocaba 21K | 21.096 | 1.484 | 11.712 | 21 | 5 (Alameda CIESP) |
| Sorocaba 42K | 21.174 | 1.496 | 11.693 | 22 | 5 |
| Indaiatuba 6K | 5.306 | 126 | 4.024 | 20 | 0 |
| Indaiatuba 10K | 7.662 | 222 | 5.199 | 25 | 0 |
| Indaiatuba 21K | 14.687 | 250 | 10.468 | 24 | 0 |

Indaiatuba não tem retorno dentro da mesma rua. As meias-voltas de lá trocam de pista ou passam por rotatória, então
não ganham cones.

## Desempenho (perfil Galaxy A05)

Tela 360×677, qualidade "baixa", ~8 s de corrida em cada ponto. O servidor não tem placa de vídeo: os valores
absolutos de FPS não valem para o celular, só a comparação.

| Prova · km | FPS (4d → 4e) | Triângulos desenhados, mil (4d → 4e) | Chamadas de desenho (4d → 4e) |
|---|---|---|---|
| Sorocaba 21K · 1,3 | 8,3 → 7,6 | 133 → 144 | 32 → 33 |
| Sorocaba 21K · 12,3 | 6,5 → 6,1 | 207 → 209 | 208 → 206 |
| Sorocaba 21K · 19,52 (retorno CIESP) | 5,4 → 6,0 | 450 → 462 | 442 → 448 |
| Sorocaba 21K · 19,95 (ponte) | 5,0 → 5,3 | 214 → 226 | 178 → 180 |
| Sorocaba 42K · 0,5 | 5,8 → 6,3 | 218 → 228 | 179 → 167 |
| Sorocaba 42K · 40,97 (ponte, volta 2) | 4,1 → 5,0 | 194 → 205 | 162 → 163 |
| Indaiatuba 6K · 3,0 | 5,4 → 5,5 | 316 → 306 | 380 → 383 |
| Indaiatuba 10K · 3,2 | 7,0 → 6,8 | 123 → 133 | 47 → 52 |
| Indaiatuba 21K · 6,1 | 8,2 → 8,0 | 152 → 157 | 142 → 142 |
| Indaiatuba 21K · 7,4 | 7,9 → 7,4 | 135 → 148 | 153 → 148 |

- A 4e soma de 5 a 13 mil triângulos por quadro (+3% a +8%) e até 5 chamadas de desenho: pintura branca, amarela,
  azul, acostamento e cones, cada um numa malha só.
- O FPS fica igual dentro do ruído.
- Zero erro, `s` nunca recuou e nenhuma penalidade nos 10 pontos.

**Galaxy A05 real, ainda pendente e necessário antes de qualquer publicação.** Abrir a prévia com
`?percurso=ajustado&ruas=osm&fps=1` e comparar com `?fps=1` (produção) nos mesmos km. Sugestão: Sorocaba 21K km 12,3
e 19,95, e Indaiatuba 21K km 6,1.

## Comparação visual

`docs/percursos/etapa4/img4e/` mostra o mesmo ponto antes (4d) e depois (4e):

- **Av. Dom Aguirre (km 12,3):** tracejado entre faixas, bordas e linha azul.
- **Retorno da Alameda CIESP (km 19,52):** eixo amarelo da rua de mão dupla.
- **Ponte (km 19,95 e 42K km 40,97):** linha central e bordas sobre o tabuleiro.
- **Indaiatuba:** acostamento e faixas de pedestre.

## Limitações

1. **Trechos com a fita de sempre** (3% em Sorocaba, até 17,8% no Indaiatuba 21K, pela anomalia de altitude) continuam
   com a pintura e as linhas azuis do desenho antigo. Nas emendas, a pintura muda de estilo.
2. **Número de faixas.** Onde o OSM não informa `lanes`, o tracejado sai pela largura real ÷ 3,3 m. Pode não
   bater com a rua de verdade.
3. **Cones** só nos retornos dentro da mesma rua. Trocas de pista por passagem do canteiro (Av. Dr. Artur Bernardes)
   não ganham cones.
4. **Faixas de pedestre** só onde o OSM marca. Em cruzamentos sem marcação no mapa não aparecem.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `src/ruasOSM.js` | asfalto na largura real + acostamento; km da pista por vértice; `pinturaRuas` (bordas, eixo, tracejados, zebras, linha azul) e `conesDosRetornos` |
| `src/main.js` | malhas de acostamento, pintura (branca, amarela, azul) e cones; cor da inclinação no asfalto novo; juntas da ponte no modo novo; faixa de pedestre antiga sai no modo novo |
| `src/viaduto.js` | opção `alturaJunta` (padrão igual ao de sempre) |
| `scripts/percurso/exportar-ruas-jogo.mjs` | exporta número de faixas, mão e travessias de cada rua; acostamento conta como asfalto; versão `etapa4e-v1` |
| `public/ruas/*.json` | regenerados |
| `test/ruas-osm.test.js` | teste da 4e |

## Testes

`node --test test/*.test.js`: **132 passam**. `npx vite build`: ok.

## Como voltar atrás

- `?ruas=atual`: volta ao desenho de sempre (com o percurso da etapa 3).
- `?percurso=gps`: volta a tudo de antes.
- Sem parâmetro, nada muda.
