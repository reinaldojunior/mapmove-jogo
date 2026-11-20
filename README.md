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
- **Placas e semáforos:** placas azuis com o nome da rua por onde o percurso passa e das ruas que cruzam (nomes do OpenStreetMap), placas marrons para parques, lagos e pontos turísticos a até 220 m (com aviso ao passar) e os semáforos reais do mapa.
- **Lugares conhecidos:** igrejas, escolas, comércios e postos do mapa viram modelos 3D do Higgsfield (igreja, escola, padaria, mercado, posto), sem nome, virados para a rua; o letreiro "Eu ♥ Indaiatuba", a Escultura da Árvore (treliça com luzes de Natal, feita no código a partir de foto) e o barco da Raia de Remo ficam nos lugares reais.
- **Música:** as mesmas faixas do simulador de percurso do Portal (`public/som`), em ordem aleatória; botão 🔊 no HUD liga/desliga e pausa junto com o jogo.
- **Sons:** corneta e torcida na largada, passos sintetizados (mais graves na calçada), respiração que cresce no começo e pesa nas subidas e com pouca energia, torcida de fundo (cheia na largada/chegada, maior na cidade) e na chegada torcida + "Conseguimos!" + fogos. Arquivos do simulador do Portal em `public/som` (origem em `public/som/ORIGEM.txt`). O botão 🔊 liga/desliga tudo.
- **Energia 🔋:** cai 0,085/s, mais nas subidas e com água abaixo de 25%; com gel ativo quase não cai. Gel repõe 35 e cada copo de água 3. Abaixo de 30% o corredor vai ficando lento (até 72% da velocidade). O 10K termina com ~40% sem gel; o 21K pede 1 ou 2 géis.
- **Evolução do corredor (`src/perfil.js`):** 5 níveis (Iniciante, Intermediário, Avançado, Sub-elite, Elite) em 34 degraus de pace, de 7:00 a 3:00/km; os degraus encolhem no topo e o XP de cada um cresce 14%. XP vem dos km, da prova completa, do desempenho e de missões; também se ganha Move$. Depois de 3 dias sem correr, perde XP de forma (até 2 degraus). O perfil fica salvo no aparelho (`mapmove-perfil-v1`); conta Mapmove, treinos, loja e ranking vêm nas próximas etapas. O gel é ~13% mais rápido que o pace do nível e a janela da água cresce com a velocidade.
- **Treino do dia (`src/treinos.js`):** catálogo de 40 treinos, 8 por nível, liberados de forma gradual (o Iniciante só faz rodagem, corre-caminha, acelerações e subida caminhando; pista e intervalados só a partir do Avançado). O jogo prescreve um treino por dia, alternando leve, forte, longo e regenerativo, sem dois fortes seguidos; libera à meia-noite. Com Move$ (90 por treino, ~3 provas de 10K) compra treinos extras sem limite, com o mesmo peso. O treino dá XP (60 no começo, +8% por degrau) e a sequência de dias dá bônus de Move$ (3, 7, 14 e 30 dias). Ao terminar aparece o pace executado, para que serve e a evolução. Os métodos são descritos sem nomes de treinadores.
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

Os nomes de ruas, lugares e pontos turísticos seguem exatamente o OpenStreetMap; o jogo não troca por apelidos.
