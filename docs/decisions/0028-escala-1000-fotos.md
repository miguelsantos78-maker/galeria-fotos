# 0028 — Preparar a plataforma para ~1000 fotografias

Data: 2026-08-06

## Contexto

O administrador indicou o objetivo concreto de escala: um álbum com
cerca de 1000 fotografias, enviadas por várias pessoas. Uma auditoria
focada nesse número encontrou dois defeitos que só se manifestam a
essa escala, mais desgaste de dados e problemas de navegação. Foi
pedido para avançar com tudo, exceto o agrupamento por dia (o
casamento decorre num único dia, portanto não haveria secções para
separar).

## Decisão

### 1. Os URLs assinados expiravam a meio da visita

`lib/media/preview-url.ts`: `SIGNED_URL_TTL_SECONDS` era de 5 minutos.
Num álbum de 1000 fotografias, um convidado passa facilmente mais do
que isso a percorrer a galeria — as miniaturas já carregadas
partiam-se quando os URLs caducavam, sem nada que os renovasse.
Passou para 1 hora, o que continua muito abaixo da validade da própria
`album_session` (24h): revogar um link continua a fechar o acesso muito
antes de o último URL emitido expirar.

Corrigido também um erro que eu próprio introduzi na ADR 0027: ao
desligar `refetchOnWindowFocus` na galeria, tinha removido sem dar por
isso o caminho que recuperava desta situação (voltar ao separador
refazia o pedido e renovava os URLs). Foi reposto, com um comentário a
explicar porque não deve voltar a ser desligado; o `staleTime` global
já evita que dispare em excesso.

### 2. O painel de administração escondia tudo acima de 200 fotografias

`OWNER_LISTING_MAX = 200` era um limite absoluto, não uma página: com
1000 fotografias, 800 ficavam invisíveis e impossíveis de moderar. O
mesmo pedido carregava 200 linhas e assinava 400 URLs de uma vez.

`listForOwner` passa a aceitar `offset`, `listPhotosForOwner` devolve
`{ photos, nextOffset }` e a UI usa `useInfiniteQuery` com "Carregar
mais", em páginas de 100. Paginação por deslocamento, e não por cursor
como na galeria pública: `captured_at` é anulável, o que torna um
cursor sobre esse campo ambíguo — aceitável aqui por ser uma listagem
de administração, com um álbum de cada vez e poucas páginas (a regra
"cursor, não offset" da secção 14 diz respeito à galeria, que se
mantém por cursor).

### 3. `album_sessions` e `upload_jobs` cresciam sem limite

Cada abertura de um link de partilha insere uma linha em
`album_sessions` (`resolve-album.ts`), e cada ficheiro enviado insere
uma em `upload_jobs`. Nada as apagava. Novo
`server/use-cases/maintenance.ts#cleanupExpiredRecords`, chamado a
partir do cron diário já existente, apaga registos expirados/terminados
há mais de 7 dias — a margem serve para ainda se poder diagnosticar um
problema recente antes de a linha desaparecer. Nunca toca em `photos`,
`albums` nem em nada no Drive/Storage.

O caminho do cron continua `/api/cron/sync-drive-deletions` por já
estar configurado em `vercel.json` e em produção; o plano Hobby da
Vercel limita o número de Cron Jobs, por isso as duas tarefas
partilham deliberadamente o mesmo agendamento.

### 4. Layout para percorrer 1000 fotografias

- **Miniaturas de volta a quadradas** (`aspect-square`, revertendo o
  `aspect-[4/5]` da sessão anterior): a 1000 fotografias, miniaturas
  mais altas tornavam a coluna de scroll cerca de 25% mais longa sem
  ganho proporcional.
- **Contador de fotografias** na barra da galeria. `ListPhotosResult`
  ganha `totalCount`, contado com `head: true` (o Postgres devolve só
  o número, nenhuma linha atravessa a rede) e **apenas na primeira
  página** — não muda entre páginas e seria uma consulta extra em cada
  uma.
- **Botão "voltar ao topo"** (`components/gallery/back-to-top.tsx`),
  visível a partir de ~1200px de scroll, posicionado acima do botão de
  envio para não se sobreporem, e escondido com a lightbox aberta.
  Respeita `prefers-reduced-motion` (secção 17).
- **Filtro "As minhas"**: com várias pessoas a enviar, cada convidado
  consegue isolar as suas. Filtrado **no servidor** (`?mine=true`), não
  no cliente — filtrar só as páginas já carregadas daria um resultado
  errado numa lista paginada.

`PublicPhoto` ganha `isMine`, um booleano calculado no servidor
comparando `uploaded_by` com quem está a ver — deliberadamente não o
`uploaded_by` em bruto: a galeria pública nunca deve revelar quem
enviou o quê (secção 15, privacidade), só permitir a cada pessoa
reconhecer as suas.

## Verificação

`pnpm check` completo (lint + typecheck + 221 testes — 7 novos:
paginação da administração, limpeza de registos com as três garantias
(apaga antigos, preserva recentes, nunca apaga envios em curso),
contagem só na primeira página, `isMine` e o filtro `onlyMine`) e
`pnpm build`. Suite E2E (18 testes, 1 novo a cobrir o contador e o
filtro com o servidor a filtrar de facto). Confirmado visualmente com
capturas de ecrã de um álbum de 120 fotografias, antes e depois de
scroll — o botão de voltar ao topo aparece na altura certa e não se
sobrepõe ao botão de envio.

## Limitações conhecidas / a acompanhar antes do evento

- **Largura de banda do Supabase**: cada convidado que percorra as
  1000 fotografias descarrega ~35 MB só em miniaturas, e perto de
  50 MB se abrir bastantes no visualizador. Com ~100 convidados dá
  cerca de 5 GB, que é o limite mensal do plano gratuito. O
  armazenamento (~285 MB para 1000 fotografias) cabe folgadamente em
  1 GB.
- A limpeza depende do cron, que por sua vez depende de `CRON_SECRET`
  estar configurado (ver `docs/operations/production-checklist.md`) —
  sem isso, as tabelas continuam a crescer.
- `getDashboardStats` continua a carregar todas as fotografias do dono
  para memória só para contar; com 1000 fotografias ainda é
  perfeitamente viável, mas é o próximo candidato se o volume crescer
  muito além disso.
