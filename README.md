# Mapmove Run

Jogo de corrida de rua no estilo endless runner (tipo Subway Surfers) para o [Mapmove](https://mapmove.com.br).

Dois modos:

- **Treino de reta:** pista reta sem fim para aprender os controles e fazer pontos. Bater num obstáculo termina a corrida.
- **Prova real:** percurso e altimetria da 1ª Meia Maratona de Indaiatuba (6K, 10K ou 21K), lidos do Supabase do Mapmove (`corrida_distancias.percurso`). Bater num obstáculo faz tropeçar e perder tempo; a corrida termina na chegada.

Regras:

- **Tempo:** 1 km de jogo leva 1 minuto a 6:00/km (o tempo de jogo corre 6x mais rápido que o real). O placar mostra o pace e o tempo reais.
- **Ritmo:** 7:30/km estável; segurando o acelerador vai até 6:30/km; com gel até 6:00/km por alguns segundos. Ao soltar ele freia aos poucos. Subida deixa mais lento e descida mais rápido, conforme a inclinação real.
- **Rua e calçada:** o corredor anda livre para os lados e vira nas esquinas. Na calçada perde velocidade; passou dela, leva penalidade e volta para a rota. 3 penalidades desclassificam.
- **Obstáculos:** cones e barreiras (pule), galhos baixos (abaixe), cachorro e carro atravessando, ciclista (desvie). Gel de carboidrato aparece nos trechos mais difíceis.
- **Hidratação:** a água vai acabando; nos pontos de hidratação (a cada 2 km na prova) deslize o botão para o lado para pegar um copo (+25, até 2 por posto). Se a água zerar, a corrida termina.

## Comandos

- **Analógico (esquerda):** arraste para cima para acelerar e para os lados para virar.
- **Botão de ação (direita):** para cima pula (ou toque), para baixo abaixa, para os lados pega água.
- **Teclado:** `←` `→` viram, `↑` acelera, `espaço` pula, `↓` abaixa, `E` pega água, `P` pausa.

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
- `src/controles.js`: analógico, botão de ação e teclado.
- `src/regras.js`: regras puras (ritmo, colisão, hidratação, formatos).
- `test/`: testes de `pista.js` e `regras.js` (`npm test`).
