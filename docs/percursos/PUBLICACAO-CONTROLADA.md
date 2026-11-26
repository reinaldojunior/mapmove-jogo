# Publicação controlada: preparação e proposta de recordes e ranking

26/11/2026. Ramo `claude/sharp-hamilton-08y1qi`. **A `main` e a produção não foram tocadas** (produção continua no commit
`218b45d`). O banco Supabase, o Portal e o Strava não foram alterados.

## 1. O que foi preparado

A versão completa (etapas 3 e 4) está numa **prévia independente da Vercel**, gerada pelo ramo. A produção não muda.

| Endereço da prévia | O que mostra |
|---|---|
| sem parâmetro | o jogo atual, igual à produção |
| `?percurso=ajustado&ruas=osm` | o percurso novo com as ruas do mapa |
| `?percurso=gps&ruas=atual` | volta ao jogo atual (a escolha fica lembrada no aparelho) |
| `&fps=1` | medidor de quadros por segundo |

Para a prévia ser segura, entraram duas mudanças pequenas.

1. **A prévia não grava nada na conta.**
   - O `vite.config.js` marca o build quando a Vercel gera uma prévia (`VERCEL_ENV=preview`).
   - Na prévia:
     - não há login;
     - nada é gravado no Supabase (perfil, corridas do ranking, fantasmas, amigos);
     - o Strava não é chamado.
   - Aparece o selo "PRÉVIA DE TESTE · nada é gravado na conta".
   - Leituras (ranking, desafio por link) continuam.
   - **Em produção a marca é `false`, e o código da prévia nem entra no pacote** (conferido no build).
   - Sem isso, quem entrasse com o Google na prévia gravaria no banco de produção, porque o endereço do Supabase é fixo
     no código.
2. **Desafio fantasma só no percurso em que foi gravado.**
   - Os fantasmas existentes foram gravados no percurso de sempre.
   - Com `?percurso=ajustado`, um link de desafio não liga o fantasma e mostra um aviso.
   - Antes, o fantasma do percurso antigo corria no percurso novo, com distâncias diferentes. Era a única mistura de
     resultados que ainda existia.

3. **Defeito corrigido no 42K do modo novo** (achado na corrida completa desta preparação).
   - **Onde:** km 40,55, volta 2.
   - **O que acontecia:** o traçado ajustado tinha um "espeto". O casamento do GPS com o mapa entrou 4,7 m na
     Alameda CIESP e voltou pela mesma rua. Ali o corredor podia ficar preso indo e voltando; travou em 2 de 3
     tentativas.
   - **Correção:** o exportador da etapa 3 (`semEspetos` em `scripts/percurso/exportar-jogo.mjs`) tira idas e voltas
     na mesma rua com menos de 15 m em cada perna. Os retornos de verdade ficam, porque os da CIESP têm 40–49 m.
   - **Resultado:**
     - só o 42K mudou: saiu 1 ponto, e a distância foi de 41,870 para 41,868 km;
     - as outras 4 distâncias ficaram idênticas;
     - a versão do percurso passou a `etapa3-v2`, e as ruas foram regeneradas;
     - medidas do desenho iguais: 0 degrau, 0 fresta, vão 7 m, fita do 42K 3,2%;
     - no mesmo ponto, 5 de 5 tentativas chegaram ao fim sem recuo.

Nada mudou em regras, física, colisões ou movimentação. A altitude do GPX não foi tocada.

## 2. Proposta para recordes e ranking

**Regra geral:** um resultado só se compara com resultados do mesmo percurso, definido por prova + distância +
traçado. Nada é apagado, convertido ou sobrescrito.

### Como está hoje (código da prévia)

| Item | Percurso de sempre | Percurso ajustado (teste) |
|---|---|---|
| Recorde de tempo (no aparelho) | `mapmove-recorde-<prova>-<distância>`, intocado | chave própria `…-ajustado`, começa vazia |
| Selo de recorde na escolha da distância | recorde de sempre | recorde do ajustado |
| Ranking semanal / 30 dias (`jogo_corridas`) | envia como sempre | **não envia** |
| Desafio fantasma (`jogo_fantasmas`) | grava e joga como sempre | não grava e não joga (aviso) |
| Distância oficial da prova | a do GPS de hoje (ex.: 21K Sorocaba 20,93 km) | a das ruas (21,16 km) |
| XP, Move$, medalhas de colocação, conquistas | contam | **contam também** (ver decisão abaixo) |

### Distâncias diferentes

Cada traçado tem a sua distância:

| Prova | Percurso de sempre | Percurso ajustado | Diferença |
|---|---|---|---|
| Sorocaba 21K | 20,928 km | 21,158 km | +1,1% |
| Sorocaba 42K | 41,522 km | 41,868 km | +0,8% |
| Indaiatuba 6K | 6,123 km | 6,140 km | +0,3% |
| Indaiatuba 10K | 9,938 km | 10,001 km | +0,6% |
| Indaiatuba 21K | 20,837 km | 20,964 km | +0,6% |

Um tempo do percurso de sempre não é convertido para o novo. Ele continua valendo no percurso em que foi feito.

### Decisão: XP, Move$, medalhas e conquistas no modo de teste

**Decidido em 26/11/2026: opção C, publicar como está.** No modo de teste, a corrida soma XP, Move$, medalhas,
conquistas e usa a mochila como qualquer corrida. Recordes de tempo, ranking e fantasma continuam separados (tabela
acima). As opções avaliadas:

