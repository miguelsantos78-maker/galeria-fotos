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
      (`server/use-cases/albums.ts#createAlbumWithDriveFolder`) —
      `POST /api/albums` já não recusa com 501, chama o Drive antes
      de inserir o álbum.
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

**Estado: concluída**

- [x] UI de seleção e fila (`components/upload/upload-queue.tsx`):
      seleção múltipla, arrastar e largar, captura pela câmara no
      telemóvel, até 3 envios simultâneos, progresso por ficheiro via
      XHR, cancelar e tentar novamente, mensagens de erro por ficheiro,
      aviso de consentimento, região ARIA para progresso.
- [x] Endpoint de upload em dois passos (secção 14):
      `POST /api/albums/[albumId]/uploads` (inicia, cria `upload_jobs`)
      e `POST /api/albums/[albumId]/uploads/[uploadId]/complete`
      (recebe os bytes, valida tudo outra vez no servidor, envia o
      original ao Drive, processa e grava `photos`).
- [x] Processamento de imagem (`lib/media/`): validação por assinatura
      binária (`file-type`), limite de decompression bomb, rotação
      EXIF, preview (1600px) e thumbnail (480px) em WebP sem EXIF
      (`sharp`), sha256 do original com deteção de duplicados,
      blurhash.
- [x] Nomes seguros para os originais no Drive; nome original mantido só
      como metadado.
- [x] Estados e tratamento de erros: `upload_jobs` acompanha o envio em
      curso; falhas a meio limpam o que já tiver sido criado no Drive/
      Storage (nunca deixam ficheiros órfãos ou uma fotografia
      "publicada" sem pasta/preview).
- [x] Limites: `MAX_UPLOAD_BYTES` validado no cliente e duas vezes no
      servidor; `MAX_FILES_PER_UPLOAD` no cliente.
- [x] Grelha mínima de fotografias (`GET /api/albums/[albumId]/photos`,
      `components/gallery/photo-grid.tsx`) com paginação por cursor e
      URLs assinados de curta duração — prova o critério de saída da
      fase; a galeria completa é a Fase 5.
- [x] Bug de ambiente de testes encontrado e corrigido: `vitest` com
      `environment: "jsdom"` partia `file-type` (`Buffer` não é
      `instanceof` o `Uint8Array` do realm do jsdom); trocado para
      `"node"` por omissão (detalhe em `docs/decisions/0005`).
- [x] `pnpm check` (lint + typecheck + 129 testes) e `pnpm build` a
      passar; verificado manualmente com `pnpm start` (códigos de erro
      corretos sem sessão, páginas não rebentam sem Supabase real
      ligado).

Limitações conhecidas (detalhe em `docs/decisions/0005`):

- Sem upload retomável — um único pedido `multipart/form-data` por
  ficheiro; fica como tarefa explícita antes de aceitar ficheiros
  grandes em produção (tal como o `CLAUDE.md` já previa).
- Sem rate limiting por IP/sessão/álbum (fica para a Fase 7).
- Mensagem de consentimento estática, não configurável por álbum.
- `captured_at` não é extraído do EXIF (não pedido explicitamente pela
  secção 13; evita mais uma dependência).
- Sem testes de integração contra Supabase/Google Drive reais (mesma
  limitação de ambiente das fases anteriores).

## Fase 5 — Galeria e realtime

**Estado: concluída**

- [x] Grelha responsiva com layout "masonry" via CSS `columns`
      (`components/gallery/photo-grid.tsx`), sem nova dependência.
- [x] Paginação por cursor com carregamento progressivo
      (`useInfiniteQuery` + `IntersectionObserver`, com "Carregar mais"
      como alternativa acessível ao scroll automático).
- [x] Lightbox de ecrã inteiro (`components/gallery/lightbox.tsx`):
      anterior/seguinte, swipe, setas do teclado, `Escape`, foco preso
      no modal, foco devolvido ao fechar, transferir (quando
      `download_enabled`), partilhar link interno (`?photo=<id>`).
