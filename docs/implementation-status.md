# Estado da implementação

Este documento acompanha o plano de fases definido na secção 22 do
`CLAUDE.md`. Atualizar sempre que uma fase for concluída ou iniciada.

## Fase 0 — Bootstrap

**Estado: concluída**

- [x] Projeto Next.js (App Router) + TypeScript estrito + pnpm.
- [x] ESLint, Prettier, Vitest + Testing Library, Playwright configurados.
- [x] Alias `@/*` para importações absolutas.
- [x] Layout base em `pt-PT` com tokens de design (cores, superfícies, raio)
      em `app/globals.css`.
- [x] Validação de ambiente com Zod em `lib/env.ts` (separando variáveis
      públicas e privadas), aplicada no arranque via `instrumentation.ts`.
- [x] `.env.example` com todas as variáveis descritas na secção 20.
- [x] `Dockerfile` multi-stage (build com Turbopack + runtime `standalone`)
      e `.dockerignore`.
- [x] `README.md` inicial com instruções de instalação.
- [x] Esqueleto de pastas conforme a secção 9 (`app`, `components`, `lib`,
      `server`, `supabase`, `tests`, `docs`), com páginas placeholder nas
      rotas públicas/admin e endpoint `/api/health`.
- [x] `pnpm check` (lint + typecheck + test) e `pnpm build` a passar.

Fora do âmbito desta fase (adiado para as fases seguintes, conforme o
plano): migrações Supabase, autenticação, CRUD de álbuns, integração
Google Drive, upload/processamento de imagem e galeria com dados reais
ou mockados. As pastas correspondentes existem como esqueleto (com
`.gitkeep`) para já não haver reestruturação mais tarde.

## Fase 1 — Supabase e autenticação

**Estado: concluída**

- [x] Clientes Supabase browser/server/admin (`lib/db/supabase-*.ts`),
      seguindo o padrão atual `getAll`/`setAll` do `@supabase/ssr`.
- [x] Migrações iniciais completas (`supabase/migrations/0001`–`0004`):
      esquema da secção 7, trigger de provisionamento de perfis, RLS da
      secção 8 e bucket privado `photo-previews`.
- [x] Login administrativo com Google via Supabase Auth
      (`/admin/login`, `/api/auth/callback`, `/api/auth/signout`),
      protegido no servidor por `requireAdmin()` (`lib/auth/dal.ts`) e
      opticamente por `proxy.ts`/`lib/auth/update-session.ts`.
- [x] Bootstrap de administradores via `ADMIN_EMAILS` +
      `profiles.role = 'admin'` (ver `docs/decisions/0002`).
- [x] Helper de anonymous sign-in para convidados
      (`lib/auth/ensureAnonymousSession`), pronto para a Fase 2 ligar à
      resolução de álbum.
- [x] RLS validado com 20 testes pgTAP
      (`supabase/tests/database/0001_row_level_security_test.sql`),
      cobrindo os 5 cenários da secção 8 mais escalonamento de
      privilégio, isolamento entre administradores e a distinção entre
      permissões "view"/"moderate".
- [x] `pnpm check` e `pnpm build` a passar; testado manualmente com
      `pnpm start` (redireciona `/admin` → `/admin/login` sem sessão).

Limitações conhecidas (ver `docs/decisions/0002` para detalhe):

- Não existe um projeto Supabase real ligado. Os testes de RLS correram
  contra Postgres local com uma aproximação mínima dos schemas
  `auth`/`storage` (`tests/sql/00_supabase_stub.sql`), não contra o
  stack real do Supabase (`supabase test db` precisa de Docker, que não
  está disponível neste ambiente). Recomenda-se voltar a correr
  `pnpm db:test` num ambiente com Docker antes de produção.
- Login Google não testado ponta-a-ponta (precisa de credenciais OAuth
  reais); o fluxo de código foi verificado por leitura e pelos tipos
  oficiais do `@supabase/auth-js`.
- `lib/db/database.types.ts` foi escrito à mão a partir das migrações;
  substituir por `pnpm db:types` assim que existir um projeto Supabase.
- `ensureAnonymousSession()` (helper de browser) continua por usar — a
  Fase 2 decidiu criar a sessão anónima no próprio servidor, dentro de
  `POST /api/albums/resolve`, para o convidado só precisar de uma
  chamada (ver `docs/decisions/0003`). O helper fica disponível para um
  futuro caso em que o cliente precise de garantir sessão antes de
  outra chamada (por exemplo, Realtime na Fase 5).

## Fase 2 — Álbuns e partilha

**Estado: concluída**

- [x] CRUD de álbuns: `server/use-cases/albums.ts` +
      `app/api/albums/route.ts` + `app/api/albums/[albumId]/route.ts`
      (criar, listar, ver, atualizar/publicar/arquivar, eliminar
      idempotente).
- [x] Links de partilha com PIN (scrypt), expiração e revogação (que
      também expira sessões já emitidas): `server/use-cases/share-links.ts` + `app/api/albums/[albumId]/share-links/**`.
