# Checklist de produção

Critério de saída da Fase 7 (`CLAUDE.md`, secção 22): build reproduzível,
migrações aplicadas, segredos externos ao repositório e smoke tests
aprovados. Este documento é o guia operacional para chegar lá — segue-o
por ordem na primeira implantação; nas seguintes, salta diretamente para
"Antes de cada deploy".

## 1. Antes da primeira implantação

### Google Cloud

1. Criar um projeto Google Cloud (ou usar um existente).
2. Ativar a **Google Drive API**.
3. Configurar o ecrã de consentimento OAuth (tipo "Externo" se os
   administradores não forem todos do mesmo Workspace; "Interno" caso
   contrário).
4. Criar credenciais OAuth 2.0 do tipo "Aplicação Web":
   - **URI de redirecionamento autorizado**: `https://<domínio-de-produção>/api/google-drive/callback`.
   - Guardar `Client ID` e `Client Secret` — vão para
     `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET`.
5. Âmbito pedido: só `https://www.googleapis.com/auth/drive.file`
   (secção 6.2) — não pedir acesso mais amplo ao Drive.

### Supabase

1. Criar um projeto Supabase (produção — nunca reutilizar um projeto de
   desenvolvimento/staging).
2. Aplicar as migrações por ordem, com a CLI do Supabase ligada ao
   projeto:
   ```bash
   supabase link --project-ref <ref-do-projeto>
   supabase db push
   ```
   Confirmar que todas as migrações em `supabase/migrations/` (0001 a
   0005 nesta fase) foram aplicadas — em particular a 0005, que liga
   `photos` à publicação `supabase_realtime`; sem ela, o tempo real
   (secção 11) fica silenciosamente inativo.
3. Ativar o fornecedor **Google** em Authentication → Sign In / Providers,
   para o login administrativo (secção 6.1) — distinto do OAuth do Drive.
4. Na mesma página (Authentication → Sign In / Providers), ativar
   **Allow anonymous sign-ins** (secção 6.3) — necessário para os
   convidados. Não é um fornecedor OAuth com Client ID/Secret; é um
   interruptor simples, normalmente junto ao topo da página, antes ou
   separado da lista de fornecedores de terceiros (Google, GitHub, etc.).
5. Confirmar que o bucket `photo-previews` existe e continua privado
   (`public: false`) — criado pela migração 0004.
6. Copiar `Project URL`, `anon public key` e `service_role key` — vão
   para `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e
   `SUPABASE_SERVICE_ROLE_KEY`.

### Segredos e configuração (nunca no repositório)

Gerar/reunir e guardar num gestor de segredos (Google Secret Manager,
recomendado para o Cloud Run — nunca em ficheiros `.env` commitados):

| Variável | Como gerar |
|---|---|
| `APP_ENCRYPTION_KEY` | 32 bytes aleatórios, ex.: `openssl rand -hex 32` (usar só os primeiros 32 carateres se precisar de string, mas confirmar `>= 32 bytes`) |
| `APP_TOKEN_PEPPER` | `openssl rand -hex 32` |
| `SUPABASE_SERVICE_ROLE_KEY` | Painel do Supabase |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google Cloud Console |
| `ADMIN_EMAILS` | Lista separada por vírgulas dos primeiros administradores (secção 6.1) — só necessário até o primeiro admin ter `profiles.role = 'admin'` |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Opcionais, mas fortemente recomendados em produção — sem eles, o rate limiting (secção 15, `lib/security/rate-limit.ts`) fica desligado |
| `SENTRY_DSN` | Opcional (secção 18) |

Nunca reutilizar `APP_ENCRYPTION_KEY`/`APP_TOKEN_PEPPER` entre
desenvolvimento e produção. Rodar `APP_ENCRYPTION_KEY` implica
descuidadamente invalidar todas as ligações Google Drive encriptadas
com a versão antiga — o esquema já suporta `token_key_version` para uma
rotação faseada (secção 15), mas isso ainda não tem automação; por agora,
uma rotação exige reconectar manualmente os administradores afetados.

### Domínio e HTTPS

- Confirmar o domínio de produção antes de gerar `GOOGLE_OAUTH_REDIRECT_URI`
  (tem de coincidir exatamente com o registado na Google Cloud Console).
- Cloud Run fornece TLS automaticamente; `Strict-Transport-Security`
  (secção 15, `lib/security/csp.ts`) já está sempre presente nas
  respostas.

## 2. Build e implantação (Cloud Run)

O `Dockerfile` já está preparado (`output: standalone`, utilizador não-root,
imagem final `node:22-slim`).

```bash
# A partir da raiz do repositório:
gcloud builds submit --tag <região>-docker.pkg.dev/<projeto>/<repo>/livegallery:<tag>

