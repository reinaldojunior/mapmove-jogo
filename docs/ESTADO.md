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
- **Refino automático do percurso (vale para toda prova, `src/refino.js`):** ao carregar a prova, cada distância
  com GPS mais espaçado é encaixada na distância mais detalhada da mesma prova que cubra ≥ 90% dos seus pontos
  (a até 20 m), respeitando o sentido (ida e volta lado a lado não se trocam). Assim voltas repetidas caem no mesmo
  lugar e as curvas não são cortadas. Ex.: o 42K de Sorocaba (2 voltas do 21K, um ponto a cada ~77 m) virou
  41,22 km sobre o traçado do 21K (antes 40,62 km com ruas tortas lado a lado). Nada é gravado no Portal; o
  medidor (`scripts/checar-sobreposicao.mjs`) usa o mesmo refino. Sem fonte que cubra, a distância fica como veio.
  Resta 1,5 m² de rua sobre rua no retorno do 42K km 1,23 / 22,14 (emenda das duas voltas).

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

## Projeto de percursos (arquitetura híbrida GPS + grafo OSM)

Aprovado em 25/11/2026 (alternativa C). **Etapa 1 feita** (fundação, sem mudar o jogo): grafo OSM exportado
(`scripts/percurso/exportar-grafo.py` → `dados/grafos/`), banco de testes (`scripts/percurso/sinteticos.mjs`,
`dados/percursos/`, `test/percursos.test.js`), investigação de elevação (`scripts/percurso/relevo.py` →
`dados/relevo/`) e protótipo da conferência visual (`scripts/percurso/conferir.py`). Documentação em
`docs/percursos/` (ARQUITETURA, NIVEIS-E-ELEVACAO, CONFERENCIA).

**Etapa 2 feita** (map matching offline, ainda sem mudar o jogo; aguardando aprovação para a etapa 3): relatório em
`docs/percursos/etapa2/RELATORIO.md` com as imagens antes × depois em `docs/percursos/etapa2/img/`.

- Matching: `scripts/percurso/matching.mjs` (HMM/Viterbi sobre o grafo OSM, fallback sem ligação inventada).
- Rodar: `node scripts/percurso/casar.mjs <slug>` → `dados/casados/`;
  `python3 scripts/percurso/elevacao.py <slug> <cache>` → `dados/elevacao/` (GPS, terreno e altura de ponte separados);
  `scripts/percurso/relatorio-imagens.sh` gera as imagens.
- Resultado:
  - Sorocaba 21K 21,189 km (99,7% casado) e 42K 41,592 km (99,3%). Fallback só na ligação Alameda CIESP → alça da
    ponte Dom José, que falta no OSM.
  - Indaiatuba 100% casado.
  - A altitude do GPS do 21K de Indaiatuba é incoerente (erro de 18 m); está marcada e **não foi corrigida**.

**Etapa 3 feita** (percurso lógico ajustado na corrida, **modo de teste desligado por padrão**; aguardando aprovação
para a etapa 4, o novo desenho das ruas): relatório em `docs/percursos/etapa3/RELATORIO.md`.

- Ligar: `?percurso=ajustado` (lembrado no aparelho). Desligar: `?percurso=gps`.
- Sem o arquivo `public/percursos/<slug>.json`, a distância fica com o percurso de antes.
- No modo de teste os recordes ficam à parte, a corrida não vai para o ranking e não grava fantasma.
- Regerar depois de mudar o GPS no Portal: atualizar `dados/percursos/`, depois `casar.mjs`, depois `elevacao.py`,
  depois `exportar-jogo.mjs`.
- Comparar: `node scripts/percurso/comparar-pistas.mjs`.
- O GPS do 42K de Sorocaba mudou no Portal em 25/11/2026 (528 → 590 pontos): no jogo de hoje ele tem 41,52 km e, na
  simulação, recua e salta no retorno da volta 2. No ajustado tem 41,87 km, sem recuo.

**Etapa 4 (novo desenho das ruas a partir do OSM), 4a–4e aprovadas, validação final feita:**

- **Publicado em produção em 26/11/2026** (`main` = `ad761cc`, Vercel `dpl_ZYyY1zCdgYo8C1gL1K5mC24Aj2uS`). Sem parâmetro o jogo
  é o de antes; o modo novo só com `?percurso=ajustado&ruas=osm`. Voltar: Instant Rollback para
  `dpl_H3aNaaXvyxE6h5ELkqkjf7GeL6Tj` (`218b45d`). Corrigido antes da publicação: espeto do 42K km 40,6 (`etapa3-v2`).
- **Publicação controlada preparada (26/11/2026):** `docs/percursos/PUBLICACAO-CONTROLADA.md`
  (proposta de recordes e ranking, conferências). Prévias da Vercel não gravam nada na conta (`vite.config.js` marca
  `VERCEL_ENV=preview`; selo "PRÉVIA DE TESTE"); em produção nada muda. Desafio fantasma não roda no percurso ajustado.
  Pendente: escolher a opção de XP/medalhas no modo de teste (A recomendada).
- **Validação final aprovada (26/11/2026):** relatório em
  `docs/percursos/etapa4/VALIDACAO-FINAL.md`, imagens produção × novo em `docs/percursos/etapa4/img-final/`.
  Padrão idêntico à produção; 5 provas até a chegada sem penalidade nem recuo; desenho com 0 degrau e 0 fresta.
  Teste no Galaxy A05 real dispensado pelo usuário (recomendado antes de publicar).
- **4a aprovada:** imagens em `docs/percursos/etapa4/`.
- **4e aprovada:** acabamento visual (bordas na largura real, acostamento, cor de rampa, juntas da
  ponte, pintura, faixas de pedestre do OSM, linha azul, cones). Relatório em `docs/percursos/etapa4/ETAPA-4E.md`.
- **4d aprovada:** ponte com o desenho novo sobre a estrutura de `src/viaduto.js` (vão 7 m; rampas do
  42K e descida do 21K seguem com a fita). Relatório em `docs/percursos/etapa4/ETAPA-4D.md`.
- **4c aprovada:** cruzamentos (cantos arredondados) e ruas que cruzam (50 m, somem no fim).
  Relatório em `docs/percursos/etapa4/ETAPA-4C.md`.
- **4b aprovada:** ruas do percurso e avenidas duplas no jogo, só com `?ruas=osm` junto com
  `?percurso=ajustado`. Relatório em `docs/percursos/etapa4/ETAPA-4B.md`.
  - Geometria em `src/ruasOSM.js`; dados em `public/ruas/`, gerados por
    `node scripts/percurso/exportar-ruas-jogo.mjs`.
  - `?fps=1` mostra quadros por segundo (para testar no celular).
- **Correção do viaduto falso da Rua Ubirajara:** `viadutosDoPercurso(..., { mesmaPassagem })` em `src/osm.js`, só no
  percurso ajustado.

## Próximos passos sugeridos

- **Encaixar o percurso nas ruas reais do OpenStreetMap (map matching, ex.: OSRM ou Valhalla)** em vez de desenhar
  a partir do GPS: cada rua uma vez só, com largura, faixas, canteiro e pontes/viadutos (tags `bridge`/`layer`)
  certos para qualquer cidade nova.
- Equipes/assessorias; ligação com a prova real (QR code); monumentos 3D de Sorocaba (precisa de fotos);
  sirene com áudio real; ícones da tela inicial no padrão 3D do Higgsfield quando houver créditos.
- Conferir no celular: painéis Conta/Strava e Treino do dia, áudio do drift e da sirene, compartilhar no celular.
