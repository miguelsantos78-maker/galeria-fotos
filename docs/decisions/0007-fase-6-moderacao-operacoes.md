# 0007 — Fase 6: Moderação e operações

Data: 2026-08-01

## Contexto

A Fase 6 pede aprovar, ocultar, destacar, definir capa e eliminação,
ações em lote, auditoria, e uma página de saúde e erros (secção 22).
Critério de saída: o administrador controla completamente o conteúdo
do álbum. Este documento regista as decisões tomadas, sobretudo à volta
de que transições de estado são permitidas e como a eliminação
"completa" (secção 15) interage com o esquema de eliminação suave já
existente.

## Decisões

### 1. Transições de estado explícitas, nunca um `status` livre

`PATCH /api/photos/[photoId]` aceita `status: "ready" | "hidden"`, mas
`server/use-cases/moderation.ts#updatePhotoModeration` valida a
transição contra o estado atual antes de aceitar:

- `pending_review` ou `hidden` → `ready` ("aprovar"/"republicar").
- `ready` → `hidden` ("ocultar").
- Qualquer outra combinação lança `PHOTO_INVALID_TRANSITION` (409) —
  incluindo tentar "aprovar" uma fotografia já `ready`, ou "ocultar" uma
  que ainda nem foi aprovada.

Nunca é possível atribuir `queued`, `uploading`, `processing`, `failed`
ou `deleted` por este endpoint — esses estados são geridos
exclusivamente pelo fluxo de upload (Fase 4) e pelo endpoint de
eliminação. Isto seguiu o mesmo espírito de "nunca confiar no cliente"
já aplicado à Fase 4 (validar tudo outra vez no servidor).

### 2. Eliminação "completa": ordem Drive → Storage → base de dados, sempre suave na BD

A secção 15 pede "eliminação completa de fotografia", mas o esquema
(secção 7) já tem `photos.deleted_at` e o estado `'deleted'`,
apontando para eliminação suave na base de dados. Decisão:
`deletePhoto()` apaga sempre o original do Drive e os derivados da
Storage — a parte "completa" da eliminação, onde realmente importa por
custo e privacidade — e só marca `deleted_at`/`status: 'deleted'` na
tabela `photos` depois disso ter sucesso, na mesma ordem inversa da
criação (Drive/Storage primeiro, base de dados por último, como na
Fase 4). Isto:

- Torna a eliminação idempotente sem esforço extra: repetir sobre uma
  fotografia já eliminada é um no-op silencioso (`photo.deleted_at`
  já definido).
- Evita perder a referência a um ficheiro do Drive ainda por apagar se
  a chamada à Storage ou à base de dados falhar a meio — a linha só
  fica "eliminada" depois do Drive confirmar.
- Se a fotografia eliminada era a capa do álbum (`albums.cover_photo_id`),
  o valor é limpo explicitamente — a FK `on delete set null` da
  migração 0001 não dispara aqui, porque a linha nunca é apagada de
  facto, só marcada.
- Falhar a limpar a Storage (preview/thumbnail) não bloqueia a
  eliminação: o original já saiu do Drive, que é o que importa; um
  preview órfão sem original associado é um resíduo menor, tratado como
  best-effort.
- Sem ligação Google Drive ativa, a eliminação é recusada
  (`GOOGLE_DRIVE_NOT_CONNECTED`, 503) em vez de eliminar só o registo —
  preferir não eliminar a deixar um ficheiro órfão no Drive sem
  qualquer registo que aponte para ele.

### 3. Capa (`setAsCover`) e destaque (`isFeatured`) no mesmo endpoint que o estado

Em vez de endpoints dedicados, `PATCH /api/photos/[photoId]` aceita
`isFeatured`/`setAsCover` no mesmo corpo — a secção 14 só lista este
único endpoint de fotografia, e as três ações (aprovar/ocultar,
destacar, definir capa) partilham a mesma autorização (dono do álbum) e
o mesmo alvo (uma fotografia). `setAsCover: false` remove a fotografia
como capa apenas se for mesmo a capa atual; não há endpoint dedicado a
"limpar a capa sem escolher outra" — aceitável, um caso raro que o
próprio administrador pode resolver definindo outra fotografia como
capa.