- [x] Resolução de link para `album_session`: `POST /api/albums/resolve`
      cria a sessão anónima do convidado no próprio pedido, se ainda não
      existir, e troca o token por uma sessão (`server/use-cases/resolve-album.ts`).
- [x] Página pública `/a/[slug]` com estados de carregamento, PIN,
      indisponível e vazio (`components/gallery/album-resolver.tsx`) — o
      segmento `[slug]` transporta o token do link, não `albums.slug`
      (ver `docs/decisions/0003`).
- [x] Administração: `/admin/albums` (lista + criação) e
      `/admin/albums/[albumId]` (edição de estado, eliminação, gestão de
      links), com React Hook Form + Zod + TanStack Query.
- [x] Camada de repositórios (`server/repositories/`) com interfaces
      próprias, permitindo testar os casos de uso com implementações
      falsas em memória, sem precisar de um Supabase real.
- [x] Dois bugs reais encontrados e corrigidos durante a implementação
      (detalhe em `docs/decisions/0003`): `redirect()` apanhado
      incorretamente por `try/catch` nos Route Handlers (nova
      `requireAdminApi()`), e um bug de inferência de tipos do
      `@supabase/supabase-js`/`@supabase/ssr` que fazia `.from(...)`
      resolver para `never` sem `.schema("public")` explícito.
- [x] `pnpm check`, `pnpm build` e 74 testes unitários (incluindo os
      casos de uso) a passar; verificado manualmente com `pnpm start`
      (redirecionamentos de autenticação, erros da API, renderização das
      páginas — capturas de ecrã tiradas com o Chromium pré-instalado).

Limitações conhecidas (detalhe em `docs/decisions/0003`):

- Criação de álbuns está implementada mas devolve sempre
  `GOOGLE_DRIVE_NOT_CONNECTED`/`GOOGLE_DRIVE_INTEGRATION_PENDING` — só
  fica utilizável quando a Fase 3 (Google Drive) existir.
- Sem rate limiting no `resolve` (fica para a Fase 7).
- Sem testes de integração contra Supabase real nem testes E2E
  Playwright para este fluxo (mesma limitação de ambiente da Fase 1).

## Fase 3 — Google Drive

**Estado: concluída**

- [x] OAuth 2.0 Authorization Code Flow com PKCE (S256), `state`
      anti-CSRF e cookies `HttpOnly`/`Secure`/`SameSite=Lax` de curta
      duração, separado do login administrativo
      (`lib/google-drive/oauth-client.ts`,
      `app/api/google-drive/{connect,callback}/route.ts`).
- [x] Refresh token encriptado com AES-256-GCM, versão de chave
      registada (`lib/security/encryption.ts`,
      `google_connections.token_key_version`), nunca devolvido ao
      browser (`lib/google-drive/public-connection.ts`).
- [x] Adaptador real sobre a Drive API v3
      (`lib/google-drive/drive-provider.ts`): pasta raiz idempotente
      (procura por `appProperties` antes de criar), subpasta por álbum,
      upload/leitura/eliminação idempotente de ficheiros, verificação de
      ligação — com retry desligado explicitamente nas operações não
      idempotentes (`{ retry: false }`).
- [x] Orquestração de ligação/reconexão/desconexão/verificação
      (`server/use-cases/google-drive-connection.ts`) e criação de
      álbum com pasta Drive associada
      (`server/use-cases/albums.ts#createAlbumWithDriveFolder`) — `POST
      /api/albums` já não recusa com 501, chama o Drive antes de
      inserir o álbum.
- [x] UI de administração `/admin/settings/integrations`: estado da
      ligação, ligar, reconectar, verificar, desligar.
- [x] Adaptador falso para testes (`tests/unit/fakes/drive-provider.ts`),
      seguindo o padrão de injeção de dependências já usado para os
      repositórios.
- [x] Problema real de dependências encontrado e corrigido: duas versões
      de `google-auth-library` na árvore de dependências do próprio
      `googleapis@173.0.0`, causando erro de tipos; resolvido com
      `pnpm.overrides` (detalhe em `docs/decisions/0004`).
- [x] `pnpm check` (lint + typecheck + 92 testes) e `pnpm build` a
      passar.

Limitações conhecidas (detalhe em `docs/decisions/0004`):

- Sem Docker/credenciais OAuth reais neste ambiente — nada foi testado
  contra o Google Cloud real; a orquestração está coberta com
  repositório e adaptador Drive falsos.
- `uploadOriginal`/`getOriginalStream` estão implementados mas ainda sem
  consumidor — entram em uso na Fase 4.
- Acesso à documentação oficial do Google bloqueado pela política de
  rede desta sessão; a superfície da API foi confirmada pelos `.d.ts`
  dos pacotes instalados.

## Fase 4 — Upload e processamento

**Estado: por iniciar**

## Fase 5 — Galeria e realtime

**Estado: por iniciar**

## Fase 6 — Moderação e operações

**Estado: por iniciar**

## Fase 7 — Hardening e deploy

**Estado: por iniciar**
