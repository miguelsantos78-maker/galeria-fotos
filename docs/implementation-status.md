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
- `ensureAnonymousSession()` ainda não está ligada a nenhuma página (só
  acontece quando a Fase 2 implementar a resolução de álbum).

## Fase 2 — Álbuns e partilha

**Estado: por iniciar**

## Fase 3 — Google Drive

**Estado: por iniciar**

## Fase 4 — Upload e processamento

**Estado: por iniciar**

## Fase 5 — Galeria e realtime

**Estado: por iniciar**

## Fase 6 — Moderação e operações

**Estado: por iniciar**

## Fase 7 — Hardening e deploy

**Estado: por iniciar**
