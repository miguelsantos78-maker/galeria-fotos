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

## Scripts

| Comando            | Descrição                                          |
| ------------------ | --------------------------------------------------- |
| `pnpm dev`          | Arranca o servidor de desenvolvimento               |
| `pnpm build`        | Cria a build de produção                            |
| `pnpm start`        | Arranca a aplicação a partir da build de produção   |
| `pnpm lint`         | Corre o ESLint                                      |
| `pnpm typecheck`    | Verifica os tipos TypeScript sem gerar output       |
| `pnpm test`         | Corre os testes unitários/integração (Vitest)       |
| `pnpm test:watch`   | Corre os testes em modo watch                       |
| `pnpm test:e2e`     | Corre os testes end-to-end (Playwright)             |
| `pnpm format`       | Formata o código com o Prettier                     |
| `pnpm check`        | Lint + typecheck + testes (usado antes de cada PR)  |

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
supabase/       Migrações SQL e seeds
tests/          Testes unitários, de integração e end-to-end
docs/           Documentação de decisões e operações
```

## Estado do projeto

O projeto está a ser desenvolvido por fases incrementais, descritas na
secção 22 do `CLAUDE.md`. O estado atual está registado em
[`docs/implementation-status.md`](./docs/implementation-status.md).
