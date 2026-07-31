# 0003 — Fase 2: Álbuns e partilha

Data: 2026-07-31

## Contexto

A Fase 2 pede CRUD de álbuns, links não listados com PIN/expiração/
revogação, resolução de link para `album_session`, e uma página pública
com estado vazio. Este documento regista as decisões tomadas e dois
problemas reais de tipos encontrados (e corrigidos) durante a
implementação.

## Decisões

### 1. O segmento `[slug]` da rota pública é o token do link, não `albums.slug`

O `CLAUDE.md` nunca liga explicitamente estes dois conceitos — a secção
9 usa `a/[slug]/page.tsx` como nome de pasta, e a secção 6.3 descreve "um
token aleatório com entropia suficiente" no link partilhado. `albums.slug`
é um identificador único mas previsível (derivado do título); usá-lo
como o segredo do link contradiria "link não listado" (secção 2, item 4)
e "não revelar se um token de álbum existe" (secção 15).

Decisão: `/a/[slug]` trata o valor do segmento como o **token opaco** do
link de partilha (`album_share_links`), não `albums.slug`. `albums.slug`
fica como identificador interno (único, derivado do título), sem uso
nas rotas públicas por agora. `POST /api/albums/resolve` recebe esse
token, calcula o hash e procura em `album_share_links.token_hash`.

### 2. Criação de álbuns bloqueada até à Fase 3 (sem `drive_folder_id` inventado)

`albums.google_connection_id` e `albums.drive_folder_id` são `NOT NULL`
(migração da Fase 1) porque, no fluxo final, ligar o Drive é sempre
anterior a criar um álbum (secção 2, itens 1–3). Sem a integração real
do Drive (Fase 3), não há forma segura de obter um `drive_folder_id`
verdadeiro.

Em vez de inventar um valor ou construir um adaptador Drive "mock" no
caminho de produção (proibido pela regra 5 das "Regras para o Claude
Code"), `POST /api/albums` valida tudo (autorização, corpo do pedido,
ligação Google ativa) e depois recusa explicitamente com
`GOOGLE_DRIVE_INTEGRATION_PENDING` (501), com um comentário `TODO(Fase 3)`
a apontar exatamente onde entra `DriveStorageProvider.createAlbumFolder()`.
O caso de uso `server/use-cases/albums.ts#createAlbum()` está completo e
testado (recebe `driveFolderId`/`googleConnectionId` já resolvidos) —
só falta a Fase 3 chamá-lo com valores reais em vez do 501.

A UI de administração (`/admin/albums`) mostra este formulário na mesma
(é código real, pronto a funcionar assim que a Fase 3 exista), com um
aviso permanente a explicar a limitação.

### 3. Repositórios com interface própria, em vez de mockar o cliente Supabase

`server/repositories/*.ts` definem interfaces estreitas
(`AlbumsRepository`, `ShareLinksRepository`, …) implementadas sobre o
cliente Supabase admin. Os casos de uso recebem essas interfaces por
parâmetro (injeção explícita), não o cliente Supabase diretamente. Isto
permite testar a lógica de orquestração com repositórios falsos em
memória (`tests/unit/fakes/repositories.ts`), sem precisar de mockar a
API fluente do Supabase (`.from().select().eq()...`) nem de um projeto
Supabase real — mantendo a mesma filosofia de teste já usada na Fase 1
para o Google Drive ("adaptador... mockado", secção 19).

### 4. `requireAdmin()` vs `requireAdminApi()` — bug real encontrado e corrigido

`lib/auth/dal.ts#requireAdmin()` (Fase 1) chama `redirect()`, que
funciona lançando um sinal especial que só o próprio Next.js deve
apanhar. A documentação oficial do Next.js
(`node_modules/next/dist/docs/.../redirect.md`) avisa explicitamente:
_"In Server Actions and Route Handlers, redirect should be called
outside the try block when using try/catch statements."_

Todos os Route Handlers de álbuns usam `try { ... } catch (error) {
return jsonError(error, requestId) }`. Um `catch` genérico à volta de
`requireAdmin()` apanharia esse sinal de redirecionamento e devolveria
um 500 em vez de redirecionar — e mesmo que não apanhasse, redirecionar
um pedido de API para uma página HTML de login está errado para um
cliente que espera JSON.

Correção: `requireAdminApi()`, uma função nova em `lib/auth/dal.ts` que
faz a mesma verificação mas lança `AppError("UNAUTHORIZED", ..., 401)`
em vez de chamar `redirect()`. Todos os Route Handlers usam
`requireAdminApi()`; `requireAdmin()` (com `redirect()`) fica reservado a
Server Components (páginas/layouts), onde é seguro e correto. Verificado
manualmente: `GET /api/albums` sem sessão devolve `401` com o envelope
JSON padrão, não um redirecionamento.

