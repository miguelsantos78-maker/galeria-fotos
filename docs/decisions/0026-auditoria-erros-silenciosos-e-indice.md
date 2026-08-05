# 0026 — Auditoria: erros silenciosos e índice em falta

Data: 2026-08-05

## Contexto

Pedido do administrador: auditoria ao projeto à procura de bugs e
melhorias de performance. A auditoria completa (bugs, índices em
falta, processamento de imagem, tempo real, cache no cliente)
identificou vários pontos; este commit trata os três que o
administrador escolheu para começar — dois bugs de observabilidade e
um índice em falta, todos de baixo risco.

## Decisão

### Dois erros silenciosos corrigidos

Mesmo padrão já corrigido várias vezes nesta sessão (falha no envio
ao Drive, falha na sessão de visitante — commits anteriores desta
mesma branch): um `catch {}` genérico escondia o erro real atrás de
uma mensagem/código fixo, tornando impossível diagnosticar a causa a
partir dos logs de produção.

- `app/api/google-drive/callback/route.ts`: se
  `completeGoogleDriveConnection` falhar (troca do código OAuth,
  encriptação do refresh token, etc.), agora regista
  `logger.error({ operation, userId, message })` antes de redirecionar
  para `?error=google_drive_connect_failed`.
- `server/use-cases/uploads.ts`: se o envio do preview/thumbnail para
  o Supabase Storage falhar, agora regista o erro real antes de
  lançar `UPLOAD_STORAGE_FAILED`. Aproveitado para paralelizar os dois
  envios (`Promise.all` em vez de dois `await` sequenciais) — pequeno
  ganho de latência, identificado na mesma auditoria.

Nenhum dos dois regista segredos — só `message`/`userId`/`albumId`,
tal como o resto do logger estruturado (secção 18).

### Índice em falta para a ordenação por omissão do painel

`server/repositories/photos-repository.ts#listForOwner` ordena por
`uploaded_at` quando `sortBy` não é indicado (o valor por omissão em
`listPhotosForOwner`) — mas só existiam índices para
`(album_id, status, sort_order)` e `(album_id, captured_at)`. Nova
migração `0007_photos_uploaded_at_index.sql`:
`create index photos_album_uploaded_idx on photos (album_id, uploaded_at desc);`
— aditiva, sem custo de correção (só cria um índice), sem efeito
visível com poucas fotos por álbum, mas evita uma pesquisa sequencial
à medida que os álbuns crescem.

## Verificação

`pnpm check` completo (lint + typecheck + 210 testes — os testes
existentes de `uploads.test.ts` que simulam falha de armazenamento
continuam a passar com os envios paralelizados) e `pnpm build`. Suite
E2E (16 testes) sem alterações necessárias — e um dos testes mostrou,
no próprio log do servidor de desenvolvimento, o novo
`logger.error(...)` da sessão de visitante (já existente de um commit
anterior) a funcionar como esperado.

## Limitações conhecidas / trabalho seguinte

Da mesma auditoria, ainda por decidir com o administrador:

- `processImage` descodifica o original três vezes (uma por
  `sharp(original)` separado para preview/thumbnail/blurhash) — usar
  `.clone()` a partir de uma única decodificação pouparia CPU/tempo
  por envio.
- `QueryClient()` sem `staleTime` configurado — refetch desnecessário
  ao voltar à aba, mesmo com o tempo real já ativo.
- Invalidação em tempo real refaz todas as páginas já carregadas de
  uma vez (álbuns grandes/muito ativos).
- Grelha sem virtualização (já previsto no `CLAUDE.md`, "quando o
  número de fotografias justificar").
- `getDashboardStats` carrega todas as fotos do dono para memória só
  para contar (já documentado no próprio código como simplificação
  do MVP).

A migração `0007_photos_uploaded_at_index.sql` ainda precisa de ser
aplicada ao projeto Supabase de produção (`supabase db push` ou SQL
Editor) — tal como as anteriores, só tem efeito depois de aplicada.