- [x] Modo apresentação como variante do lightbox (avanço automático,
      respeita `prefers-reduced-motion`).
- [x] Subscrição Realtime (`lib/realtime/use-photos-realtime.ts`):
      `postgres_changes` em `photos` filtrado por `album_id`, nunca
      confia no payload do evento (só invalida e refaz o pedido
      autorizado), indicador de ligação, fallback de refetch periódico
      quando desligado, subscrição limpa ao desmontar/mudar de álbum.
- [x] Migração `0005_realtime.sql` a adicionar `photos` à publicação
      `supabase_realtime` (vazia por omissão num projeto novo).
- [x] Dois endpoints implementados agora, que tinham ficado
      deliberadamente por fazer nas Fases 3/4:
      `GET /api/media/[photoId]/original` (transmite o original do
      Drive sem nunca expor tokens/URLs do Google, gated por sessão de
      álbum + `download_enabled`).
- [x] Primeiro teste de componente da suíte
      (`tests/unit/lightbox.test.tsx`), usando
      `@vitest-environment jsdom` por ficheiro (infraestrutura
      preparada na Fase 4).
- [x] `pnpm check` (lint + typecheck + 146 testes) e `pnpm build` a
      passar; migrações validadas com Postgres local + pgTAP (20 testes
      de RLS continuam a passar); verificado manualmente com
      `pnpm start` (códigos de erro corretos sem sessão, deep link
      `?photo=` não rebenta sem Supabase real ligado).

Limitações conhecidas (detalhe em `docs/decisions/0006`):

- Sem testes de integração/E2E contra um projeto Supabase real com
  Realtime ativo (mesma limitação de ambiente das fases anteriores); o
  critério de saída literal (dois browsers sem recarregar) só pode ser
  confirmado manualmente com um projeto real.
- Deep link `?photo=<id>` só encontra a fotografia se já estiver na
  página carregada.

## Fase 6 — Moderação e operações

**Estado: concluída**

- [x] Aprovar/republicar (`pending_review`/`hidden` → `ready`) e ocultar
      (`ready` → `hidden`), com transições validadas explicitamente no
      servidor — nunca aceita um `status` arbitrário do cliente.
- [x] Destacar (`is_featured`) e definir/remover como capa
      (`albums.cover_photo_id`), no mesmo `PATCH /api/photos/[photoId]`.
- [x] Eliminação completa (`DELETE /api/photos/[photoId]`): apaga o
      original do Drive e os derivados na Storage antes de marcar a
      linha como eliminada (ordem inversa da criação), idempotente,
      limpa a capa do álbum se aplicável.
- [x] Ações em lote (`POST /api/albums/[albumId]/photos/batch`):
      aprovar/ocultar/eliminar várias fotografias, sequencial, com
      falhas parciais reportadas por fotografia.
- [x] Auditoria: todas as ações de moderação/eliminação registadas em
      `audit_logs`.
- [x] Listagem de administração
      (`GET /api/albums/[albumId]/photos/moderation`) separada da
      listagem pública — nunca reutiliza a mesma lógica de visibilidade
      de convidado — com ordenação por data de envio ou de captura
      (esta última ainda inerte, ver limitações).
- [x] Painel de moderação (`components/admin/photo-moderation.tsx`)
      embutido na página de detalhe do álbum: seleção em lote, ações
      por fotografia, indicadores de estado/destaque/capa.
- [x] Dashboard de administração
      (`server/use-cases/dashboard.ts#getDashboardStats`) com números
      reais: álbuns, fotografias, fotografias recentes, envios com
      erro — substitui a página estática anterior.
- [x] `pnpm check` (lint + typecheck + 172 testes) e `pnpm build` a
      passar; verificado manualmente com `pnpm start` (401 correto sem
      sessão administrativa nos novos endpoints, dashboard continua a
      redirecionar para login).

Limitações conhecidas (detalhe em `docs/decisions/0007`):

- Sem paginação na listagem de administração (limite fixo de 200).
- "Ordenar por data de captura" ainda não produz uma ordem diferente,
  porque `captured_at` continua sempre `null` (Fase 4).
