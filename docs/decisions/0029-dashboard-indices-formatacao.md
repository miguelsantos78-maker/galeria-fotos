# 0029 — Dashboard sem carregar tudo, índices parciais e formatação no `check`

Data: 2026-08-06

## Contexto

Fecho dos pontos que ficaram identificados nas auditorias anteriores
(ADRs 0026–0028) e que não dependiam de nenhuma decisão do
administrador.

## Decisão

### 1. `getDashboardStats` deixa de carregar tudo para memória

`server/use-cases/dashboard.ts` carregava **todas** as fotografias e
**todos** os envios do dono para memória, só para produzir dois
números e uma lista de cinco. Com 1000 fotografias isso significava
transferir 1000 linhas completas do Postgres a cada abertura do painel
de administração.

Passa a haver uma consulta por valor, cada uma a devolver exatamente o
que é preciso:

- `photos.countForAlbumIds` e `uploadJobs.countFailedForAlbumIds` —
  contagens com `head: true` (o Postgres devolve só o número, nenhuma
  linha atravessa a rede);
- `photos.listRecentForAlbumIds(albumIds, 5)` — só as cinco mais
  recentes, ordenadas no Postgres em vez de em JavaScript.

`listForAlbumIds` mantém-se: `drive-sync.ts` precisa mesmo de percorrer
cada linha. Os testes existentes do dashboard passaram sem qualquer
alteração, o que confirma que o comportamento observável não mudou.

### 2. Índices parciais para o filtro que está sempre presente

`supabase/migrations/0008_photos_partial_indexes.sql`. Praticamente
todas as leituras de `photos` filtram por `deleted_at is null` (galeria,
administração, contagens, deteção de duplicados), mas nenhum dos
índices incluía essa condição — o Postgres tinha de percorrer também as
linhas já eliminadas antes de as descartar.

Os quatro índices passam a ser **parciais** (`where deleted_at is
null`), o que além de os tornar mais seletivos os faz ocupar menos
espaço, por só indexarem as linhas que a aplicação realmente lê. Cada
`create index` novo é seguido do `drop index` do equivalente antigo,
que passa a ser redundante — inclui o criado na migração 0007, que
ainda não era parcial.

### 3. Formatação passa a fazer parte do `pnpm check`

O `pnpm format:check` falhava em 48 ficheiros, e falhava havia muito
(verificado: 47 já falhavam três commits antes) — porque `pnpm check`
era só `lint && typecheck && test`, e a CI corre `check`. Nunca chegou
a ser validado por ninguém.

Corrida a formatação a tudo e acrescentado `format:check` ao `check`,
para não voltar a acumular. A CI passa a validá-lo sem alterações (já
corria `pnpm check`); só o nome do passo foi atualizado.

`docs/implementation-status.md` exigiu uma correção à parte: o Prettier
não era idempotente nesse ficheiro, oscilando a cada execução. A causa
eram trechos de código inline (entre crases) partidos ao meio por uma
quebra de linha — o parser de markdown do Prettier trata a indentação
da continuação de forma inconsistente. Reescritas as três ocorrências
para que cada trecho fique inteiro numa linha; o Prettier estabilizou.

## Verificação

`pnpm check` completo, agora incluindo `format:check` (lint +
typecheck + formatação + 221 testes) e `pnpm build`. Suite E2E (18
testes). Sem testes novos: as três mudanças são otimizações e higiene
sem comportamento novo observável — a garantia relevante é precisamente
que os testes existentes continuam a passar sem alteração.

## Limitações conhecidas / a aplicar em produção

- `supabase/migrations/0007` e `0008` continuam por aplicar ao projeto
  Supabase de produção (`supabase db push` ou SQL Editor). A 0008
  substitui índices criados pela 0007, por isso devem ser aplicadas por
  ordem.
- `CRON_SECRET` continua por configurar na Vercel — sem isso, a
  sincronização com o Drive e a limpeza de registos (ADR 0028) não
  chegam a correr.
