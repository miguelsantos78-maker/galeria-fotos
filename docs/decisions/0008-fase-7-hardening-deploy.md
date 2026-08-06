# 0008 — Fase 7: Hardening e deploy

Data: 2026-08-01

## Contexto

A Fase 7 pede CSP e cabeçalhos, testes E2E completos, performance e
acessibilidade, Cloud Run/CI/documentação operacional, e um checklist
de produção (secção 22). Critério de saída: build reproduzível,
migrações aplicadas, segredos externos ao repositório e smoke tests
aprovados. Este documento regista as decisões tomadas, incluindo uma
tentativa de implementação que falhou de forma instrutiva (CSP com
nonce) e as limitações reais de rede/infraestrutura deste ambiente.

## Decisões

### 1. CSP com nonce por pedido tentada primeiro, abandonada por não ser fiável nesta versão do Next.js

A abordagem "correta" documentada pelo Next.js para CSP no App Router é
gerar um nonce por pedido no middleware, repeti-lo no cabeçalho
`Content-Security-Policy` do próprio pedido (não só da resposta — é
onde `parseRequestHeaders` em `app-render.js` o lê, confirmado por
leitura direta do código fonte instalado, já que o acesso à
documentação oficial está bloqueado nesta sessão), e usar `script-src
'self' 'nonce-X' 'strict-dynamic'`.

Implementada assim, funcionou perfeitamente em todas as rotas
dinâmicas (`/admin/login`, `/a/[slug]`, etc.) mas falhava de forma
consistente na página inicial (`/`, estática por omissão) — os scripts
de hidratação do próprio Next.js não recebiam o nonce, porque uma
página pré-renderizada estaticamente é gerada uma vez em build, sem
noção de um nonce por pedido. Forçar `export const dynamic =
"force-dynamic"` nessa página não resolveu — sinal de que a
interação entre nonce por pedido e o cache de rota desta versão do
Next.js não é trivial de eliminar por completo (o diagnóstico ficou
short-circuited depois de confirmar, por comparação direta, que o
mesmo mecanismo funcionava sem falhas nas rotas genuinamente
dinâmicas).

Decisão: `script-src 'self' 'unsafe-inline'` (secção 15) — a mesma
concessão pragmática já aceite para `style-src` (atributos `style`
inline em React). Continua a impedir a técnica de XSS mais comum
(injetar/carregar um `<script src="https://atacante.example/...">` de
outra origem); só deixa de impedir a execução de JavaScript já
injetado inline no HTML da própria página, um subconjunto mais
estreito de ataques. As restantes diretivas mantêm-se estritas:
`frame-ancestors 'none'` (clickjacking), `object-src 'none'`,
`base-uri 'self'`, `form-action 'self'`, e `img-src`/`connect-src`
limitados ao próprio site e ao host exato do projeto Supabase
configurado (nunca um `https:` genérico).

Verificado com Playwright contra um build real (`next start` e
`node .next/standalone/server.js`): zero avisos de CSP na consola em
`/`, `/admin/login`, `/a/[slug]` e numa rota 404, com os cabeçalhos de
segurança (`X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`)
presentes em todas as respostas, incluindo APIs.

### 2. CSRF: cookies `SameSite=Lax` já chegam, sem token dedicado

A secção 15 pede CSRF "quando necessário" nas mutações baseadas em
cookie — não incondicionalmente. `@supabase/ssr` usa
`sameSite: "lax"` por omissão para os cookies de sessão (confirmado no
código fonte instalado, `DEFAULT_COOKIE_OPTIONS`). Cookies
`SameSite=Lax` não são enviados em pedidos `POST`/`PATCH`/`DELETE`
entre origens — só em navegações de topo por `GET`. Um site atacante a
tentar disparar uma mutação contra esta aplicação a partir de outra
origem não consegue incluir o cookie de sessão; o pedido chega sem
autenticação e é recusado por `requireAdminApi()`/pela verificação de
`album_session`, tal como um pedido de um visitante anónimo genuíno
sem sessão. Decisão: não construir um mecanismo de token CSRF
dedicado — seria complexidade adicional sem mitigar uma ameaça real
que os cookies já não cobrissem.

### 3. Rate limiting com Upstash, sempre a "não-operação" sem configuração

`lib/security/rate-limit.ts` fica desligado (permite sempre) quando
`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` não estão
definidos — em vez de falhar o arranque ou bloquear pedidos por falta
de configuração. Isto foi decidido explicitamente nas ADRs 0003, 0005
e 0007, todas a adiar rate limiting para esta fase; agora aplicado a
`POST /api/albums/resolve` (por IP — adivinhar token/PIN), e a
`POST /api/albums/[albumId]/uploads`/`.../complete` (por sessão+álbum).
Sem Upstash configurado (o caso deste ambiente de desenvolvimento, sem
acesso de rede a um Upstash real), o comportamento é idêntico ao de
antes desta fase — só muda quando as variáveis são definidas, o que o
checklist de produção (`docs/operations/production-checklist.md`) marca
como fortemente recomendado, não apenas opcional.

### 4. CI com valores fictícios de ambiente, nunca segredos reais

`.github/workflows/ci.yml` define `NEXT_PUBLIC_SUPABASE_URL`,
`APP_ENCRYPTION_KEY`, etc. diretamente no workflow — são os mesmos
valores fictícios já usados em `.env.local` neste ambiente de
desenvolvimento (nunca chegam a um serviço real), necessários só para
`lib/env.ts` validar com sucesso durante `pnpm build`. Dois jobs
separados: `check` (lint + typecheck + testes unitários + build) e
`e2e` (instala o Chromium do Playwright, builda, corre os testes E2E),
para o feedback de lint/typecheck chegar mais depressa sem esperar
pela instalação do browser.

