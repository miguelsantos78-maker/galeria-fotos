# 0019 — Eliminar fotografia diretamente na galeria pública

Data: 2026-08-04

## Contexto

Pedido do administrador: "preciso que adiciones uma opção de apagar as
fotos, mas só para mim que criei o álbum". A eliminação de fotografias
já existia (`DELETE /api/photos/[photoId]`, painel
`/admin/albums/[albumId]`), mas exigia sair da galeria para o painel
administrativo. Como o administrador usa o próprio link de convidado
para ver o álbum (secção 1: "aplicação simples de utilizar"), fazia
mais sentido eliminar diretamente daí — exatamente o que a secção 10.2
do `CLAUDE.md` já previa para o lightbox ("ações permitidas: ...
destacar ou eliminar para administradores").

## Decisão

### Deteção do dono, no servidor, sem usar as `permissions` do link

`resolveAlbumSession` (`server/use-cases/resolve-album.ts`) passa a
devolver também `isOwner: boolean`. Deliberadamente **não** reutiliza a
permissão `"moderate"` já existente em `album_sessions.permissions` —
essa permissão vem do link de partilha, e um link é a mesma credencial
que qualquer convidado pode usar; misturar "quem é o dono" com "que
permissões este link concede" abriria a porta a um link mal configurado
conceder eliminação a um convidado. Em vez disso, `isOwner` compara o
utilizador autenticado da sessão Supabase (`user.id`, e
`user.is_anonymous` vindo de `supabase.auth.getUser()` em
`app/api/albums/resolve/route.ts`) com `album.owner_id`. Um convidado
normal é sempre anónimo (secção 6.3), por isso `isOwner` é sempre falso
para ele, mesmo que por absurdo tivesse o mesmo UUID.

Isto só funciona quando o administrador abre o link de convidado no
mesmo browser onde já tem sessão iniciada como administrador (login
Google em `/admin/login`) — é exatamente esse o caso de uso pedido.

### `isOwner` é só para mostrar/esconder a UI — nunca a autorização real

`DELETE /api/photos/[photoId]` continua sem alterações: exige
`requireAdminApi()` (sessão administrativa real, não a `album_session`
anónima) e volta a verificar `album.owner_id === profile.id` dentro de
`deletePhoto` antes de apagar qualquer coisa. `isOwner` no payload de
`/api/albums/resolve` é só um valor de conveniência para a interface
decidir se mostra o botão "Eliminar" — um cliente adulterado que o
forçasse a `true` continuaria a receber `403 FORBIDDEN` do servidor.

### Onde aparece o botão

Só no lightbox (`components/gallery/lightbox.tsx`), ao lado de
"Transferir", com confirmação (`window.confirm`, mesmo padrão já usado
no painel administrativo). Não foi colocado um botão por miniatura na
grelha — manter a grelha densa e sem sobreposição de controlos, tal
como pedido nas redesenhos anteriores (ADRs 0010/0015/0016).

Ao eliminar com sucesso, `PhotoGrid` invalida a query de fotografias
(o mesmo padrão que o tempo real já usa) e fecha o lightbox — sem
lógica especial de "avançar para a próxima foto": ao refazer a
consulta, a fotografia eliminada desaparece da lista e o índice deixa
de corresponder a nenhum item, fechando o lightbox naturalmente.

## Verificação

`pnpm check` completo (lint + typecheck + 194 testes unitários) e
`pnpm build`. Testes novos:

- `tests/unit/use-cases/resolve-album.test.ts`: `isOwner` verdadeiro só
  para o dono autenticado (não anónimo); falso para um convidado
  anónimo mesmo com o mesmo `user_id`, e falso para outro utilizador
  autenticado.
- `tests/unit/lightbox.test.tsx`: botão "Eliminar" ausente/presente
  conforme `isOwner`; confirmação bloqueia a chamada à API quando
  recusada; chamada a `DELETE /api/photos/:id` e `onDeleted` quando
  aceite. Passou a precisar de um `QueryClientProvider` a envolver o
  componente nos testes (novo `useMutation` interno).

Suite E2E (15 testes) continua a passar sem alterações — o cenário de
dono autenticado exige uma sessão administrativa real, por isso fica,
como o resto da moderação, para verificação manual em staging (mesma
limitação já documentada nas ADRs 0007/0008).

## Limitações conhecidas

- Só funciona se o administrador abrir o link de convidado no mesmo
  browser/sessão onde já está autenticado como administrador. Não há
  (nem se pediu) uma forma de "ver como administrador" a partir de uma
  sessão de convidado anónima.
- O botão "Destacar" mencionado na mesma frase da secção 10.2 continua
  fora deste pedido — só "Eliminar" foi pedido explicitamente; destacar
  continua disponível apenas no painel administrativo.
