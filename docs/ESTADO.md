# Estado do projeto — Mapmove Run

Resumo para quem continuar o projeto (pessoa ou Claude em outra conta/sessão). Leia também o `CLAUDE.md`
(regras de personagens 3D e de jogo) e o `docs/ideias.md` (ideias guardadas).

Atualizado em 25/11/2026.

## O que é

Jogo de corrida no celular (navegador) em percursos reais de provas de rua: o corredor segue o GPS da prova,
com altimetria, postos de água, clima, pelotão de NPCs e evolução de pace por XP.

- Site: https://jogo.mapmove.com.br (o antigo mapmove-jogo.vercel.app redireciona para lá).
- Repositório: `reinaldojunior/mapmove-jogo`. **Push na `main` publica sozinho na Vercel.**
- Stack: Vite + Three.js (r187), JavaScript puro, sem framework. Textos e comentários em português.

## Como rodar e testar

```bash
npm install
npx vite --port 5199          # servidor local
node --test test/*.test.js    # testes (todos têm que passar)
npx vite build                # build de produção
```

- Em modo de desenvolvimento existe `window.__dbg` (entidades, estado, `em(s)`, `festa(modo)`, `chao(x,z)`, travessas)
  para testes com Playwright (teleportar o corredor para um km, forçar o carro desgovernado etc.).
- Medição automática da pista (sobreposição de ruas, buracos, dobras), quando a correção da pista estiver na main:
  `NODE_USE_ENV_PROXY=1 node scripts/checar-sobreposicao.mjs --cache <pasta>` (`--falhar` dá erro se houver
  sobreposição; `--mapa 21K:9.4` gera imagem vista de cima daquele ponto).

## Serviços

| Serviço | Para quê | Observações |
|---|---|---|
| GitHub | código | `reinaldojunior/mapmove-jogo` |
| Vercel | hospedagem, domínio, função `api/strava.js` | variáveis: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `SUPABASE_SERVICE_KEY` |
| Supabase | login Google, ranking, amigos, desafio fantasma, atividades Strava | projeto `ssfsxdmzbubvygctdjgf`; chave pública em `src/conta.js`; tabelas `jogo_*` com RLS |
| Strava | corridas e caminhadas reais viram XP (a partir do dia em que conectou) | |
| Higgsfield / Meshy | imagens, ícones e modelos 3D | regras de pose e de "sem logotipo" no `CLAUDE.md` |

**Segurança:** nunca colar no chat segredos (Client Secret do Strava, service key do Supabase, Client Secret do
Google, tokens). Eles ficam só nas variáveis de ambiente da Vercel. Não descriptografar variáveis da Vercel.
Personagens sempre anônimos (nada de rosto de pessoa real) e sem marcas.

## Mapa do código

- `src/main.js` — o jogo (cena, pista desenhada, entidades, HUD, telas, provas, loja, ranking, Strava).
  - `PROVAS`: lista de provas (slug do Portal, cidade, nome genérico sem a marca do evento, `relevo`).
  - Carro desgovernado só em Sorocaba (`PROVA_DO_CARRO`): um por km, e no último km com viatura e sirene.
- `src/pista.js` — `PistaReal`: reamostra o GPS a cada 5 m, junta trechos repetidos, folga lateral, altura do desenho.
- `src/osm.js` + `public/osm/<slug>.json` — entorno do OpenStreetMap (parques, prédios, ruas, avenidas de pista dupla).
  Gerado por `scripts/gerar-osm.py`.
- `src/travessas.js`, `src/pelotao.js` (NPCs e colocação), `src/clima.js`, `src/medalhas.js`, `src/fantasma.js`,
  `src/cartao.js` (cartão para compartilhar), `src/ceu.js`, `src/grama.js` (shaders), `src/vitrine.js` (personagem 3D
  na loja e na tela inicial), `src/som.js`, `src/perfil.js` (XP, níveis, Move$), `src/regras.js`, `src/loja.js`.
- `index.html` + `src/style.css` — telas. A tela inicial é estilo jogo mobile (fundo `public/ui/fundo.svg`,
  personagem 3D correndo, botão JOGAR, 6 atalhos que abrem painéis). Ranking e amigos no mesmo estilo.
- `test/` — testes em `node --test`.

## Provas no jogo

- **Meia de Indaiatuba** (6K, 10K, 21K) — relevo desenhado.
- **Desafio 42K – Bora correr em Sorocaba** (21K e 42K) — desenho plano (`relevo: 0`); ida e volta pelas
  avenidas Dom Aguirre e 15 de Agosto; ponte Dom José Melhado Campos sobre o rio com viaduto sobre as avenidas.
- O percurso vem do Portal (Supabase, `corrida_distancias.percurso`). Prova nova = entrada em `PROVAS`
  + `public/osm/<slug>.json`.

## Em andamento (24/11/2026)

