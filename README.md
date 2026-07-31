# LiveGallery

Aplicação web para criação, partilha e visualização em tempo real de
galerias de fotografias de eventos. Os originais são guardados no Google
Drive do administrador; o Supabase guarda metadados, autenticação e
propaga alterações em tempo real.

Consulte [`CLAUDE.md`](./CLAUDE.md) para a especificação completa do
projeto e as regras de desenvolvimento, e
[`docs/implementation-status.md`](./docs/implementation-status.md) para o
estado atual da implementação por fase.

## Stack

- Next.js (App Router) + React + TypeScript estrito
- Tailwind CSS
- Supabase (PostgreSQL, Auth, Realtime, Storage)
- Google Drive API v3
- Vitest + Testing Library (testes unitários/integração)
- Playwright (testes end-to-end)

## Pré-requisitos

- Node.js 22+
- pnpm 10+

## Instalação

```bash
pnpm install
cp .env.example .env.local
```

Preencha `.env.local` com as credenciais do Supabase e do Google Cloud.
Consulte a secção 20 do `CLAUDE.md` para o significado de cada variável.
`APP_ENCRYPTION_KEY` deve ter pelo menos 32 caracteres/bytes e
`APP_TOKEN_PEPPER` pelo menos 16.

## Desenvolvimento

```bash
pnpm dev
```

A aplicação fica disponível em [http://localhost:3000](http://localhost:3000).

## Supabase

Este projeto usa [Supabase](https://supabase.com) para base de dados,
autenticação, tempo real e o bucket privado de previews. Precisa do
[Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
(incluído como dependência de desenvolvimento) e do Docker para correr
localmente.

```bash
pnpm db:start   # arranca Postgres + Auth + Storage locais (precisa de Docker)
pnpm db:reset   # reaplica as migrações de supabase/migrations/ e o seed
pnpm db:test    # corre os testes pgTAP de supabase/tests/database/
pnpm db:types   # regenera lib/db/database.types.ts a partir da base local
```

Para testar o login administrativo localmente, defina no `.env` lido
pelo Supabase CLI (não no `.env.local` da aplicação):
`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` e
`SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` — um par cliente/segredo OAuth do
Google **diferente** de `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET`, que são só
para a ligação ao Google Drive (ver
[`docs/decisions/0002-fase-1-supabase-auth.md`](./docs/decisions/0002-fase-1-supabase-auth.md)).

Num projeto Supabase hospedado, active o fornecedor Google e o
"Anonymous sign-ins" em Authentication → Providers no dashboard, e
aplique as migrações com `supabase link` + `supabase db push` (ou
`supabase db push --linked`).

### Primeiro administrador

Os novos utilizadores Google começam sempre com `profiles.role =
'editor'`. Para promover o primeiro administrador, defina `ADMIN_EMAILS`
(no `.env.local` da aplicação) com o email desse utilizador antes do
primeiro login — depois disso, promova outros administradores
diretamente na base de dados (`update profiles set role = 'admin' where
email = '...'`).

## Scripts

| Comando           | Descrição                                           |
| ----------------- | --------------------------------------------------- |
| `pnpm dev`        | Arranca o servidor de desenvolvimento               |
| `pnpm build`      | Cria a build de produção                            |
| `pnpm start`      | Arranca a aplicação a partir da build de produção   |
| `pnpm lint`       | Corre o ESLint                                      |
| `pnpm typecheck`  | Verifica os tipos TypeScript sem gerar output       |
| `pnpm test`       | Corre os testes unitários/integração (Vitest)       |
| `pnpm test:watch` | Corre os testes em modo watch                       |
| `pnpm test:e2e`   | Corre os testes end-to-end (Playwright)             |
| `pnpm format`     | Formata o código com o Prettier                     |
| `pnpm check`      | Lint + typecheck + testes (usado antes de cada PR)  |
| `pnpm db:start`   | Arranca o stack Supabase local (precisa de Docker)  |
| `pnpm db:reset`   | Reaplica migrações + seed na base local             |
| `pnpm db:test`    | Corre os testes pgTAP de RLS                        |
| `pnpm db:types`   | Regenera os tipos TypeScript a partir da base local |

## Docker

```bash
docker build -t livegallery .
docker run -p 3000:3000 --env-file .env.local livegallery
```

## Estrutura do projeto

```text
app/            Rotas (App Router): páginas públicas, admin e API
components/     Componentes React organizados por domínio
lib/            Lógica reutilizável (auth, Google Drive, media, env, …)
server/         Casos de uso, serviços e repositórios do lado do servidor
supabase/       Migrações SQL, seed e testes pgTAP (supabase/tests/database)
tests/          Testes unitários, de integração, end-to-end e SQL de apoio
docs/           Documentação de decisões e operações
```

## Estado do projeto

O projeto está a ser desenvolvido por fases incrementais, descritas na
secção 22 do `CLAUDE.md`. O estado atual está registado em
[`docs/implementation-status.md`](./docs/implementation-status.md).