gcloud run deploy livegallery \
  --image <região>-docker.pkg.dev/<projeto>/<repo>/livegallery:<tag> \
  --region <região> \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars NEXT_PUBLIC_APP_URL=https://<domínio>,NEXT_PUBLIC_SUPABASE_URL=...,... \
  --set-secrets SUPABASE_SERVICE_ROLE_KEY=supabase-service-role:latest,APP_ENCRYPTION_KEY=app-encryption-key:latest,APP_TOKEN_PEPPER=app-token-pepper:latest,GOOGLE_OAUTH_CLIENT_SECRET=google-oauth-secret:latest
```

Notas:

- `--set-secrets` referencia segredos já criados no Secret Manager —
  nunca passar valores sensíveis diretamente em `--set-env-vars`.
- O build reproduzível vem do `pnpm-lock.yaml` commitado
  (`pnpm install --frozen-lockfile` no `Dockerfile`) — nunca fazer
  deploy sem o lockfile atualizado e commitado.
- Este ambiente de desenvolvimento não tem acesso de rede ao Google
  Artifact Registry/Cloud Build, por isso o `docker build` local nunca
  foi executado até ao fim nesta sessão (só validado estaticamente e
  por reprodução manual do `output: standalone` — ver
  `docs/decisions/0008-fase-7-hardening-deploy.md`). Correr
  `docker build .` localmente, com acesso de rede normal, antes da
  primeira implantação real.

## 3. Smoke tests pós-deploy

Correr manualmente (ou com um script) depois de cada deploy:

1. `GET /api/health` devolve `200` com `{"data":{"status":"ok",...}}`.
2. A página inicial (`/`) carrega sem erros de consola.
3. `/admin/login` mostra o botão "Entrar com Google" e não rebenta.
4. Iniciar sessão como administrador real, confirmar redireção para
   `/admin`.
5. Ligar o Google Drive (`/admin/settings/integrations`) com uma conta
   de teste — confirmar que a pasta raiz "LiveGallery" aparece no Drive
   dessa conta.
6. Criar um álbum, gerar um link, abri-lo numa janela anónima —
   confirmar que a galeria carrega.
7. Enviar uma fotografia através do link — confirmar que aparece na
   galeria (idealmente em dois browsers, para validar o tempo real da
   secção 11) e que o ficheiro original chega à pasta do álbum no Drive.
8. Aprovar/ocultar/eliminar essa fotografia como administrador.
9. Revogar o link e confirmar que deixa de abrir.
10. Verificar os cabeçalhos de segurança numa resposta real:
    ```bash
    curl -sI https://<domínio>/ | grep -i "content-security-policy\|strict-transport"
    ```

Estes passos cobrem os cenários E2E da secção 19 que exigem um projeto
Supabase/Google real e por isso não correm em CI (ver
`docs/decisions/0008`) — fazem parte deste checklist manual em vez de
uma suite automática.

## 4. Antes de cada deploy (implantações seguintes)

- [ ] `pnpm check` e `pnpm build` passam localmente/em CI.
- [ ] Migrações novas em `supabase/migrations/` aplicadas com
      `supabase db push` **antes** de o novo código (que pode depender
      delas) ficar ativo.
- [ ] Nenhum segredo novo ficou só em `.env.local` — confirmar que está
      também no gestor de segredos de produção.
- [ ] `docs/implementation-status.md` e a ADR da fase atualizados.
- [ ] Smoke tests da secção 3 repetidos depois do deploy.

## 5. Rollback

- Cloud Run mantém revisões anteriores por omissão — reverter é
  `gcloud run services update-traffic livegallery --to-revisions=<revisão-anterior>=100`.
- Migrações do Supabase **não** têm rollback automático — escrever
  sempre a migração seguinte de forma aditiva (nunca destrutiva sem uma
  estratégia explícita, regra 11 da secção 24) para que reverter o
  código da aplicação não deixe o esquema incompatível.
- Se uma migração já aplicada precisar de ser desfeita, escrever uma
  nova migração que reverte a anterior — nunca editar uma migração já
  aplicada em produção.
