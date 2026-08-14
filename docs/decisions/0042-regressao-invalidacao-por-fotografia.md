# 0042 — A invalidação por fotografia que escapou à correção da amplificação

Data: 2026-08-11

## Contexto

Nova verificação pedida depois das ADRs 0038–0041 — uma revisão das
minhas próprias alterações, à procura do que tivesse ficado por trás.

## O que estava errado

A ADR 0038 corrigiu a amplificação do tempo real: invalidar uma query
paginada refaz **todas** as páginas em cache, por isso a atualização
automática passou a acontecer só com uma página carregada.

Mas `components/upload/upload-queue.tsx` invalidava a mesma query
diretamente, a cada fotografia concluída — um caminho que não passava
por `usePhotosRealtime` e que a correção não tocou.

O efeito é o mesmo problema, agravado por não ter debounce nenhum:
quem tivesse percorrido a galeria antes de enviar 50 fotografias
provocava 50 invalidações, cada uma a refazer todas as páginas
carregadas, **sozinho e ao mesmo tempo que estava a enviar os
ficheiros** — exatamente quando a ligação já está ocupada.

Não foi um descuido de leitura: a correção anterior foi desenhada à
volta do componente que subscreve o tempo real, e este é outro
componente, irmão daquele.

## Decisão

A atualização da galeria depois de um envio passa a ser adiada até
haver uma pausa (1 s), pela mesma razão e na mesma ordem de grandeza do
debounce em `use-photos-realtime.ts`. Uma rajada de 50 envios provoca
uma atualização, não cinquenta.

Mantém-se a garantia que interessa: quem envia vê a sua fotografia
aparecer, sem depender de o canal de tempo real estar ligado.

## Verificação

`pnpm check` (281 testes, 1 novo) e `pnpm build`. Suite E2E (21 testes,
1 novo).

O teste novo em `upload-queue.test.tsx` conta as invalidações da
galeria depois de três envios concluídos. Confirmei que **falha com o
código anterior** — acusa `expected [...] to have a length of 1 but got
3` — para não ser um teste que passa por acaso.

Acrescentei também um teste E2E que fixa a propriedade da ADR 0041,
fácil de regredir sem ninguém dar por isso: abrir a galeria **não faz
nenhum pedido à listagem** (a primeira página vem na resolução), as
miniaturas do primeiro ecrã têm `loading="eager"` com prioridade alta,
as de baixo continuam em `lazy`, e a lightbox abre com os dados
semeados.

## O resto da revisão

Verificado e sem problemas:

- **Middleware sem autenticação em `/api`** (ADR 0040): as rotas de
  administração autenticam-se por `requireAdminApi()` →
  `getCurrentProfile()` → `verifySession()`, com o seu próprio cliente.
  Os testes E2E de acesso administrativo sem sessão continuam a
  devolver 401.
- **`Promise.all` nos caminhos de envio**: `Promise.all` liga-se a
  todas as promessas de imediato, por isso uma rejeição tardia (quando
  outra já rejeitou) continua tratada — não há rejeições por apanhar.
- **Job de envio em caso de imagem corrompida**: continua a ficar em
  "uploading" até expirar, tal como antes da paralelização. Não é uma
  regressão; é comportamento pré-existente, coberto pela limpeza
  periódica.
- **`assessRemoval`** (ADR 0038): sem divisões por zero — um álbum sem
  fotografias sai logo no primeiro ramo.
- **Paginação de `listForAlbumIds`** (ADR 0039): o ciclo termina tanto
  numa página incompleta como numa vazia.

## Limitações conhecidas

- `processImage` passou a correr mesmo quando a ligação ao Drive está
  em baixo (antes, a verificação da ligação vinha primeiro e cortava o
  caminho). É uma troca deliberada: ~50 ms poupados em cada envio bem
  sucedido, contra ~650 ms de CPU desperdiçados num caminho em que
  todos os envios falham de qualquer forma.
- `handleDeleted` em `photo-grid.tsx` continua a invalidar todas as
  páginas, sem debounce. Fica: é uma ação manual, uma de cada vez, sem
  o efeito multiplicador de uma rajada de envios.