- **Correção da pista "uma rua invadindo a outra" (Sorocaba e Indaiatuba):** feita por um agente corretor e em
  conferência por outro, no ramo `correcao-pista-sorocaba` (ainda **não** está na main). Trouxe
  `src/faixas.js`, o medidor `scripts/checar-sobreposicao.mjs` e a ponte elevada. Pendências conhecidas:
  folgas de ~1 m no canto interno de alguns cruzamentos (21K km 1,85; 42K km 8,6, 20,6 e 21,8), retornos fechados
  a conferir jogando (21K km 19,3; 42K km 39,1), câmera afastada atravessando o tabuleiro da ponte.
  Para publicar: conferir, juntar o ramo na `main` e dar push.
- **Conferência em 25/11/2026** (sessão Claude, ramo `claude/sharp-hamilton-08y1qi` = `main` + `correcao-pista-sorocaba`,
  sem conflito): 71 testes passam, build ok. Medidor: **0 m² de rua sobre rua e de calçada sobre rua** nas 5 distâncias;
  viadutos da ponte só onde esperado; sobram só as pendências já conhecidas — corredor fora do asfalto em 5 m no 21K
  (km 1,85) e 15 m no 42K (km 8,61, 20,56, 21,78), 2,5–2,8 m² de grama escondida sob a rua em Sorocaba e 0,3 m² de
  calçada dobrada no 10K de Indaiatuba (km 3,19). Por causa do "fora do asfalto", `--falhar` ainda sai com código 1.
  O medidor precisa do host `ssfsxdmzbubvygctdjgf.supabase.co` liberado na rede (ambiente de nuvem "mapmove-jogo").

- **Correção concluída em 25/11/2026** (ramo `claude/sharp-hamilton-08y1qi`, ainda sem push): `--falhar` sai com
  código 0. Medidor nas 5 distâncias: 0 m² de rua sobre rua e de calçada sobre rua, corredor sempre no asfalto,
  viadutos só na ponte, nenhum triângulo virado. Mudanças (gerais, sem remendo por km):
  - `src/faixas.js`: amostras a cada 1 m onde o corredor sai da rua de outro trecho para a do próprio trecho ou onde
    um pedaço desenhado entra num trecho repetido (a beira reta entre amostras de 4 m deixava o eixo descoberto);
    retorno fechado (virada > 50° numa amostra) vira **leque** (ponta arredondada por fora, eixo por dentro — antes
    sobrava um fiapo de rua); beira da rua encolhida só o necessário para respeitar o meio do caminho (antes sobrava
    uma tira de grama de ~0,75 m entre ida e volta lado a lado, vista no 21K km 1,29–1,31 depois do retorno da
    Av. Dr. Artur Bernardes: não era canteiro, era grama entre as duas ruas com as linhas azuis de cada lado).
  - `src/pista.js`: **30 m de rua atrás da largada sempre inteiros** (o pelotão espera até ~20 m atrás); num circuito
    a chegada é que encosta nela (antes, em Sorocaba, a rua sumia e o pelotão ficava na grama). Folga entre duas
    ruas lado a lado 0,1 m (calçada/grama continuam com 0,3 m). Ponto colado que o alisamento afastou mais de 3 m da
    passagem anterior (esquina cortada na 2ª volta, 42K km 21,78) volta a ser desenhado.
  - Medidor: nova linha "área do pelotão atrás da largada sem asfalto" (antes: 45 pontos no 21K e 143 no 42K).
  - No 21K km 1,3 o GPS da ida e da volta fica na mesma pista (oeste) da avenida; a outra pista fica a ~11 m do mesmo
    lado físico nos dois sentidos — ida e volta colam numa rua só, como a prova real com retorno em cones.
  - Sobra (sem efeito visível): grama escondida sob a rua 2,5 m² (21K) e 2,0 m² (42K) de Sorocaba; 0,3 m² de calçada
    dobrada no 10K de Indaiatuba km 3,19. Linha fina de grama (~0,1–0,25 m) entre ida e volta lado a lado.
  - Conferido jogando (Playwright): largada com asfalto atrás do tapete, retornos 21K km 19,3 e 42K km 39,1 sem
    buraco, ponte com a câmera normal ok. Não conferida a câmera afastada na ponte.

## Próximos passos sugeridos

- **Encaixar o percurso nas ruas reais do OpenStreetMap (map matching, ex.: OSRM ou Valhalla)** em vez de desenhar
  a partir do GPS: cada rua uma vez só, com largura, faixas, canteiro e pontes/viadutos (tags `bridge`/`layer`)
  certos para qualquer cidade nova.
- Equipes/assessorias; ligação com a prova real (QR code); monumentos 3D de Sorocaba (precisa de fotos);
  sirene com áudio real; ícones da tela inicial no padrão 3D do Higgsfield quando houver créditos.
- Conferir no celular: painéis Conta/Strava e Treino do dia, áudio do drift e da sirene, compartilhar no celular.