Hoje, uma corrida com `?percurso=ajustado` soma XP e Move$, dá medalha de colocação e conquista da prova, e gasta os
itens da mochila, como qualquer corrida. Com login, esse perfil vai para a nuvem. Na prévia isso não acontece, porque
ela não grava nada. Se o modo de teste for liberado em produção atrás dos parâmetros, valem três opções:

| Opção | Como fica | Prós | Contras |
|---|---|---|---|
| **A (recomendada para a fase controlada)** | Corrida de teste não altera o perfil: sem XP, Move$, medalhas, conquistas e prêmios, e sem usar a mochila (só os géis pegos na pista). Aviso claro no fim | dados dos jogadores 100% intactos; nenhuma mistura | quem testa não ganha nada pela corrida |
| B | XP e Move$ pelos km corridos (como um treino), mas medalhas, conquistas e prêmios de colocação só no percurso de sempre | testar continua valendo a pena | XP de um percurso ainda em teste entra no perfil |
| C | Tudo conta, como hoje | nada a mudar | medalha e conquista "da prova" misturam os dois percursos |

### Se um dia o percurso novo virar o padrão (fora desta fase)

- **Sem mudar o banco:**
  - os recordes de sempre ficam guardados e aparecem como "percurso anterior";
  - os do ajustado passam a ser os recordes da prova.
- **Ranking:** ele soma pontos da semana, e não tempos.
  - A troca deve ser numa segunda-feira, quando a semana zera, para uma semana não ter corridas dos dois percursos.
  - O ranking de 30 dias mistura no máximo um mês. Alternativa: mostrar o aviso "percurso atualizado em dd/mm".
- **Fantasmas antigos:** continuam abrindo, mas só no percurso anterior, ou ficam indisponíveis com aviso. Nenhum é
  apagado.
- Isso exige uma nova aprovação. Nada disso foi feito.

## 3. Segurança: o que foi preservado

| Exigência | Como |
|---|---|
| Não alterar o Supabase | nenhuma tabela ou função mudou; a prévia não grava nada (bloqueio no código e teste automático) |
| Não modificar dados dos jogadores | prévia sem login; em produção nada muda |
| Não apagar nem sobrescrever recordes | chaves separadas; nenhuma chave antiga é escrita no modo de teste |
| Regras, física, colisões, movimentação | sem mudança (corrida completa nas 5 provas, abaixo) |
| Portal e integrações | nada mudou; o Strava não é chamado na prévia |
| Voltar atrás | ver seção 5 |

## 4. Conferências

| Verificação | Resultado |
|---|---|
| Testes automáticos | **134 passam** (2 novos: a conta funciona normal sem a marca; na prévia nenhuma gravação passa) |
| Build de produção | sem nenhum código da prévia (texto do selo ausente no pacote) |
| Build da prévia na Vercel | o pacote publicado (`index-DeeFN0sX.js`) é o mesmo do build de prévia local, com o selo |
| Prévia local (marca ligada) | selo aparece; "Entrar com Google" mostra "Prévia de teste: nada é gravado na conta"; 0 requisição de gravação; 0 erro |
| Build normal (sem marca) | sem selo; "Entrar com Google" leva ao Google, como em produção |
| Corrida completa, 5 provas × 2 modos | todas chegam, 0 penalidade, 0 erro, 0 gravação (tabela abaixo) |
| Pontes, cruzamentos, avenidas, retornos; comparação com produção; desempenho | sem mudança de desenho desde a validação final: valem os números de `etapa4/VALIDACAO-FINAL.md` (0 degrau, 0 fresta, vão 7 m; FPS médio 6,34 → 6,68; triângulos 256 mil → 209 mil) |

### Corrida completa (piloto automático da largada à chegada)

| Prova | Padrão: chega / recuos / penal. / erros | Novo (após a correção): chega / recuos / penal. / erros | Gravações na rede |
|---|---|---|---|
| Sorocaba 21K | sim / 0 / 0 / 0 | sim / 0 / 0 / 0 (21,158 km) | 0 |
| Sorocaba 42K | sim / 5* / 0 / 0 | sim / 0 / 0 / 0 (41,868 km) | 0 |
| Indaiatuba 6K | sim / 0 / 0 / 0 | sim / 0 / 0 / 0 (6,140 km) | 0 |
| Indaiatuba 10K | sim / 0 / 0 / 0 | sim / 0 / 0 / 0 (10,001 km) | 0 |
| Indaiatuba 21K | sim / 0 / 0 / 0 | sim / 0 / 0 / 0 (20,964 km) | 0 |

\* Os recuos do 42K padrão já acontecem em produção hoje (GPS atual do Portal) e variam de uma corrida para outra.
Recordes gravados: nas chaves de sempre no padrão e nas `…-ajustado` no modo novo.

## 5. Como reverter

- **No aparelho:** `?percurso=gps&ruas=atual`, ou abrir sem parâmetro num aparelho que nunca ligou o modo.
- **Prévia:** é só um endereço de teste; a produção não depende dela. Basta não usar.
- **Código:** a `main` não recebeu nada. Se um dia receber, `git revert` do merge volta ao estado `218b45d`. A Vercel
  também permite voltar à publicação anterior ("Instant Rollback"; a atual é `dpl_H3aNaaXvyxE6h5ELkqkjf7GeL6Tj`).
- **Desligar só o modo novo:** apagar `public/percursos/` e `public/ruas/`.

## 6. Teste no celular (depois da publicação)

26/11/2026: o usuário testou o modo novo no próprio celular, em produção, com `?percurso=ajustado&ruas=osm&fps=1`.
Resultado relatado: **fluido, sem travadas**. Os valores de FPS não foram anotados.
