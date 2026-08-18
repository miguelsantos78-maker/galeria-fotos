# 0044 — Um duplicado que virava falha permanente, e a ordem instável do painel

Data: 2026-08-18

## Contexto

Continuação da auditoria da ADR 0043, agora sobre a deteção de
duplicados no envio e sobre a listagem de administração.

## 1. `maybeSingle()` sobre uma coluna que não é única

`completeUpload` deteta duplicados assim:

```ts
const duplicate = await deps.photos.findByAlbumAndSha256(albumId, sha256);
if (duplicate) throw new AppError("PHOTO_DUPLICATE", ...);
```

E `findByAlbumAndSha256` fazia `.eq(...).eq(...).maybeSingle()`.

O problema é que `(album_id, sha256)` tem **índice, mas não é único**
(migração 0001), e a verificação é um verifica-depois-insere. Dois
convidados a enviar a mesma imagem ao mesmo tempo - a mesma fotografia
reencaminhada por WhatsApp, num casamento - passam ambos pela
verificação e ambos inserem.

A partir daí existem duas linhas com o mesmo `sha256` no álbum. E
`maybeSingle()` **valida a cardinalidade**: com mais do que uma linha
devolve `PGRST116`, verificado no código instalado
(`@supabase/postgrest-js`, `PostgrestBuilder.ts`):

```ts
if (this.isMaybeSingle && Array.isArray(data)) {
  if (data.length > 1) {
    error = { code: 'PGRST116', ... }
```

Esse erro era lançado, não estava mapeado para nenhum `AppError`, e
saía como `unhandled_error` (500). Não só nesse envio: **todos** os
envios futuros dessa fotografia para esse álbum passavam a rebentar da
mesma maneira, porque as duas linhas continuam lá.

Ou seja: um duplicado - que devia dar a mensagem "esta fotografia já foi
enviada" - transformava-se numa falha permanente com uma mensagem que
não explica nada. O mecanismo que existe para tratar duplicados era
partido pelo primeiro duplicado que aparecesse.

### Decisão

`.order("uploaded_at", { ascending: true }).limit(1).maybeSingle()`.

O `limit(1)` corta na origem, por isso a cardinalidade nunca é violada;
a ordenação escolhe a primeira que entrou - a original - para a resposta
ser estável entre tentativas em vez de depender de qual linha o Postgres
devolveu primeiro.

Vale a pena notar que todos os outros `maybeSingle()` do projeto sobre
colunas não únicas (`album_sessions.findValidForUser`,
`google_connections.findActiveByUser`, `findLatestByUser`) já traziam
`.order(...).limit(1)`. Este era o único que faltava.

### O que ficou por fazer, deliberadamente

A corrida em si continua a existir: dois envios simultâneos da mesma
imagem ainda criam duas linhas e dois ficheiros no Drive.

Fechá-la exigia um índice único parcial sobre
`(album_id, sha256) where deleted_at is null`. Não foi feito porque a
base de dados de produção já pode conter duplicados criados por esta
mesma corrida, e `create unique index` falha sobre eles - a migração
não aplicaria, e "resolver" isso automaticamente significava apagar
linhas de fotografias reais de convidados numa migração. A regra 11 da
secção 24 é explícita sobre migrações destrutivas.

O que resta é cosmético e recuperável: uma fotografia repetida na
grelha, que o administrador elimina. Antes desta correção o resultado
era um envio que nunca mais funcionava.

Se algum dia se quiser fechar de vez: contar os duplicados primeiro
(`group by album_id, sha256 having count(*) > 1`), decidir à mão o que
fazer a cada um, e só depois criar o índice.

## 2. Ordem instável na listagem de administração

`listForOwner` ordenava por `(sortBy, sort_order)` e paginava por
deslocamento (`range`). Nenhuma das duas colunas desempata: `sortBy`
pode ser `captured_at` (que empata à vontade, e pode ser nulo) e
`sort_order` é o relógio em milissegundos, o mesmo empate da ADR 0043.

Sem desempate, a ordem entre linhas empatadas não é garantida pelo
Postgres entre execuções. Com paginação por deslocamento, isso faz a
página 2 repetir ou saltar fotografias.

Num ecrã de leitura seria um incómodo. Neste não: é o ecrã onde o
administrador **elimina** fotografias. Ver a fotografia errada na
posição que se vai clicar é pior do que vê-la fora de ordem.

### Decisão

Acrescentar `.order("id", { ascending: false })` como desempate final.
Uma linha, sem alterar a estratégia de paginação (que continua por
deslocamento, pela razão já documentada no próprio método).

## Testes

`tests/unit/repositories/photos-repository.test.ts` (novo) exercita o
repositório contra o cliente Supabase **real**, com o `fetch`
substituído por um duplo que honra o `limit` como o PostgREST faz. Não é
um duplo do PostgREST: a validação de cardinalidade do `maybeSingle()`
vive dentro da biblioteca, por isso é essa mesma lógica que corre.

- a consulta leva `limit=1`;
- com duas linhas do mesmo `sha256`, devolve a original em vez de
  rebentar;
- sem nenhuma, devolve `null`.

Os dois primeiros falham com o código anterior.
