# 0004 — Fase 3: Google Drive

Data: 2026-08-01

## Contexto

A Fase 3 pede OAuth separado para o Drive, armazenamento encriptado do
refresh token, criação de pasta raiz e subpastas, verificação/reconexão,
e um adaptador falso para testes (secção 22). Este documento regista as
decisões tomadas, um problema real de dependências encontrado (e
corrigido), e as duas divergências face à interface `DriveStorageProvider`
sugerida no `CLAUDE.md`.

## Decisões

### 1. OAuth 2.0 Authorization Code Flow com PKCE, isolado do login administrativo

`lib/google-drive/oauth-client.ts` implementa o fluxo da secção 6.2:
`state` anti-CSRF (`randomUUID()`), PKCE S256
(`client.generateCodeVerifierAsync()`), `access_type=offline` para obter
refresh token, e `prompt=consent` só quando `forceConsent` é pedido
explicitamente (reconexão). O `state` e o `code_verifier` viajam em dois
cookies `HttpOnly`/`Secure` (produção)/`SameSite=Lax`, com 10 minutos de
validade (`lib/google-drive/oauth-cookies.ts`), lidos e apagados no
callback antes de qualquer troca de código.

Este OAuth é completamente separado do login administrativo (Supabase
Auth com Google, Fase 1) — ligar o Drive é uma ação explícita
("Ligar Google Drive" em `/admin/settings/integrations`), nunca inferida
a partir da sessão de administrador, conforme a secção 6.1.

### 2. `redirect()` fora de try/catch, replicando o padrão da Fase 2

`GET /api/google-drive/connect` chama `requireAdmin()` e, no fim,
`redirect(url)` — ambos fora de qualquer `try/catch`, pelo mesmo motivo já
documentado na Fase 2 (decisão 4 da ADR 0003): `redirect()` lança um
sinal que um `catch` genérico apanharia como erro. Só a chamada a
`completeGoogleDriveConnection()` dentro do callback está envolvida em
`try/catch` (não chama `redirect()`), para poder mostrar
`?error=google_drive_connect_failed` em vez de uma página de erro genérica.

### 3. Upsert de uma linha por utilizador em `google_connections`

`completeGoogleDriveConnection()` procura a ligação mais recente do
utilizador (`findLatestByUser`) e atualiza-a se existir, em vez de inserir
sempre uma linha nova. Reconectar (`prompt=consent` de novo) atualiza a
mesma linha; desligar (`disconnectGoogleDriveConnection`) marca
`status: "revoked"` sem apagar a linha, para preservar a referência de
`albums.google_connection_id` e o histórico em `audit_logs`.

### 4. `createAlbumFolder` precisa do `albumId` antes de o álbum existir — o id é pré-gerado

A interface sugerida na secção 12 pede `createAlbumFolder(input: {
parentFolderId, albumId, title })`, mas o álbum só existe na base de
dados depois de `createAlbum()` correr. `server/use-cases/albums.ts` (nova
função `createAlbumWithDriveFolder`) resolve isto pré-gerando o `id` do
álbum com `randomUUID()`, criando a pasta no Drive primeiro (com esse id
já em `appProperties.liveGalleryAlbumId`), e só depois inserindo a linha
do álbum com esse mesmo id. `CreateAlbumParams.id` é opcional
precisamente para este caso — `createAlbum()` sozinho (usado nos testes
da Fase 2) continua a deixar o Postgres gerar o id.

Isto evita o cenário inverso (álbum criado sem pasta associada, por falha
a meio): se a chamada ao Drive falhar, nada é escrito na base de dados.

### 5. `POST /api/albums` deixa de recusar com 501 — a Fase 2 previu exatamente este ponto

A ADR 0003 (decisão 2) já tinha isolado onde entraria esta integração.
`app/api/albums/route.ts` troca o `GOOGLE_DRIVE_INTEGRATION_PENDING` (501)
por uma chamada real a `createAlbumWithDriveFolder()`, que continua a
devolver `GOOGLE_DRIVE_NOT_CONNECTED` (409) se não houver ligação ativa, e
passa a devolver `GOOGLE_DRIVE_NOT_READY` (409) no raro caso de a ligação
existir mas ainda não ter `root_folder_id` (nunca deveria acontecer em
condições normais, já que `completeGoogleDriveConnection` só termina com
sucesso depois de `ensureRootFolder` correr — mas é mais seguro verificar
do que assumir).

### 6. Nunca devolver o refresh token (nem os campos de encriptação) ao browser

A secção 5.4/15 proíbe devolver tokens Google ao cliente. Os endpoints que
devolvem uma ligação (`/api/google-drive/status`, `/api/google-drive/verify`)
usam um mapeador novo, `lib/google-drive/public-connection.ts#toPublicGoogleConnection()`,
que expõe só `id`, `googleAccountEmail`, `status`, `rootFolderId`,
`lastVerifiedAt` e `createdAt` — nunca `encrypted_refresh_token` nem
`token_key_version`. `GET /api/google-drive/status` é um endpoint novo,
fora da lista "principal" da secção 14 (tal como `/verify`, já
justificado): dá à UI de administração o estado atual sem bater no
Google a cada carregamento de página, lendo só o que já está gravado.

### 7. Retry desligado explicitamente nas operações não idempotentes