### 5. `.schema("public")` explícito — contornar um bug de inferência de tipos

Descoberto ao escrever os repositórios: `SupabaseClient<Database>` (e
`createServerClient<Database>(...)` do `@supabase/ssr`) resolviam
`.from("albums").select(...)`/`.insert(...)` para `never`, mesmo com
`lib/db/database.types.ts` estruturalmente correto (confirmado incluindo
`Relationships: []`, `Views`/`Functions`, e testado tanto com tipos
literais como com `Omit`/`Pick`). Isolado com reproduções mínimas
(`tsc` direto, fora do Next.js): o problema desaparece ao chamar
`.schema("public")` explicitamente antes de `.from(...)` — testado com
`@supabase/supabase-js@2.111.0`, `@supabase/postgrest-js@2.111.0` e
TypeScript 5.8.3 e 5.9.3 (mesmo resultado nas duas versões de TS, logo
não é uma regressão do TypeScript).

Aplicado em todos os repositórios (`const db = client.schema("public");`
antes de qualquer `.from()`) e em `lib/auth/dal.ts#getCurrentProfile()`.
Sem este workaround, o código compila na mesma (`never` é atribuível a
qualquer tipo declarado), mas sem qualquer verificação de tipos real nos
dados devolvidos pelo Supabase — por isso vale a pena manter a chamada
explícita a `.schema("public")` mesmo que uma futura versão do pacote
corrija o problema.

### 6. Hash de token vs hash de PIN: algoritmos diferentes por razão diferente

- **Token do link** (`lib/security/tokens.ts`): HMAC-SHA256 com
  `APP_TOKEN_PEPPER`. Precisa de ser pesquisável por igualdade
  (`where token_hash = ?`, indexado) e o token já tem 256 bits de
  entropia gerados por `crypto.randomBytes` — não precisa de trabalho
  extra para resistir a força bruta offline.
- **PIN** (`lib/security/pin.ts`): scrypt com salt aleatório por PIN. Um
  PIN de 4–8 dígitos tem pouquíssima entropia; scrypt (lento, salgado)
  protege contra um ataque offline se a base de dados for comprometida.
  Não usa `bcryptjs` nem outra dependência nova — `node:crypto` já
  inclui `scryptSync`.

### 7. Revogar um link expira imediatamente as sessões associadas

A secção 6.3 deixa isto como opcional ("e, se configurado, as sessões
existentes"), sem expor um campo para essa opção no esquema. Escolhida a
opção mais segura por omissão (regra da secção 3): `revokeShareLink()`
marca `revoked_at` e chama sempre
`AlbumSessionsRepository#expireByShareLink()`, que força
`expires_at = now()` em todas as sessões emitidas a partir desse link.

### 8. Stack: React Hook Form, Zod, TanStack Query

Primeira fase a introduzir formulários e estado remoto no cliente — as
três dependências já estavam decididas na secção 4 do `CLAUDE.md`, só
não tinham sido instaladas ainda (Fase 1 não tinha formulários). O
`QueryClientProvider` vive em `app/providers.tsx`, no layout raiz (não
só no grupo `(admin)`), porque a página pública do convidado também
precisa dele para `useMutation` em `components/gallery/album-resolver.tsx`.

Um `useEffect` a chamar `setState` diretamente ao montar (para o
"resolve" automático da página pública) foi sinalizado pelo ESLint
(`react-hooks/set-state-in-effect`, novo no `eslint-config-next` para
React 19). Corrigido substituindo por `useMutation` disparado dentro do
`useEffect` — o padrão recomendado para “pedido automático ao montar”
com TanStack Query.

## Limitações conhecidas

- Criação de álbuns bloqueada até à Fase 3 (ver decisão 2).
- Sem rate limiting no `POST /api/albums/resolve` (adivinhação de
  token/PIN) — `UPSTASH_REDIS_*` continuam opcionais/por configurar;
  fica registado como falta de robustez a resolver na Fase 7
  (hardening), tal como já estava previsto no `CLAUDE.md` para outros
  limites de taxa.
- Sem testes de integração contra um Supabase real (mesma limitação da
  Fase 1 — sem Docker neste ambiente). A lógica de orquestração está
  testada com repositórios falsos; a integração real (RLS + Route
  Handlers + Supabase Auth juntos) só foi verificada manualmente com
  `pnpm start` e capturas de ecrã.
- Sem testes E2E Playwright para o fluxo de álbuns (fica para quando
  existir um projeto Supabase de teste).