### 5. Testes E2E: cobertura real via simulação de rede, não mocks na aplicação

A secção 19 lista cenários que precisam de um administrador autenticado
(Google OAuth real) e de um projeto Supabase/Google de teste — fora do
alcance desta sessão (mesma limitação de rede das fases anteriores) e,
mais importante, fora do que deveria correr em CI de qualquer forma
("Não chamar APIs Google reais na suíte normal de CI"). Em vez de
construir um "modo mock" dentro da aplicação (proibido pela regra 5 da
secção 24 — nunca mocks permanentes em caminhos de produção),
`tests/e2e/guest-album-flow.spec.ts` usa `page.route()` do Playwright
para simular as respostas de `/api/albums/resolve` e
`/api/albums/[id]/photos` — a aplicação real, servida pelo build real,
sem qualquer código condicional de teste dentro do código de produção.
Cobre: abrir um link válido, ver o álbum, mostrar/esconder "Adicionar
fotografias" consoante a permissão, e a mensagem de link inválido.

Os cenários que precisam mesmo de sessão administrativa real (ligar o
Drive, criar álbum, moderar, tempo real entre dois browsers) ficam
documentados no checklist de produção como smoke tests manuais — a
mesma fronteira já estabelecida em todas as ADRs anteriores entre o que
corre em CI e o que precisa de infraestrutura real.

### 6. Verificação automática de acessibilidade encontrou um problema real

`@axe-core/playwright` (MIT) corre contra `/`, `/admin/login` e a
página de álbum simulada, com as tags `wcag2a`/`wcag2aa`. Encontrou uma
violação genuína: o aviso "Ligação em tempo real indisponível" (secção 11) e três textos semelhantes usavam `text-foreground/50` sobre o fundo
claro, dando um contraste de 3.33:1 — abaixo do mínimo de 4.5:1 exigido
pelo WCAG 2 AA para texto normal (secção 17). Corrigido para
`text-foreground/70` nesses quatro pontos
(`components/gallery/photo-grid.tsx`,
`components/admin/google-drive-integration.tsx`,
`components/upload/upload-queue.tsx`), confirmado pela mesma suite a
passar depois. Isto é exatamente o valor de automatizar esta
verificação: um problema real de acessibilidade que a revisão manual
por teclado (secção 23) não teria necessariamente apanhado, porque não
é sobre navegação, é sobre contraste de cor.

### 7. Validação do Dockerfile: parcial, por limitação de rede confirmada (não presumida)

O daemon Docker deste ambiente arranca e funciona (`dockerd` iniciado
manualmente, já que não há systemd), mas qualquer `docker pull`/`docker
build` falha a resolver `docker.io` — confirmado com um `docker pull
node:22-slim` de controlo, que falha exatamente da mesma forma que o
`docker build` do `Dockerfile` real. Não foi feita nenhuma tentativa de
contornar isto (mesma política já seguida nas fases anteriores para
hosts bloqueados).

Como compensação, validado o que era possível sem a rede:

- `.dockerignore` exclui corretamente `node_modules`, `.next`, `.git`,
  `.env*` (exceto `.env.example`) do contexto de build.
- `pnpm-workspace.yaml`, referenciado no `Dockerfile`, existe e é
  válido.
- Os binários nativos do `sharp` para `linux-x64`
  (`@img/sharp-linux-x64`, `@img/sharp-libvips-linux-x64`) resolvem
  corretamente neste ambiente (a mesma arquitetura do `node:22-slim`),
  confirmando que a resolução de dependências opcionais específicas da
  plataforma funciona sem precisar do script de post-install que o
  `pnpm-workspace.yaml` já ignora deliberadamente.
- O comando final do `Dockerfile` (`node server.js` a partir de
  `.next/standalone`, com `public`/`.next/static` copiados ao lado) foi
  reproduzido manualmente fora do Docker — build real, cópia manual dos
  mesmos diretórios que o `Dockerfile` copia, arranque com
  `node .next/standalone/server.js` — e funcionou corretamente
  (`/api/health`, páginas, cabeçalhos de segurança, tudo confirmado por
  `curl`/Playwright). Isto valida a parte mais importante do
  `Dockerfile` (o runtime), mesmo sem poder confirmar a imagem completa
  de ponta a ponta.

`docker build .` completo fica como o primeiro passo do checklist de
produção, para correr num ambiente com acesso de rede normal antes da
primeira implantação real.

## Limitações conhecidas

- CSP usa `'unsafe-inline'` para scripts (decisão 1) — mitiga menos
  classes de XSS do que uma CSP com nonce funcional teria; documentado
  como aceite, não ignorado.
- Sem confirmação end-to-end do `docker build` completo (decisão 7);
  só validado estaticamente e por reprodução manual do runtime.
- Testes E2E automáticos cobrem só os fluxos de convidado sem sessão
  administrativa real (decisão 5); login de administrador, ligação ao
  Drive, criação de álbum, moderação e tempo real entre dois browsers
  continuam a exigir verificação manual em staging (checklist de
  produção, secção 3).
- Rate limiting sem efeito real neste ambiente (sem Upstash
  configurado) — só a plumbing e o comportamento "desligado" foram
  testados; o comportamento com Redis real fica coberto pelo
  checklist de produção.
- Rotação de `APP_ENCRYPTION_KEY` em produção não tem automação (só o
  suporte a `token_key_version` no esquema) — documentado no checklist
  de produção como processo manual.
