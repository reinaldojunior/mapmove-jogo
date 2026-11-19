# Mapmove Run

Jogo de corrida de rua no estilo endless runner (tipo Subway Surfers) para o [Mapmove](https://mapmove.com.br).

O corredor percorre uma prova de 3 faixas, pula cones e barreiras, desvia de cachorro, bicicleta e carro, pega moedas e gel e precisa passar nos pontos de hidratação: se a água acabar, a corrida termina.

## Comandos

- **Celular:** deslize para os lados para trocar de faixa e para cima para pular.
- **Teclado:** `←` `→` (ou `A` `D`) trocam de faixa, `↑` / `espaço` pula, `P` pausa.

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

- `src/main.js`: cena 3D (Three.js), corredor, cenário, obstáculos, HUD e controles.
- `src/regras.js`: regras puras (colisão, hidratação, pace), cobertas por `test/regras.test.js`.
