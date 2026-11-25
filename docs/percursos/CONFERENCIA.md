# Ferramenta de conferência visual (plano — requisito 2)

Objetivo: antes de qualquer percurso novo ou corrigido entrar no jogo, alguém **olha** e aprova. A ferramenta compara
o GPS original, o grafo OSM, o percurso ajustado, os sentidos das passagens e a elevação.

## Protótipo (etapa 1)

`scripts/percurso/conferir.py` gera uma imagem de um trecho: grafo (rua cinza com seta de mão única, pedestre fino,
ponte laranja, túnel roxo tracejado), GPS original em vermelho **numerado pela ordem**, e o perfil de altitude GPS ×
terreno com as pontes marcadas. Exemplo:

```bash
python3 scripts/percurso/conferir.py dados/percursos/9-maratona-sorocaba-novembro-azul-2026-11-21.json dados/grafos/9-maratona-sorocaba-novembro-azul-2026-11-21.json 42K 0.15 260 largada.png dados/relevo/9-maratona-sorocaba-novembro-azul-2026-11-21.json
```

Foi com ele que apareceu a causa da bagunça na largada do 42K (duas pistas de mão única separadas por canteiro).

## Ferramenta completa (a partir da etapa 2) — página interna, fora do jogo

Uma página HTML estática (Vite, rota separada, não publicada para jogadores) que lê os arquivos de `dados/`:

| Camada (liga/desliga) | Mostra |
|---|---|
| Grafo OSM | ruas por tipo; setas de mão única; pontes/túneis por camada (cor/elevação); nós de junção |
| GPS original | pontos na ordem, numerados; pontos descartados (saltos, túnel) em cinza |
| Percurso ajustado | linha por **passagem**, cor por passagem (1ª, 2ª…); seta de sentido a cada 100 m |
| Passagens por aresta | contador em cada aresta (ex.: "×4 ↑↓↑↓") — confere voltas, retornos e ida/volta |
| Confiança | trechos sem casamento em vermelho, com o motivo |
| Elevação | perfil GPS × terreno suavizado × altura final (terreno + estrutura), pontes e túneis marcados |
| Diferenças | distância oficial × geométrica × hoje; trechos onde o ajuste se afastou > X m do GPS |

Navegação: escolher prova/distância, deslizar pelo km (o mapa acompanha), clicar numa aresta para ver suas passagens
e tags OSM. Saída: um **relatório de aprovação** (prova, versão do percurso, quem aprovou, pendências) que a etapa 3
exige antes de trocar o percurso de uma prova no jogo.

## Regras

- Nenhum percurso novo ou alterado entra no jogo sem relatório aprovado.
- A ferramenta só lê; não grava no Portal/Supabase.
