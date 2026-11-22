# Ideias guardadas — Mapmove Run

## Perlin noise (ruído de Perlin)

Técnica para gerar valores "aleatórios" que mudam aos poucos (vizinhos parecidos, ondas suaves), em vez do
sorteio solto do `Math.random()`. Soma de várias camadas (oitavas): grandes e lentas para a forma geral,
pequenas e rápidas para o detalhe.

Onde poderia entrar no jogo:
- Grama e terra com manchas naturais de cor (sem textura repetida).
- Árvores, torcida e prédios em grupos e vazios naturais ao longo da pista (hoje o sorteio é ponto a ponto).
- Morros do fundo com relevo de verdade.
- Nuvens se mexendo devagar no céu.
- Asfalto com variação de tom e desgaste.

## Shaders

Pequenos programas que rodam na placa de vídeo (GPU) e decidem a forma (vertex shader) e a cor de cada pixel
(fragment shader) de tudo que aparece na tela. No Three.js os materiais já são shaders prontos; dá para
escrever os próprios (`ShaderMaterial`) ou mexer nos prontos (`onBeforeCompile`).

Onde poderia entrar no jogo:
- Água do lago com ondas e reflexo se mexendo.
- Grama balançando com o vento (vertex shader), sem custo de animar cada folha.
- Céu com degradê e nuvens (junto com o Perlin noise).
- Asfalto quente com "miragem" no horizonte em dia de sol.
- Linhas de velocidade e brilho quando toma o gel; tela piscando quando a energia está baixa.
- Contorno (outline) no corredor para destacar do cenário.

Cuidado: shader pesado derruba o FPS no celular; testar sempre no aparelho mais simples.

## Pendentes

- Reformular pontos, XP e Move$ (inspirado no Subway Surfers: multiplicador por missões, moedas na pista,
  moeda rara/chaves para continuar, ranking).
- Garrafinha de água na loja (só hidrata, mais barata que o isotônico).
- Ranking semanal e geral.
- Modelos da Prefeitura e do Parque Mall; percurso dos 42K de Piracicaba.
