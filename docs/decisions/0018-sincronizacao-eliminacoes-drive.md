# 0018 — Sincronização de eliminações feitas diretamente no Drive

Data: 2026-08-04

## Contexto

Pedido explícito do administrador: "sempre que apagar uma foto no
google drive a foto tem que ser apagada na aplicação". A secção 25 do
`CLAUDE.md` marca "sincronização bidirecional de alterações feitas
manualmente no Drive" como fora do âmbito do MVP — esta funcionalidade
é uma exceção deliberada e explicitamente pedida, e estritamente
unidirecional: só cobre "apagar no Drive apaga na app", nunca o
inverso (mudanças feitas na app nunca tocam no Drive além do que já
acontecia) nem a deteção de ficheiros adicionados diretamente lá.

## Decisão

### Deteção: listagem periódica em vez de eventos do Drive

O Drive não notifica a aplicação quando um ficheiro é apagado (a
`drive.file` scope não dá acesso a "Changes" fora do que a própria app
criou, e mesmo com Push Notifications a complexidade — endpoint
público verificável, renovação de canais a cada poucos dias — não se
justifica para um único administrador). Em vez disso,
`DriveStorageProvider.listActivePhotoIds()`
(`lib/google-drive/drive-provider.ts`) lista, paginado, todos os
ficheiros ainda não na reciclagem com `appProperties.liveGalleryPhotoId`
definido — reaproveitando os metadados já gravados em cada upload
(secção 12 do `CLAUDE.md`). `server/use-cases/drive-sync.ts`
(`syncDeletedDrivePhotos`) compara esse conjunto de IDs com as
fotografias não eliminadas de cada álbum do dono da ligação; qualquer
fotografia da base de dados cujo ID não apareça mais no Drive é
considerada apagada lá e é removida também na aplicação.

### Execução: Vercel Cron Job diário, autenticado por `CRON_SECRET`

`app/api/cron/sync-drive-deletions/route.ts`, chamado por
`vercel.json` (`0 4 * * *`, uma vez por dia). Protegido comparando o
cabeçalho `Authorization` com `Bearer ${CRON_SECRET}` — a Vercel injeta
esse cabeçalho automaticamente nas chamadas de Cron Jobs quando a
variável de ambiente `CRON_SECRET` existe com esse nome exato. Sem
`CRON_SECRET` configurado, a rota responde sempre `503` (falha
fechada) — nunca corre "aberta" nem aceita pedidos não autenticados.
O plano Hobby da Vercel limita a frequência de Cron Jobs a
aproximadamente uma vez por dia; esta sincronização **não é tempo
real** — pode demorar até ~24h a refletir uma eliminação feita
diretamente no Drive. Aceitável para o caso de uso (o administrador
raramente apaga ficheiros pelo Drive em vez de pela aplicação); documentado
explicitamente ao administrador, não escondido.

### Reaproveitamento da lógica de eliminação existente

`server/use-cases/photo-removal.ts` (`finalizePhotoRemoval`) extrai os
passos partilhados entre a eliminação manual
(`moderation.ts#deletePhoto`) e esta sincronização automática: remover
os derivados da Storage, marcar `status: 'deleted'` +
`deleted_at`, limpar `cover_photo_id` se aplicável, e registar em
`audit_logs` (ação `photo.deleted_from_drive`, `actor_user_id: null` —
não há um administrador a agir neste caso, é o sistema a reagir a uma
mudança externa). Deliberadamente **não** chama
`DriveStorageProvider.deleteFile` — a eliminação manual ainda precisa
disso (o ficheiro ainda existe no Drive nesse caminho); na
sincronização o Drive já é a origem da remoção, não há nada para
apagar lá.

### Isolamento de falhas

Cada ligação Google ativa (`GoogleConnectionsRepository.listAllActive`)
é processada de forma independente — um refresh token inválido, uma
ligação revogada ou um erro transitório da API numa ligação não impede
a sincronização das restantes. Erros são registados com `logger.error`
(sem tokens) e contabilizados em `connectionsFailed`, devolvido no
corpo da resposta da rota.

## Verificação

`pnpm check` completo (lint + typecheck + 187 testes unitários,
incluindo 6 novos em `tests/unit/use-cases/drive-sync.test.ts`:
remoção de fotografias ausentes no Drive, preservação das presentes,
limpeza de capa, isolamento de fotografias já eliminadas, isolamento de
falhas por ligação, e o caso sem ligações ativas) e `pnpm build`
(a rota `/api/cron/sync-drive-deletions` aparece na lista de rotas
geradas).

## Limitações conhecidas

- Não é tempo real — depende da frequência do Cron Job (diária no
  plano Hobby da Vercel).
- O administrador tem de gerar e configurar `CRON_SECRET` manualmente
  em produção (ver `docs/operations/production-checklist.md`) — sem
  essa variável, a sincronização fica silenciosamente desligada (a
  rota responde `503` a qualquer pedido, incluindo o do próprio Cron
  Job da Vercel, mas nada mais na aplicação depende dela).
- Só deteta eliminações; ficheiros adicionados diretamente ao Drive
  (fora da aplicação) continuam, como já documentado na secção 25, fora
  do âmbito.
