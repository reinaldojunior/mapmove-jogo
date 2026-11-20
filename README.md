# Mapmove Run

Jogo de corrida de rua no estilo endless runner (tipo Subway Surfers) para o [Mapmove](https://mapmove.com.br).

Dois modos:

- **Treino de reta:** pista reta sem fim para aprender os controles e fazer pontos. Bater num obstáculo termina a corrida.
- **Prova real:** percurso e altimetria da 1ª Meia Maratona de Indaiatuba (6K, 10K ou 21K), lidos do Supabase do Mapmove (`corrida_distancias.percurso`). Bater num obstáculo faz tropeçar e perder tempo; a corrida termina na chegada.

Regras:

- **Tempo:** 1 km de jogo leva 1 minuto a 6:00/km (o tempo de jogo corre 6x mais rápido que o real). O placar mostra o pace e o tempo reais.
- **Ritmo:** o corredor corre sozinho a 7:30/km; com gel vai a 6:30/km por 15 s. Subida deixa mais lento e descida mais rápido, conforme a inclinação real.
- **Largada:** contagem 3-2-1 com bipe.
- **Rua e calçada:** o corredor anda livre para os lados e vira nas esquinas. Na calçada perde velocidade; passou dela, leva penalidade e volta para a rota. 3 penalidades desclassificam.
- **Obstáculos:** cones e barreiras (pule), galhos baixos (abaixe ou passe pelo meio), cachorro atravessando, ciclista (desvie) e carros saindo das travessas principais. Bater faz tropeçar e perder velocidade.
- **Cenário real:** `public/osm/<slug>.json` traz do OpenStreetMap os parques, matas, gramados, lagos, rios, trilhas, prédios e ruas numa faixa em volta do percurso. O jogo desenha essas áreas, levanta os prédios, planta árvores nas áreas verdes, coloca pedalinhos nos lagos e decide por trecho se é parque (árvores, postes e bancos, torcida rala) ou cidade. As travessas saem das ruas reais desse arquivo. Dados © colaboradores do OpenStreetMap (ODbL).
- **Modelos 3D:** atleta do simulador do portal; carro, mesa de água, barreira, ipê, árvore, banco, poste, pedalinho e torcedor gerados no Higgsfield (Tripo).
- **Gel:** aparece nos trechos mais difíceis e fica guardado (até 5) no botão ⚡ para usar quando quiser.
- **Hidratação:** a água vai acabando. Os postos ficam nos pontos marcados no KML/GPX da prova (H1, H2…) ou a cada 2 km. As mesas ficam dentro da rua, encostadas numa lateral: encoste nelas e toque na gota 💧 quando o anel ficar verde (+25 por mesa, 2 mesas por posto). Se a água zerar, a corrida termina.

## Comandos

- **Virar:** arraste o dedo para os lados ou dê toques rápidos no lado esquerdo/direito da tela.
- **Pular / abaixar:** deslize para cima / para baixo.
- **⚡ Gel**, **💧 água** e **🎥 câmera** (normal ou afastada) nos botões da tela.
- **Teclado:** `←` `→` viram, `↑`/`espaço` pula, `↓` abaixa, `G` gel, `E` água, `C` câmera, `P` pausa.

## Rodar

```bash
npm install
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

## Publicar na Vercel

Importe o repositório na Vercel; ela detecta o Vite sozinha (build `npm run build`, saída `dist`). Nenhuma variável de ambiente é necessária.

## Estrutura

- `src/main.js`: cena 3D (Three.js), corredor, rua seguindo o percurso, cenário, obstáculos, HUD, minimapa e telas.
- `src/pista.js`: geometria do percurso (lat/lng → metros, esquinas arredondadas, inclinação, projeção do corredor na rua).
- `src/controles.js`: gestos na tela e teclado.
- `src/travessas.js`: cruzamentos reais (OpenStreetMap) e travessas genéricas.
- `src/regras.js`: regras puras (ritmo, colisão, hidratação, formatos).
- `test/`: testes de `pista.js`, `regras.js` e `travessas.js` (`npm test`).
