# 0002 — Fase 1: Supabase, autenticação e RLS

Data: 2026-07-31

## Contexto

A Fase 1 (`CLAUDE.md`, secção 22) pede clientes Supabase (browser/
server/admin), migrações iniciais, login administrativo (Google via
Supabase Auth), anonymous sign-in para convidados, e RLS com testes de
isolamento. Não existe ainda um projeto Supabase real ligado a este
repositório — todo o trabalho foi validado localmente.

## Decisões

### 1. `@supabase/ssr` com `getAll`/`setAll`

Os três clientes (`lib/db/supabase-browser.ts`, `supabase-server.ts`,
`supabase-admin.ts`) seguem o padrão atual documentado no próprio pacote
`@supabase/ssr` (verificado a partir dos `.d.ts` instalados, versão
0.12.4): os métodos de cookies `get`/`set`/`remove` estão marcados como
`@deprecated` a favor de `getAll`/`setAll`. Usámos sempre a forma nova.

O cliente de servidor cria uma instância nova por pedido (nunca partilha
entre pedidos) e envolve `cookieStore.set` num `try/catch`, porque
Server Components não podem escrever cookies — nesse caso a renovação de
sessão fica a cargo do `proxy.ts`.

### 2. `middleware.ts` → `proxy.ts`

O Next.js 16 renomeou `middleware` para `proxy` (mesma funcionalidade,
runtime Node.js obrigatório, já não hà edge runtime). A lógica de
renovação de sessão vive em `lib/auth/update-session.ts` e é chamada por
um `proxy.ts` fino na raiz, seguindo o guia oficial de autenticação do
Next.js (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`):
o proxy faz apenas uma verificação **otimista** (existe sessão não
anónima?) antes de rotas `/admin/**`; a verificação real de autorização
(papel admin) acontece sempre no servidor, em `requireAdmin()`
(`lib/auth/dal.ts`), nunca só no proxy.

### 3. Bootstrap de administradores: `ADMIN_EMAILS`

A secção 6.1 pede restringir a administração "a emails autorizados ou a
utilizadores com `profiles.role = 'admin'`" — as duas opções, não uma
escolha exclusiva. Isto resolve um problema de bootstrap: o trigger
`handle_new_user` (migração `0002_profile_provisioning.sql`) cria sempre
perfis novos com `role = 'editor'` (o mínimo privilégio), porque não há
forma segura de um trigger SQL saber quem deve ser o primeiro admin.

Adicionámos `ADMIN_EMAILS` (novo, não estava na lista original da
secção 20) como variável de ambiente opcional, string separada por
vírgulas, validada em `lib/env.ts`. `lib/auth/admin.ts#isAdmin()` é
`true` se `profiles.role === 'admin'` **ou** se o email do utilizador
estiver nessa lista. Isto permite:

1. Definir `ADMIN_EMAILS` com o email do primeiro administrador antes do
   primeiro deploy.
2. Uma vez autenticado, promover outros administradores diretamente na
   base de dados (`update profiles set role = 'admin' where email = …`),
   sem precisar de mexer em variáveis de ambiente outra vez.

Optámos pela opção mais segura possível dado o objetivo (nenhum
mecanismo de auto-promoção a admin a partir do cliente) e documentamos
aqui em vez de embutir a decisão silenciosamente no código.

### 4. `profiles.role` não pode ser alterado pelo próprio utilizador

RLS por si só não impede um utilizador autenticado de tentar
`update profiles set role = 'admin' where id = auth.uid()` — a política
`profiles_update_own` só verifica `id = auth.uid()`. Fechámos isto ao
nível de privilégios de coluna, não de RLS:

```sql
revoke update on public.profiles from authenticated;
grant select, update (display_name, avatar_url) on public.profiles to authenticated;
```

Testado explicitamente em `supabase/tests/database/0001_row_level_security_test.sql`
(teste 18): a tentativa de mudar `role` falha com "permission denied",
independentemente do que as políticas de RLS permitiriam.

### 5. `photos`, `album_sessions` e `audit_logs`: sem escrita direta

Por desenho, nenhuma destas tabelas tem política de INSERT/UPDATE/DELETE
para `authenticated`, e não há `GRANT` dessas operações. Todas as
escritas (upload, moderação, criação de sessão de álbum a partir de um
token, auditoria) passam pela service role dentro de Route Handlers, que
validam a autorização em código antes de escrever — consistente com "5.
Um utilizador anónimo não consegue editar metadados" (secção 8) e com
"Uploads e ações de moderação passam por Route Handlers do servidor"
(secção 8). `album_sessions` e `photos` só têm políticas de `SELECT`.

Em contraste, `albums`, `google_connections` e `album_share_links`
_têm_ políticas completas de CRUD para o dono autenticado (admin),
porque não há razão de segurança para forçar esses caminhos através da
service role — o próprio RLS já garante isolamento por dono.

### 6. Verificação de RLS sem Docker: stub local + pgTAP

`supabase test db` (o comando oficial para correr testes pgTAP em
`supabase/tests/database/`) precisa do Supabase CLI a gerir um stack
local via Docker. Este ambiente de desenvolvimento não tem o daemon do
Docker disponível (`docker info` falha com
"failed to connect to the docker API"), pelo que não foi possível correr
o stack real do Supabase aqui.

Em vez de deixar as políticas de RLS por verificar, foi criada uma
aproximação mínima do runtime do Supabase em Postgres puro
(`tests/sql/00_supabase_stub.sql`): schemas `auth`/`storage`, uma tabela
`auth.users` simplificada, `auth.uid()`/`auth.role()` a ler variáveis de
sessão (`request.jwt.claim.*`), e os papéis `anon`/`authenticated`/
`service_role` (este último com `BYPASSRLS`). As migrações reais
(`supabase/migrations/*.sql`) foram aplicadas sobre este stub num
Postgres 16 local, seguidas dos testes pgTAP reais de
`supabase/tests/database/0001_row_level_security_test.sql` — as 20
asserções passam, cobrindo os 5 cenários exigidos pela secção 8 mais
verificações extra (escalonamento de privilégio, isolamento entre
administradores, distinção entre permissão "view" e "moderate",
bypass da service role).

**O que isto prova:** a sintaxe das migrações é válida em Postgres real,
e o comportamento das políticas de RLS está correto para as regras de
`auth.uid()`/`auth.role()`, GRANTs e JOINs que escrevemos.

**O que isto não prova:** comportamento específico do GoTrue (emissão
real de JWT, expiração, `is_anonymous` tal como o Supabase o define no
token), políticas de `storage.objects` (não tocadas — o bucket
`photo-previews` não tem políticas próprias, fica só acessível à service
role), nem Realtime. Estes ficam para verificação manual com um projeto
Supabase real (ou `supabase start` num ambiente com Docker) antes de
produção — ver `docs/implementation-status.md`.

`tests/sql/00_supabase_stub.sql` não é uma migração da aplicação e nunca
deve ser apontado a um projeto Supabase real.

### 7. Supabase CLI como dependência de desenvolvimento

Adicionado `supabase` (pacote npm oficial) como `devDependency`, com
`supabase/config.toml` gerado por `supabase init`. Ativado
`enable_anonymous_sign_ins = true` e adicionado um bloco
`[auth.external.google]` para o login administrativo local, com
`client_id`/`secret` lidos de variáveis de ambiente próprias
(`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`/`_SECRET`) — **distintas** de
`GOOGLE_OAUTH_CLIENT_ID`/`_SECRET`, que são exclusivamente para a ligação
ao Google Drive (secção 6.2, Fase 3). Estas variáveis do CLI local não
fazem parte do esquema validado por `lib/env.ts` (esse valida apenas as
variáveis que a aplicação Next.js lê em `process.env`); são consumidas
diretamente pelo Supabase CLI. Para o projeto hospedado, o mesmo
fornecedor Google deve ser configurado no dashboard do Supabase
(Authentication → Providers), não neste ficheiro.

Adicionados scripts de conveniência (`db:start`, `db:stop`, `db:reset`,
`db:test`, `db:types`) — nenhum faz parte de `pnpm check`, todos
precisam de Docker.

### 8. `lib/db/database.types.ts` escrito à mão

Sem projeto Supabase real ligado, `supabase gen types typescript` não
tem de onde gerar tipos. Escrevemos `Database` manualmente a partir das
migrações SQL. Assim que existir um projeto (local via `supabase start`
ou remoto), correr `pnpm db:types` para o substituir por uma versão
gerada e mantê-los sincronizados a partir daí.
