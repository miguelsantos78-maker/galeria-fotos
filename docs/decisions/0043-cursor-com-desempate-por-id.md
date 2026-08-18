# 0043 — Fotografias que desapareciam da galeria: o cursor sem desempate

Data: 2026-08-18

## Contexto

Auditoria ao projeto à procura de erros, melhorias e otimizações, desta
vez virada para integridade de dados e não para velocidade (como as
ADRs 0038–0042).

## O que estava errado

A paginação por cursor da galeria pública usava só o `sort_order`:

```ts
query = query.lt("sort_order", before);
// ...
.order("sort_order", { ascending: false })
```

E `photos.sort_order` tem por omissão o relógio em milissegundos
(migração 0001). Duas fotografias enviadas no mesmo milissegundo -
coisa que acontece mesmo, com dezenas de convidados a enviar ao mesmo
tempo num casamento - ficam com o **mesmo** `sort_order`.

Quando um empate calha na fronteira entre duas páginas, o
`< sort_order_da_última` da página seguinte salta por cima de **todas**
as empatadas com ela. Essas fotografias nunca mais aparecem: não estão
na página anterior (o `limit` cortou-as), não estão na seguinte (o
filtro excluiu-as), e nenhum cursor futuro volta a alcançá-las.

Além disso, sem `id` no `ORDER BY`, a ordem entre linhas empatadas não
é garantida pelo Postgres entre execuções, por isso a mesma fotografia
podia também aparecer repetida.

O efeito é silencioso: ninguém vê um erro, o contador de fotografias
(que vem de um `count`, não da paginação) diz um número e a grelha
mostra menos. É o pior tipo de bug para uma galeria de casamento -
fotografias de convidados que simplesmente não existem para quem vê.

### Prova

Contra PostgreSQL 16 real, 120 fotografias inseridas a 3 por
milissegundo, páginas de 20:

| Cursor             | Fotografias alcançadas    |
| ------------------ | ------------------------- |
| só `sort_order`    | 117 de 120 (3 perdidas)   |
| `(sort_order, id)` | 120 de 120, sem repetidas |

E em teste unitário, com o cursor antigo: `expected 10 to be 12`.

## Decisão

O cursor passa a transportar a **posição exata** onde a página anterior
terminou: o par `(sort_order, id)`.

- `PhotoCursor { sortOrder: number; id: string }` no repositório.
- Filtro por par, em vez de por uma coluna só:
  ```
  or(sort_order.lt.X, and(sort_order.eq.X, id.lt.Y))
  ```
- `ORDER BY sort_order DESC, id DESC` - o `id` é `uuid`, único e
  estável, por isso desempata de forma determinística.
- Na API o cursor continua **opaco** para o cliente: viaja como string
  `"<sortOrder>_<id>"`, e `nextCursor` mudou de `number | null` para
  `string | null`.

### Validação do cursor

O cursor chega do cliente, por isso é validado como qualquer outra
entrada (secção 3). Um cursor mal formado é tratado como "sem cursor" e
devolve a primeira página, em vez de rebentar - o pior que acontece é o
convidado voltar ao início da galeria.

O `id` acaba interpolado no filtro `or(...)` do PostgREST, cuja sintaxe
usa vírgulas, parênteses e pontos. Por isso só passa se for composto
exclusivamente por letras, dígitos e hífens: isso fecha a porta a
injetar sintaxe no filtro, que é o que aqui interessa garantir.
Deliberadamente mais largo do que "tem de ser um UUID" - a coluna é
`uuid` e é o Postgres que rejeita um id que o não seja; esta validação
não precisa de duplicar essa garantia.

### Índice

Migração 0009 substitui `photos_album_status_sort_active_idx` por
`photos_album_status_sort_id_active_idx`, com o `id desc` no fim. Sem
ele, o Postgres teria de ordenar o resultado à parte. O índice antigo
fica redundante: um índice com mais colunas à direita serve na mesma as
consultas que só usavam as da esquerda.

## Alternativas consideradas

**Tornar `sort_order` único (sequência em vez de relógio).** Resolvia a
raiz, mas obrigava a uma migração de dados sobre fotografias já
enviadas em produção e a repensar a ordenação (o valor deixa de ter
significado temporal). O desempate por `id` custa uma coluna no índice
e não mexe em nada do que já está gravado.

**`sort_order` em microssegundos.** Reduz a probabilidade de empate mas
não a elimina - e um bug que aparece menos vezes num casamento é pior
do que um que aparece sempre, porque ninguém o apanha em testes.

## Limitações conhecidas

A listagem administrativa (`listForOwner`) continua a paginar por
offset e não foi tocada aqui. É um caminho diferente (com sessão de
administrador, sobre a totalidade do álbum) e merece a sua própria
análise.

## Testes

- `tests/unit/use-cases/photos.test.ts`: 12 fotografias a 3 por
  milissegundo, páginas de 5, percorridas até ao fim - todas
  alcançadas, nenhuma repetida. Falha com o código antigo
  (`expected 10 to be 12`).
- `tests/unit/use-cases/photos.test.ts`: cursores inválidos
  (`"lixo"`, `"123"`, `"abc_def"`, `"1_foto,bar"`) devolvem a primeira
  página.
- Os duplos do repositório passaram a replicar o desempate real, para
  não provarem uma coisa que a base de dados não faz.