`google-auth-library` já faz retry com backoff exponencial por omissão
(`AuthClient.RETRY_CONFIG`, confirmado nos `.d.ts` do pacote instalado —
ver limitação sobre acesso à documentação oficial, abaixo). Isso cobre a
secção 12 ("retries com backoff exponencial para erros transitórios") sem
código adicional. Mas para `files.create` (criação de pasta raiz, pasta de
álbum, upload de original) — todas não idempotentes — o retry automático
é desligado explicitamente com `{ retry: false }`, para nunca duplicar um
recurso por causa de uma resposta perdida numa chamada que já teve
efeito no servidor. A idempotência fica a cargo da aplicação:
`ensureRootFolder` pesquisa por `appProperties` antes de criar
(`liveGalleryRoot=true`), e `deleteFile` trata "ficheiro não encontrado"
como sucesso.

### 8. Duas divergências documentadas face à interface sugerida na secção 12

- `getOriginalStream(): Promise<ReadableStream>` → implementado como
  `Promise<NodeJS.ReadableStream>`. A Drive API v3 do Node
  (`drive.files.get({ responseType: "stream" })`) devolve um stream Node,
  não um Web `ReadableStream`; converter agora, antes de existir qualquer
  consumidor real (Fase 4, `/api/media/[photoId]/original`), seria
  especulativo.
- `verifyConnection(input: { connectionId: string })` → implementado sem
  parâmetros, porque o `authClient` passado ao construir o provider já
  identifica a ligação (`createAuthenticatedClient(refreshToken)`); pedir
  também um `connectionId` seria um dado redundante que a função nem usa.

### 9. Adaptador falso para testes (secção 19/22)

`tests/unit/fakes/drive-provider.ts` implementa `DriveStorageProvider`
em memória (sem tocar na rede), na mesma linha dos repositórios falsos da
Fase 2. Todos os casos de uso que dependem do Drive
(`completeGoogleDriveConnection`, `verifyGoogleDriveConnection`,
`createAlbumWithDriveFolder`) recebem um `driveProviderFactory` opcional,
por omissão `createDriveStorageProvider` (o adaptador real) — o mesmo
padrão de injeção de dependências já estabelecido para os repositórios.
`exchangeAuthorizationCode()` (a única chamada que precisa mesmo de um
servidor Google) é mockada ao nível do módulo só no teste de
`completeGoogleDriveConnection`, com `vi.mock` + `importOriginal`, para
poder testar a orquestração completa (upsert da linha, encriptação,
criação da pasta raiz) sem bater na rede — nenhum outro ficheiro de teste
precisou deste padrão até agora.

### 10. Conflito de versões do `google-auth-library` — problema real de dependências, corrigido com `pnpm.overrides`

Depois de escrever `lib/google-drive/{oauth-client,drive-provider}.ts`,
`pnpm typecheck` falhava com "Types have separate declarations of a
private property 'redirectUri'" ao passar um `Auth.OAuth2Client` (criado
em `oauth-client.ts`) para `createDriveStorageProvider()`. Isolado com
`pnpm why google-auth-library`: o pacote `googleapis@173.0.0` depende
diretamente de `google-auth-library@10.9.1`, mas também de
`googleapis-common@8.0.3`, que por sua vez fixa
`google-auth-library@^10.2.0` e resolvia para `10.5.0` — duas versões
distintas do mesmo pacote no `node_modules`, logo dois tipos
estruturalmente iguais mas nominalmente diferentes para a mesma classe.
Isto é uma inconsistência interna do próprio `googleapis@173.0.0`, não do
código desta aplicação.

Corrigido com `pnpm.overrides` em `package.json`
(`"google-auth-library": "10.9.1"`), forçando as duas dependências a
partilhar a mesma instância. Confirmado com `pnpm why google-auth-library`
("Found 1 version") depois de um `pnpm install` limpo (foi necessário
apagar `node_modules` e `tsconfig.tsbuildinfo` — o cache incremental do
`tsc` continuava a referenciar o caminho da versão antiga mesmo depois do
`node_modules` já estar correto).

## Limitação de ambiente: sem acesso à documentação oficial

O acesso a `developers.google.com` (e a qualquer host externo) está
bloqueado pela política de rede desta sessão — confirmado com um teste de
controlo contra `https://example.com`, também bloqueado. Não foi feita
nenhuma tentativa de contornar o bloqueio. Em substituição, a superfície
da API (`OAuth2Client`, `Resource$Files`, `Schema$File`, `Schema$User`,
`AuthClient.RETRY_CONFIG`) foi confirmada lendo os `.d.ts` do pacote
`googleapis`/`google-auth-library` já instalado — a fonte mais próxima de
autoritativa disponível neste ambiente.

## Limitações conhecidas

- Sem Docker neste ambiente (mesma limitação das Fases 1 e 2): nenhum
  teste correu contra um projeto Google Cloud/Drive real nem contra um
  Supabase real. A orquestração está testada com repositórios e
  adaptador Drive falsos; a integração real só pode ser verificada
  manualmente em staging, com credenciais OAuth reais (fora do âmbito
  desta sessão).
- Upload de originais (`uploadOriginal`) e leitura (`getOriginalStream`)
  estão implementados no adaptador mas não têm ainda nenhum consumidor —
  ficam para a Fase 4 (Upload e processamento), que também é onde entra o
  upload retomável mencionado na secção 12.
- Sem página de saúde da integração agregando várias contas
  (`/admin/settings/integrations` mostra sempre a ligação mais recente de
  um único administrador) — o esquema já só previa uma ligação Google por
  `profiles.id`, por isso não é uma lacuna face ao MVP, só uma
  simplificação a rever se a Fase 6 vier a exigir multi-conta.
