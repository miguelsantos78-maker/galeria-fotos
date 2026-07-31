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

**Estado: por iniciar**

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