- Estatísticas do dashboard agregadas em memória, sem `COUNT()`
  dedicado — aceitável à escala de um MVP.
- Sem testes de integração/E2E contra Supabase/Google Drive reais
  (mesma limitação de ambiente das fases anteriores).

## Fase 7 — Hardening e deploy

**Estado: concluída**

- [x] Content Security Policy e cabeçalhos de segurança
      (`lib/security/csp.ts`, aplicados em `lib/auth/update-session.ts`
      a todas as respostas): `frame-ancestors 'none'`,
      `object-src 'none'`, `base-uri`/`form-action 'self'`,
      `img-src`/`connect-src`
      limitados ao próprio site e ao host do Supabase configurado,
      `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
      `Permissions-Policy`, `Strict-Transport-Security`. CSP com nonce
      por pedido foi tentada primeiro e abandonada por não ser fiável
      em páginas estáticas nesta versão do Next.js (detalhe em
      `docs/decisions/0008`).
- [x] CSRF: decidido que `SameSite=Lax` (omissão do `@supabase/ssr`)
      já protege as mutações baseadas em cookie, sem token dedicado.
- [x] Rate limiting (`lib/security/rate-limit.ts`, Upstash) em
      `POST /api/albums/resolve` e nos dois endpoints de upload —
      desligado sem `UPSTASH_REDIS_REST_*` configurado, tal como já
      adiado nas ADRs 0003/0005/0007.
- [x] CI (`.github/workflows/ci.yml`): lint + typecheck + testes
      unitários + build num job, testes E2E noutro.
- [x] Testes E2E (`tests/e2e/`): proteção das rotas administrativas,
      fluxo do convidado com a rede simulada por `page.route()` (nunca
      mocks dentro da aplicação), verificação automática de
      acessibilidade com `@axe-core/playwright` — encontrou e corrigiu
      um problema real de contraste (secção 17).
- [x] Checklist de produção
      (`docs/operations/production-checklist.md`): Google
      Cloud/Supabase, segredos, migrações, build/deploy no Cloud Run,
      smoke tests pós-deploy, rollback.
- [x] Validação do `Dockerfile`: parcial, por bloqueio de rede real ao
      registo Docker neste ambiente (confirmado, não presumido);
      `.dockerignore`, `pnpm-workspace.yaml` e os binários nativos do
      `sharp` verificados estaticamente, e o comando final do
      `Dockerfile` (`node .next/standalone/server.js`) reproduzido e
      validado manualmente fora do Docker.
- [x] `pnpm check` (lint + typecheck + 179 testes) e `pnpm build` a
      passar; 15 testes E2E a passar (`pnpm test:e2e`); 20 testes pgTAP
      de RLS continuam a passar.

Limitações conhecidas (detalhe em `docs/decisions/0008`):

- CSP usa `'unsafe-inline'` para scripts, não nonces — mitiga menos
  classes de XSS do que uma CSP com nonce funcional teria.
- Sem confirmação end-to-end do `docker build` completo.
- E2E automático só cobre fluxos de convidado sem sessão real; login de
  administrador, ligação ao Drive, criação de álbum, moderação e tempo
  real entre dois browsers continuam a exigir verificação manual em
  staging (checklist de produção).
- Rate limiting sem efeito real neste ambiente (sem Upstash
  configurado) — só a plumbing e o estado "desligado" foram testados.

## MVP completo

Todas as fases da secção 22 do `CLAUDE.md` (0 a 7) estão concluídas.
O critério de saída de cada fase está documentado na respetiva secção
acima, e as decisões de implementação em `docs/decisions/0001` a
`0008`. As limitações conhecidas de cada fase — sobretudo a
impossibilidade de testar contra um Supabase/Google Drive reais e um
`docker build` completo neste ambiente de desenvolvimento — ficam como
trabalho de verificação manual antes da primeira implantação real,
guiado por `docs/operations/production-checklist.md`.