### 4. Ações em lote: endpoint novo, sequencial, com falhas parciais

`POST /api/albums/[albumId]/photos/batch` (fora da lista "principal" da
secção 14, tal como os outros endpoints de administração já
acrescentados nas fases anteriores) aceita `{photoIds, action}` e
aplica `approve`/`hide`/`delete` chamando as mesmas funções do caso de
uso único, sequencialmente — não em paralelo, para não disparar rajadas
de pedidos ao Drive (secção 16, delete chama a API do Drive por
fotografia). Cada fotografia falha de forma independente; a resposta
devolve sempre `{succeeded, failed}` em vez de tudo-ou-nada, porque um
lote de 50 fotografias não deve falhar por completo por causa de uma
única transição inválida. Uma fotografia de outro álbum incluída por
engano no pedido conta como falha (`PHOTO_NOT_FOUND`), nunca é afetada
silenciosamente — o `albumId` do URL é sempre respeitado.

### 5. Listagem de administração separada da listagem pública (Fase 4/5)

`GET /api/albums/[albumId]/photos/moderation` é um endpoint novo,
distinto de `GET /api/albums/[albumId]/photos` (que continua exigir uma
`album_session` de convidado e só mostra `ready`/`pending_review`
conforme a permissão de moderação da sessão). Misturar as duas lógicas
num único Route Handler arriscava expor `hidden`/`pending_review` a
convidados por um lapso de condicional; manter os caminhos
completamente separados (`requireAdminApi()` vs sessão de convidado)
é mais seguro e mais fácil de auditar. Devolve `AdminPhotoView`
(`server/use-cases/admin-photo-view.ts`), um DTO com URLs assinados —
o mesmo princípio de nunca expor caminhos internos de Storage
diretamente já usado na listagem pública.

Sem paginação por cursor nesta listagem — limite fixo de 200
fotografias por álbum (`OWNER_LISTING_MAX`), aceitável para a escala
esperada de um MVP; documentado como limitação conhecida, tal como a
Fase 4 já tinha feito para outras listas administrativas.

### 6. Ordenar por data de captura ou upload — plumbing pronta, dado ainda inerte

A secção 10.4 pede ordenar por "data de captura ou upload". A
listagem de administração aceita `sortBy=uploaded_at|captured_at`, mas
`photos.captured_at` é sempre `null` neste momento (a Fase 4 decidiu
não extrair a data EXIF, ver ADR 0005) — por isso "ordenar por data de
captura" hoje não produz uma ordem diferente de "sem ordenação
particular" com um desempate estável por `sort_order`. A funcionalidade
fica pronta para quando uma fase futura adicionar extração de EXIF,
sem precisar de tocar na API.

### 7. Dashboard com estatísticas reais, sem otimizar consultas ainda

`server/use-cases/dashboard.ts#getDashboardStats` substitui a página
`/admin` estática por números reais: total de álbuns, total de
fotografias, fotografias recentes, e envios com erro — tudo derivado
de `albums.listByOwner()` + duas listagens adicionais
(`photos.listForAlbumIds`, `uploadJobs.listForAlbumIds`) agregadas em
memória, não com `COUNT()` dedicado no Postgres. Simples e correto para
a escala de um MVP (o mesmo padrão que `albums.listByOwner()` já usava
desde a Fase 2); otimizar com contagens dedicadas fica para quando o
volume o justificar.

## Limitações conhecidas

- Sem paginação na listagem de administração (limite fixo de 200).
- "Ordenar por data de captura" ainda não produz uma ordem diferente,
  porque `captured_at` continua sempre `null` (ver ADR 0005).
- Estatísticas do dashboard calculadas em memória a partir de
  listagens completas, não com contagens SQL dedicadas — aceitável
  agora, a rever se o volume crescer.
- Sem testes de integração/E2E contra Supabase/Google Drive reais
  (mesma limitação de ambiente das fases anteriores). A orquestração
  está coberta com repositórios, adaptador Drive e armazenamento de
  preview falsos.
