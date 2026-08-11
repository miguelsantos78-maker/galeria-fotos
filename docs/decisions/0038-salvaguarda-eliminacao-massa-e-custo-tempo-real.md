# 0038 — Salvaguarda contra eliminação em massa, e o custo real do tempo real

Data: 2026-08-10

## Contexto

Auditoria pedida antes do evento, com os números concretos a que a
aplicação vai ser sujeita: mais de 100 pessoas e mais de 1000
fotografias. Os dois achados críticos, tratados aqui.

## 1. A sincronização com o Drive podia apagar o álbum inteiro

`server/use-cases/drive-sync.ts` corre sozinho todas as noites (cron,
04:00). Infere eliminações por **ausência**: pede ao Drive a lista de
ficheiros vivos e apaga tudo o que não estiver nela.

Não havia salvaguarda nenhuma. Uma listagem vazia — sem lançar erro —
era indistinguível de "o dono apagou tudo à mão", e a passagem seguinte
removia todas as fotografias. `finalizePhotoRemoval` apaga o preview e
a miniatura da Storage de forma **irreversível**; os originais
sobrevivem no Drive, mas recuperar significa reenviar tudo à mão.

O caminho para isso acontecer não é teórico. O âmbito `drive.file` só
dá acesso aos ficheiros criados pela própria aplicação **naquela
conta**. A ligação ao Drive já expirou uma vez (ADR 0031: o
consentimento OAuth em "Testing" faz os refresh tokens expirarem ao fim
de 7 dias) e vai ter de ser refeita. Se na reconexão for escolhida
outra conta Google por engano, a listagem passa a vir vazia e o álbum
desaparece de madrugada, sem ninguém a ver.

### Decisão

`assessRemoval(missingCount, totalCount)` decide, **antes de apagar
seja o que for**, se o resultado da passagem é credível:

- **listagem vazia** (tudo em falta): recusa sempre. Uma listagem vazia
  nunca é prova suficiente para destruir uma coleção inteira.
- **proporção excessiva**: recusa acima de 20% do álbum numa só
  passagem, com uma tolerância mínima de 5 fotografias — sem essa
  tolerância, num álbum de 3 fotografias 20% arredondaria a zero e a
  sincronização nunca faria nada.

Quando recusa, não remove nada, regista em `audit_logs`
(`drive_sync.aborted_unsafe`, com o motivo e os números) e conta em
`connectionsSkipped` — à parte de `connectionsFailed`, porque não é uma
falha: é a precaução a funcionar.

O custo de errar para este lado é uma fotografia a mais na galeria até
alguém a apagar pela aplicação. O custo de errar para o outro lado é um
álbum de casamento perdido. A assimetria decide.

## 2. Cada foto nova custava 20 pedidos por convidado

Medido, não estimado. Com o TanStack Query real, 20 páginas em cache:

```
>>> páginas carregadas: 20
>>> fetches por UMA invalidação: 20
```

Invalidar uma query paginada refaz **todas** as páginas em cache, não
só a mais recente — para manter os cursores consistentes entre si. Com
1000 fotografias são 20 páginas, logo 20 pedidos por cada rajada, por
cada convidado que tenha percorrido a galeria até ao fim. Com uma
centena de convidados, **uma única fotografia nova custava dois mil
pedidos**, cada um a assinar 100 URLs no Supabase.

Pior no caminho degradado: sem canal de tempo real, o fallback sondava
a cada 15 s — os mesmos 20 pedidos por convidado, em ciclo,
indefinidamente.

E era trabalho inteiramente desperdiçado: as fotografias novas entram
sempre na primeira página (`sort_order desc`), por isso refazer as
outras dezanove nunca traz nada de novo.

### Decisão

`usePhotosRealtime` passa a receber `canAutoRefresh`. A grelha passa
`loadedPageCount <= 1`:

- **uma página carregada** (o caso comum: alguém com a galeria aberta,
  sem ter descido): continua a atualizar sozinho, agora ao custo de um
  pedido em vez de vinte;
- **já desceu na galeria**: recebe o "indicador discreto quando entram
  novas fotografias" que a secção 10.1 já previa, e decide quando
  atualizar. Isto também resolve um problema de utilização que existia
  em silêncio — a grelha deixava de saltar debaixo do dedo a meio do
  scroll.

O fallback por sondagem sobe de 15 s para 30 s e ganha desfasamento
aleatório de ±25%. Sem isso, convidados que abrissem a galeria por
volta da mesma hora — o que num casamento acontece literalmente —
sondariam em uníssono, concentrando os pedidos em picos.

## Verificação

`pnpm check` (267 testes, 8 novos) e `pnpm build`. Suite E2E completa
(20 testes).

Testes novos:

- `drive-sync.test.ts` — listagem vazia não remove nada e regista
  auditoria; uma fatia grande em falta (40 de 100) também não; 10 de
  100 continua a remover normalmente; e um álbum pequeno (1 de 4) não
  fica bloqueado pelo arredondamento.
- `use-photos-realtime.test.tsx` — não refaz sozinho com mais do que
  uma página carregada (fica pendente); refaz com uma só; `refreshNow`
  aplica e limpa o indicador; o fallback por sondagem respeita o mesmo
  limite em vez de refazer tudo em ciclo.

Dois testes existentes precisaram de fixtures maiores: com uma única
fotografia no álbum, a salvaguarda bloqueia — corretamente.

Encontrado ao escrever os testes: `channelMock.subscribe` guardava a
implementação entre testes (`vi.restoreAllMocks()` não desfaz
implementações de `vi.fn()`, só de espias), pelo que os testes do
fallback viam o canal como ligado e nunca chegavam a sondar. Corrigido
com `mockReset()` no `beforeEach`.

## Limitações conhecidas

- Os limiares (20%, 5 fotografias) são fixos e não configuráveis. Se
  alguma vez for preciso apagar muito no Drive de propósito, a
  sincronização recusa e a eliminação tem de ser feita pela aplicação
  — que é o caminho correto de qualquer forma.
- O indicador de novas fotografias não diz **quantas** são: o evento de
  tempo real não é contado (nunca se confia no payload, secção 11), só
  usado como sinal.
- Ficam por tratar os achados de severidade alta e média da auditoria:
  largura de banda do Supabase, rate limiting possivelmente inativo,
  `listForAlbumIds` sem paginação, downloads de originais pela função,
  e ausência de teto de fotografias por álbum.
