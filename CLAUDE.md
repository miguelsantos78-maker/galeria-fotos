# CLAUDE.md — LiveGallery

## 1. Missão do projeto

Construir uma aplicação web responsiva para criação, partilha, envio e visualização de galerias de fotografias em tempo real, inspirada na experiência de um álbum partilhado do Google Fotos.

A aplicação deve permitir que um administrador crie álbuns para eventos, partilhe um link com convidados, receba fotografias enviadas por telemóvel ou computador e faça aparecer as novas imagens quase instantaneamente em todos os dispositivos que estejam a visualizar o álbum.

Os ficheiros originais devem ser armazenados numa conta Google Drive ligada pelo administrador. O Supabase deve guardar metadados, gerir autenticação e sessões, disponibilizar uma base de dados PostgreSQL e propagar alterações em tempo real.

Nome de trabalho: `LiveGallery`.

Idioma principal da interface: português de Portugal (`pt-PT`).

Não copiar código, recursos visuais, marcas ou componentes proprietários do Google Fotos. Reproduzir apenas padrões gerais de utilização: grelha de fotografias, lightbox, álbum partilhado, upload simples, apresentação e atualização em tempo real.

---

## 2. Objetivos do MVP

O MVP fica concluído quando for possível:

1. Um administrador autenticar-se e ligar uma conta Google Drive.
2. A aplicação criar uma pasta raiz própria no Drive e uma subpasta por álbum.
3. O administrador criar, editar, publicar, arquivar e eliminar um álbum.
4. O administrador gerar um link não listado para visualização e upload.
5. Um convidado abrir o link num telemóvel sem criar conta.
6. O convidado enviar uma ou várias fotografias e acompanhar o progresso.
7. Os originais serem enviados para a pasta correta no Google Drive.
8. Os metadados e previews serem registados no Supabase.
9. As novas imagens aparecerem em tempo real nos restantes dispositivos.
10. A galeria ter grelha responsiva, lightbox, navegação por teclado/toque e modo apresentação.
11. O administrador conseguir aprovar, ocultar, destacar, transferir e eliminar fotografias.
12. Existirem testes automatizados, migrações, documentação de instalação e um `Dockerfile` funcional.

Não incluir vídeo no MVP.

---

## 3. Princípios obrigatórios de implementação

- Trabalhar incrementalmente e manter sempre o projeto executável.
- Usar TypeScript em modo estrito.
- Não guardar segredos no repositório.
- Não expor tokens Google, `SUPABASE_SERVICE_ROLE_KEY` ou chaves de encriptação ao browser.
- Usar validação de dados em todas as fronteiras do sistema.
- Não confiar no nome, extensão ou MIME enviado pelo cliente; validar também os bytes do ficheiro.
- Não tornar os ficheiros do Google Drive públicos por defeito.
- Usar o Google Drive para os originais e o Supabase Storage apenas para previews/miniaturas derivadas.
- Manter a base de dados como catálogo e fonte de estado da galeria; não listar o Drive em cada carregamento de página.
- Depois de cada mudança relevante, executar lint, typecheck e os testes afetados.
- Não introduzir uma dependência sem justificar a necessidade e verificar manutenção, licença e compatibilidade.
- Preferir código simples, explícito e testável a abstrações prematuras.
- Quando houver uma decisão ambígua, escolher a opção mais segura e documentá-la em `docs/decisions/`.

---

## 4. Stack técnica

Usar versões estáveis e compatíveis no momento da criação do projeto. Fixar as versões no lockfile.

### Aplicação

- Next.js com App Router e Route Handlers
- React
- TypeScript com `strict: true`
- pnpm
- Tailwind CSS
- shadcn/ui para componentes base acessíveis
- Lucide para ícones
- Zod para validação
- React Hook Form para formulários complexos
- TanStack Query para estado remoto, invalidação e refetch
- Supabase JS
- Biblioteca oficial `googleapis`
- `sharp` para previews, rotação pela orientação EXIF e remoção de metadados dos derivados
- `file-type` para validação por assinatura binária
- `jose` quando forem necessários tokens assinados da própria aplicação
- Vitest e Testing Library
- Playwright para testes end-to-end

### Serviços

- Supabase PostgreSQL
- Supabase Auth
- Supabase Realtime
- Supabase Storage, bucket privado `photo-previews`
- Google Drive API v3
- Google OAuth 2.0 Web Server Flow para a ligação ao Drive

### Deploy recomendado

- Aplicação Next.js em Google Cloud Run através de Docker.
- Supabase gerido.
- Google Cloud Console para OAuth e Drive API.

A aplicação deve continuar portátil e poder ser executada localmente com `pnpm dev`.

---

## 5. Arquitetura funcional

### 5.1 Fonte de verdade

- Google Drive: ficheiros originais.
- Supabase PostgreSQL: álbuns, fotografias, permissões, estados, sessões, auditoria e referências aos ficheiros no Drive.
- Supabase Storage: previews WebP/JPEG derivados e, opcionalmente, placeholders de baixa resolução.
- Supabase Realtime: publicação de alterações da tabela `photos` para clientes autorizados.

### 5.2 Fluxo de upload

1. O visitante abre um link de álbum com um token de partilha não adivinhável.
2. O browser cria ou reutiliza uma sessão anónima do Supabase.
3. O backend valida o token do álbum e cria uma `album_session` com expiração e permissões.
4. O utilizador seleciona uma ou várias imagens.
5. O browser valida quantidade, tamanho e tipo suportado antes do envio.
6. O backend volta a validar autorização, tamanho, MIME e assinatura binária.
7. O backend envia o original para a subpasta do álbum no Google Drive.
8. O backend cria um preview otimizado, sem metadados EXIF sensíveis, e envia-o para o bucket privado do Supabase Storage.
9. O backend cria ou atualiza o registo `photos` com estado `ready`.
10. O Supabase Realtime notifica os clientes subscritos ao álbum.
11. Os clientes inserem a nova fotografia na grelha sem recarregar a página completa.

Para ficheiros acima de 5 MB, estruturar o código para usar upload retomável do Google Drive. Isolar esta lógica numa interface `DriveStorageProvider`, para permitir evolução do transporte sem alterar a camada de domínio.

### 5.3 Estado da fotografia

Estados permitidos:

- `queued`
- `uploading`
- `processing`
- `pending_review`
- `ready`
- `hidden`
- `failed`
- `deleted`

Se o álbum tiver moderação desligada, uma fotografia processada passa diretamente para `ready`. Se a moderação estiver ligada, passa para `pending_review`.

### 5.4 Visualização de ficheiros

- A grelha usa previews privados do Supabase Storage através de URLs assinados e de curta duração.
- A abertura do original usa um endpoint autenticado da aplicação, por exemplo `/api/media/[photoId]/original`.
- O endpoint valida o acesso ao álbum antes de obter e transmitir o ficheiro do Google Drive.
- Nunca devolver o refresh token, access token ou URL interna de upload do Google ao cliente.
- Aplicar headers de cache adequados sem permitir acesso a um álbum depois de expirar ou revogar a sessão.

---

## 6. Modelo de autenticação e autorização

### 6.1 Administradores

- Usar Supabase Auth com Google para login administrativo.
- Restringir a área administrativa a emails autorizados ou a utilizadores com `profiles.role = 'admin'`.
- Não assumir que o login Google administrativo concede acesso ao Drive.
- Implementar uma ação separada “Ligar Google Drive”, com OAuth específico e consentimento explícito.

### 6.2 Ligação ao Google Drive

Implementar o OAuth 2.0 Authorization Code Flow no servidor:

- Usar `state` anti-CSRF.
- Usar PKCE quando suportado pela biblioteca/fluxo escolhido.
- Pedir acesso offline para obter refresh token.
- Usar `prompt=consent` apenas quando necessário para a primeira ligação ou reconexão.
- Pedir o âmbito mínimo `https://www.googleapis.com/auth/drive.file`.
- Não pedir acesso completo ao Drive no MVP.
- Encriptar o refresh token antes de o guardar.
- Nunca registar tokens em logs.
- Permitir desligar/revogar a ligação.

Com `drive.file`, a aplicação deve criar e gerir a sua própria pasta raiz. Não depender de acesso livre a uma pasta arbitrária já existente. Uma futura integração com Google Picker pode permitir selecionar explicitamente uma pasta.

### 6.3 Visitantes e convidados

- Ativar anonymous sign-in no Supabase.
- O link partilhado contém um token aleatório com entropia suficiente; guardar apenas o hash do token na base de dados.
- O backend troca o token válido por uma linha temporária em `album_sessions` associada ao `auth.uid()` anónimo.
- `album_sessions` deve conter permissões `view`, `upload` ou `moderate` e uma data de expiração.
- Álbuns podem ter PIN opcional. Guardar apenas o hash do PIN com algoritmo adequado.
- Revogar o link deve invalidar novas sessões e, se configurado, as sessões existentes.

---

## 7. Esquema de dados

Criar migrações SQL versionadas em `supabase/migrations/`.

### `profiles`

- `id uuid primary key references auth.users`
- `email text`
- `display_name text`
- `avatar_url text`
- `role text check in ('admin','editor')`
- `created_at timestamptz`
- `updated_at timestamptz`

### `google_connections`

- `id uuid primary key`
- `user_id uuid references profiles(id)`
- `google_account_email text`
- `encrypted_refresh_token text`
- `token_key_version integer`
- `scope text[]`
- `root_folder_id text`
- `status text check in ('active','revoked','error')`
- `last_verified_at timestamptz`
- `created_at timestamptz`
- `updated_at timestamptz`

Nunca guardar access tokens persistentes; gerar/renovar quando necessário.

### `albums`

- `id uuid primary key`
- `owner_id uuid references profiles(id)`
- `google_connection_id uuid references google_connections(id)`
- `title text`
- `description text`
- `slug text unique`
- `cover_photo_id uuid null`
- `drive_folder_id text`
- `visibility text check in ('private','unlisted','public')`
- `upload_enabled boolean`
- `moderation_enabled boolean`
- `download_enabled boolean`
- `event_start_at timestamptz null`
- `event_end_at timestamptz null`
- `status text check in ('draft','published','archived')`
- `created_at timestamptz`
- `updated_at timestamptz`

### `album_share_links`

- `id uuid primary key`
- `album_id uuid references albums(id)`
- `token_hash text unique`
- `pin_hash text null`
- `permissions text[]`
- `expires_at timestamptz null`
- `revoked_at timestamptz null`
- `created_by uuid references profiles(id)`
- `created_at timestamptz`

### `album_sessions`

- `id uuid primary key`
- `album_id uuid references albums(id)`
- `user_id uuid references auth.users(id)`
- `share_link_id uuid references album_share_links(id)`
- `permissions text[]`
- `expires_at timestamptz`
- `created_at timestamptz`

Criar índice em `(user_id, album_id, expires_at)`.

### `photos`

- `id uuid primary key`
- `album_id uuid references albums(id)`
- `uploaded_by uuid references auth.users(id) null`
- `drive_file_id text unique`
- `drive_folder_id text`
- `preview_path text null`
- `original_filename text`
- `safe_filename text`
- `mime_type text`
- `file_size bigint`
- `width integer null`
- `height integer null`
- `sha256 text null`
- `blurhash text null`
- `captured_at timestamptz null`
- `uploaded_at timestamptz`
- `status text`
- `moderation_note text null`
- `is_featured boolean default false`
- `sort_order bigint`
- `error_code text null`
- `error_message text null`
- `deleted_at timestamptz null`

Criar índices em:

- `(album_id, status, sort_order desc)`
- `(album_id, captured_at desc)`
- `(album_id, sha256)`

### `upload_jobs`

- `id uuid primary key`
- `album_id uuid`
- `user_id uuid`
- `client_upload_id text`
- `filename text`
- `expected_size bigint`
- `received_size bigint`
- `status text`
- `drive_session_uri_encrypted text null`
- `expires_at timestamptz`
- `created_at timestamptz`
- `updated_at timestamptz`

### `audit_logs`

- `id bigint generated always as identity primary key`
- `actor_user_id uuid null`
- `album_id uuid null`
- `photo_id uuid null`
- `action text`
- `metadata jsonb`
- `created_at timestamptz`

Não guardar segredos ou conteúdo binário em `audit_logs`.

---

## 8. Row Level Security

Ativar RLS em todas as tabelas expostas ao cliente.

Políticas mínimas:

- Administradores podem ler/escrever recursos que gerem.
- Um utilizador anónimo pode ler um álbum e fotografias apenas quando existe uma `album_session` válida para o seu `auth.uid()` e para o respetivo `album_id`.
- Um utilizador anónimo não pode inserir diretamente em `photos`, `albums`, `google_connections` ou `audit_logs`.
- Uploads e ações de moderação passam por Route Handlers do servidor.
- O bucket `photo-previews` é privado.
- O cliente nunca recebe a service role key.

Criar testes SQL ou testes de integração que provem:

1. Um visitante não consegue enumerar outros álbuns.
2. Uma sessão expirada perde acesso.
3. Um token revogado não cria nova sessão.
4. Um utilizador de um álbum não consegue ler fotografias de outro álbum.
5. Um utilizador anónimo não consegue editar metadados.

---

## 9. Estrutura de pastas do projeto

Usar uma organização semelhante a:

```text
app/
  (public)/
    a/[slug]/page.tsx
    a/[slug]/upload/page.tsx
  (admin)/
    admin/page.tsx
    admin/albums/page.tsx
    admin/albums/[albumId]/page.tsx
    admin/settings/integrations/page.tsx
  api/
    albums/resolve/route.ts
    albums/[albumId]/photos/route.ts
    albums/[albumId]/uploads/route.ts
    photos/[photoId]/route.ts
    media/[photoId]/original/route.ts
    google-drive/connect/route.ts
    google-drive/callback/route.ts
    google-drive/disconnect/route.ts
components/
  gallery/
  upload/
  admin/
  ui/
lib/
  auth/
  db/
  google-drive/
  media/
  realtime/
  security/
  validation/
  env.ts
server/
  services/
  repositories/
  use-cases/
supabase/
  migrations/
  seed.sql
tests/
  unit/
  integration/
  e2e/
docs/
  decisions/
  operations/
```

Separar:

- componentes visuais;
- casos de uso;
- acesso à base de dados;
- integração Google;
- processamento de imagem;
- validação e autorização.

Route Handlers devem ser finos: validar pedido, chamar um caso de uso e converter o resultado numa resposta HTTP.

---

## 10. Páginas e experiência de utilização

### 10.1 Galeria pública `/a/[slug]`

Elementos:

- cabeçalho com título, descrição, data e fotografia de capa;
- botão “Adicionar fotografias” quando permitido;
- botão “Apresentação”;
- botão “Transferir” quando permitido;
- grelha masonry responsiva;
- carregamento progressivo e paginação por cursor;
- placeholders para evitar saltos de layout;
- indicador discreto quando entram novas fotografias;
- estado vazio com chamada para upload;
- tratamento elegante de álbum inexistente, expirado, privado ou arquivado.

### 10.2 Lightbox

- imagem ajustada ao ecrã;
- anterior/seguinte;
- swipe no telemóvel;
- setas no teclado;
- tecla Escape para fechar;
- informação opcional: autor, data, nome do ficheiro;
- ações permitidas: transferir, partilhar link interno, destacar ou eliminar para administradores;
- foco preso no modal e atributos ARIA corretos.

### 10.3 Upload

- seleção pelo explorador;
- drag and drop no desktop;
- captura pela câmara no telemóvel quando suportado;
- múltiplos ficheiros;
- preview local;
- progresso por ficheiro;
- cancelar e repetir;
- mensagens de erro claras por ficheiro;
- limite configurável por ficheiro, inicialmente 25 MB;
- aceitar inicialmente JPEG, PNG e WebP;
- explicar que HEIC será suportado numa fase posterior, salvo se for implementada conversão fiável no browser/servidor.

### 10.4 Administração

- dashboard com número de álbuns, fotografias, uploads recentes e erros;
- criação e edição de álbum;
- ativar/desativar upload;
- ativar moderação;
- criar, revogar e copiar links;
- definir PIN e expiração;
- aprovar/rejeitar fotografias em lote;
- ordenar por data de captura ou upload;
- definir capa e fotografias em destaque;
- eliminar fotografia do Drive, preview e base de dados;
- estado da ligação ao Google Drive;
- botão de reconexão quando o refresh token for revogado.

---

## 11. Tempo real

Usar Supabase Realtime com `Postgres Changes` na tabela `photos`.

Regras:

- Subscrever apenas depois de existir uma sessão de álbum válida.
- Filtrar por `album_id`.
- Escutar `INSERT`, `UPDATE` e `DELETE`.
- Só mostrar fotografias em estados visíveis para o utilizador atual.
- Ao receber um evento, invalidar/refazer a query relevante em vez de confiar cegamente no payload.
- Remover a subscrição ao desmontar o componente ou mudar de álbum.
- Lidar com perda de ligação e reconexão.
- Mostrar um pequeno aviso quando a aplicação estiver offline.
- Manter fallback de refetch periódico com intervalo moderado quando o canal realtime não estiver disponível.

Objetivo de experiência: uma nova fotografia deve aparecer normalmente nos outros dispositivos em menos de 3 segundos depois de concluído o processamento.

---

## 12. Integração Google Drive

Criar um módulo isolado em `lib/google-drive/`.

Interface sugerida:

```ts
export interface DriveStorageProvider {
  ensureRootFolder(input: { connectionId: string }): Promise<{ folderId: string }>;
  createAlbumFolder(input: { parentFolderId: string; albumId: string; title: string }): Promise<{ folderId: string }>;
  uploadOriginal(input: UploadOriginalInput): Promise<DriveFileResult>;
  getOriginalStream(input: { fileId: string }): Promise<ReadableStream>;
  deleteFile(input: { fileId: string }): Promise<void>;
  verifyConnection(input: { connectionId: string }): Promise<ConnectionHealth>;
}
```

Requisitos:

- Usar Drive API v3.
- Usar bibliotecas oficiais Google.
- Criar a pasta raiz da aplicação se ainda não existir.
- Guardar o ID da pasta, nunca depender apenas do nome.
- Criar uma subpasta por álbum.
- Definir `appProperties` nos ficheiros, incluindo `liveGalleryPhotoId` e `liveGalleryAlbumId`.
- Pedir apenas os campos necessários nas respostas da API.
- Fazer retries com backoff exponencial para erros transitórios e limites de quota.
- Não repetir automaticamente operações não idempotentes sem uma estratégia contra duplicados.
- Calcular hash antes ou durante o envio quando praticável.
- Usar nomes seguros e preservar o nome original apenas como metadado.
- Não alterar permissões do ficheiro para `anyoneWithLink` no MVP.
- Ao apagar uma fotografia, tratar o caso em que o ficheiro já não existe no Drive.

### Uploads retomáveis

A documentação do Google recomenda uploads retomáveis para ficheiros grandes e cenários com risco de interrupção. Implementar uma estratégia que:

- crie uma sessão de upload;
- acompanhe bytes enviados;
- permita retomar quando possível;
- expire e limpe sessões antigas;
- não exponha credenciais Google;
- mantenha a UI informada do progresso.

Se a primeira versão técnica usar streaming simples, manter a abstração e abrir uma tarefa explícita para completar o modo retomável antes de aceitar ficheiros grandes em produção.

---

## 13. Processamento de imagem

Para cada original:

1. Validar a assinatura binária.
2. Ler dimensões e orientação.
3. Rejeitar imagens corrompidas ou com dimensões perigosamente grandes.
4. Criar preview com lado máximo configurável, inicialmente 1600 px.
5. Criar thumbnail com lado máximo configurável, inicialmente 480 px.
6. Converter derivados para WebP com qualidade equilibrada.
7. Aplicar rotação EXIF.
8. Remover EXIF dos derivados, incluindo GPS.
9. Calcular `sha256` do original para deteção de duplicados.
10. Gerar `blurhash` ou placeholder equivalente.
11. Guardar previews em caminhos determinísticos, por exemplo `albums/{albumId}/{photoId}/preview.webp`.

O original no Drive deve ser preservado sem recompressão por defeito.

Implementar limites para prevenir decompression bombs.

---

## 14. API interna

Todas as respostas JSON devem seguir um formato consistente.

Sucesso:

```json
{
  "data": {},
  "error": null
}
```

Erro:

```json
{
  "data": null,
  "error": {
    "code": "UPLOAD_FILE_TOO_LARGE",
    "message": "O ficheiro excede o limite permitido.",
    "requestId": "..."
  }
}
```

Endpoints principais:

- `POST /api/albums/resolve`
- `GET /api/albums/[albumId]/photos`
- `POST /api/albums/[albumId]/uploads`
- `POST /api/albums/[albumId]/uploads/[uploadId]/complete`
- `PATCH /api/photos/[photoId]`
- `DELETE /api/photos/[photoId]`
- `GET /api/media/[photoId]/original`
- `GET /api/google-drive/connect`
- `GET /api/google-drive/callback`
- `POST /api/google-drive/disconnect`

Usar paginação por cursor, não por offset, na galeria.

Adicionar `requestId` a logs e respostas de erro.

---

## 15. Segurança

### Segredos e tokens

- Validar variáveis de ambiente no arranque com Zod.
- Encriptar refresh tokens com AES-256-GCM ou mecanismo equivalente autenticado.
- Usar `APP_ENCRYPTION_KEY` com 32 bytes e suportar versão/rotação de chave.
- Nunca guardar tokens em localStorage.
- Cookies sensíveis: `HttpOnly`, `Secure` em produção e `SameSite=Lax` ou mais restritivo quando compatível.

### Upload

- Limitar quantidade, tamanho total e tamanho individual.
- Rate limit por sessão, IP e álbum.
- Normalizar nomes de ficheiro.
- Não executar conteúdo enviado.
- Rejeitar SVG no MVP.
- Rejeitar tipos não suportados mesmo que a extensão pareça válida.
- Definir timeout e abortar uploads presos.
- Limpar ficheiros parciais e registos falhados.

### Aplicação

- Implementar CSRF nas mutações baseadas em cookie quando necessário.
- Adicionar Content Security Policy.
- Adicionar headers de segurança.
- Escapar conteúdo fornecido por utilizadores.
- Não permitir HTML livre em títulos ou descrições.
- Proteger rotas administrativas no servidor, não apenas no cliente.
- Não revelar se um token de álbum existe através de diferenças desnecessárias de resposta.
- Incluir trilho de auditoria para ações administrativas destrutivas.

### Privacidade

- Não mostrar email do autor numa galeria pública.
- Remover GPS dos derivados.
- Disponibilizar eliminação completa de fotografia.
- Documentar retenção de dados.
- Mostrar uma mensagem de consentimento antes do upload, configurável por álbum.

---

## 16. Performance

- Usar Server Components onde façam sentido.
- Manter componentes de galeria e realtime como Client Components pequenos e isolados.
- Usar lazy loading de imagens.
- Reservar espaço com `width` e `height` para evitar layout shift.
- Virtualizar a grelha quando o número de fotografias justificar.
- Paginar por cursor em lotes, inicialmente 50 fotografias.
- Não transferir o original para construir a grelha.
- Usar previews adequados ao tamanho do viewport.
- Evitar consultas N+1.
- Indexar consultas frequentes.
- Incluir limites de concorrência para processamento e upload.
- Implementar backpressure na fila de uploads do browser, inicialmente 3 uploads concorrentes.

Metas iniciais:

- Core Web Vitals em estado “good” numa galeria típica.
- Primeira visualização útil abaixo de 2,5 s numa ligação móvel razoável.
- Atualização realtime normalmente abaixo de 3 s após `photos.status = 'ready'`.

---

## 17. Acessibilidade

Cumprir WCAG 2.2 AA na medida aplicável.

- Navegação completa por teclado.
- Foco visível.
- Contraste adequado.
- Texto alternativo configurável; quando inexistente, usar descrição neutra e não o nome técnico do ficheiro.
- Botões com nomes acessíveis.
- Diálogos com gestão correta de foco.
- Não depender apenas de cor para indicar estados.
- Respeitar `prefers-reduced-motion`.
- Progresso de upload anunciado através de regiões ARIA sem excesso de notificações.

---

## 18. Observabilidade

- Criar logger estruturado.
- Nunca incluir tokens, cookies, binários ou dados pessoais desnecessários nos logs.
- Incluir `requestId`, `userId` quando apropriado, `albumId`, `photoId`, operação e duração.
- Registar métricas básicas: uploads iniciados, concluídos, falhados, duração de processamento e erros da Drive API.
- Criar uma página administrativa simples de saúde da integração.
- Criar endpoint `/api/health` que valide a aplicação sem expor segredos.
- Preparar integração opcional com Sentry, mas manter o projeto funcional sem essa conta.

---

## 19. Testes obrigatórios

### Unitários

- validação de ficheiros;
- normalização de nomes;
- hashes e tokens;
- encriptação/desencriptação;
- regras de permissões;
- mapeamento de erros Google;
- criação de cursores;
- ordenação de fotografias.

### Integração

- criação de álbum e pasta Drive com adaptador Google mockado;
- upload completo com Drive mockado e Supabase de teste;
- falha no Drive não publica fotografia como `ready`;
- sessão de álbum válida/expirada/revogada;
- RLS entre álbuns;
- eliminação idempotente;
- renovação de access token a partir do refresh token encriptado.

### E2E com Playwright

- administrador inicia sessão;
- administrador liga Drive através de um modo mock em testes;
- cria álbum e link;
- convidado abre link;
- convidado envia fotografias;
- outro browser recebe a fotografia em tempo real;
- administrador oculta e volta a publicar;
- administrador elimina;
- link revogado deixa de funcionar.

Não chamar APIs Google reais na suíte normal de CI. Criar testes manuais separados para sandbox/staging.

---

## 20. Variáveis de ambiente

Criar `.env.example` sem valores reais:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/google-drive/callback

APP_ENCRYPTION_KEY=
APP_TOKEN_PEPPER=

MAX_UPLOAD_BYTES=26214400
MAX_FILES_PER_UPLOAD=50
PREVIEW_MAX_EDGE=1600
THUMBNAIL_MAX_EDGE=480

# Opcional em produção
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
SENTRY_DSN=
```

Criar `lib/env.ts` com validação e mensagens claras.

---

## 21. Comandos do projeto

Configurar scripts equivalentes a:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "format": "prettier --write .",
  "check": "pnpm lint && pnpm typecheck && pnpm test"
}
```

Adicionar CI para instalar com lockfile, executar `check`, construir e correr os testes E2E essenciais.

---

## 22. Plano de implementação

Executar por fases e manter uma lista em `docs/implementation-status.md`.

### Fase 0 — Bootstrap

- Criar projeto Next.js/TypeScript/pnpm.
- Configurar lint, format, testes e aliases.
- Criar layout base e design tokens.
- Configurar validação de ambiente.
- Criar Dockerfile e README inicial.

Critério de saída: `pnpm check` e `pnpm build` passam.

### Fase 1 — Supabase e autenticação

- Configurar clientes browser/server/admin.
- Criar migrações iniciais.
- Implementar login administrativo.
- Implementar anonymous sign-in.
- Implementar RLS e testes de isolamento.

Critério de saída: administrador e visitante têm sessões corretas e não conseguem aceder a recursos indevidos.

### Fase 2 — Álbuns e partilha

- CRUD de álbuns.
- Links não listados, PIN, expiração e revogação.
- Resolução de link para `album_session`.
- Página pública com estado vazio.

Critério de saída: link válido abre apenas o álbum correto.

### Fase 3 — Google Drive

- OAuth separado para Drive.
- Armazenamento encriptado do refresh token.
- Criação de pasta raiz e subpastas.
- Verificação e reconexão.
- Adaptador mock para testes.

Critério de saída: um administrador liga a conta e cria um álbum com pasta Drive associada.

### Fase 4 — Upload e processamento

- UI de seleção e fila.
- Endpoint seguro de upload.
- Envio do original ao Drive.
- Preview, thumbnail, hash e metadados.
- Estados e tratamento de erros.
- Limites e rate limit.

Critério de saída: fotografias válidas chegam ao Drive e ficam visíveis através do preview.

### Fase 5 — Galeria e realtime

- Grelha responsiva.
- Paginação por cursor.
- Lightbox.
- Subscrição Realtime.
- Reconexão e fallback de refetch.
- Modo apresentação.

Critério de saída: dois browsers no mesmo álbum veem novas imagens sem recarregar.

### Fase 6 — Moderação e operações

- Aprovar, ocultar, destacar, capa e eliminação.
- Ações em lote.
- Auditoria.
- Página de saúde e erros.

Critério de saída: administrador controla completamente o conteúdo do álbum.

### Fase 7 — Hardening e deploy

- CSP e headers.
- Testes E2E completos.
- Performance e acessibilidade.
- Cloud Run, CI e documentação operacional.
- Checklist de produção.

Critério de saída: build reproduzível, migrações aplicadas, segredos externos ao repositório e smoke tests aprovados.

---

## 23. Definição de concluído

Uma tarefa só está concluída quando:

- o comportamento está implementado;
- existem estados de loading, vazio e erro;
- autorização é verificada no servidor;
- testes adequados foram adicionados ou atualizados;
- `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` passam;
- a documentação relevante foi atualizada;
- não foram introduzidos segredos, logs sensíveis ou permissões excessivas;
- a interface funciona em viewport móvel e desktop;
- a acessibilidade básica foi verificada por teclado.

---

## 24. Regras para o Claude Code

Ao trabalhar neste repositório:

1. Ler este ficheiro por completo antes de alterar código.
2. Inspecionar a estrutura e o estado atual antes de criar novos ficheiros.
3. Apresentar um plano curto para mudanças com várias etapas.
4. Implementar a menor fatia vertical funcional.
5. Não criar mocks permanentes em caminhos de produção.
6. Não desativar TypeScript, ESLint, RLS ou testes para contornar problemas.
7. Não usar `any` salvo num limite externo inevitável e documentado.
8. Não usar a service role no browser.
9. Não guardar tokens OAuth em texto simples.
10. Não tornar ficheiros Drive públicos para simplificar a visualização.
11. Não executar migrações destrutivas sem criar uma estratégia de migração/rollback.
12. Em operações destrutivas, pedir confirmação na interface e tornar o backend idempotente.
13. Depois de implementar, listar ficheiros alterados, decisões tomadas, testes executados e limitações conhecidas.
14. Quando uma API externa for incerta, consultar primeiro a documentação oficial atual.
15. Manter o `README.md` como guia humano de instalação e este `CLAUDE.md` como especificação e regras de desenvolvimento.

---

## 25. Fora do âmbito do MVP

Não implementar inicialmente:

- reconhecimento facial;
- pesquisa por objetos ou pessoas;
- edição avançada de fotografias;
- vídeos;
- comentários e reações;
- impressão ou encomenda de álbuns;
- importação geral de todo o Google Drive;
- sincronização bidirecional de alterações feitas manualmente no Drive;
- aplicações móveis nativas;
- múltiplas organizações/tenants complexos;
- faturação.

Preparar o domínio para evolução, mas não antecipar estas funcionalidades no código.

---

## 26. Evoluções recomendadas após o MVP

- Suporte HEIC/HEIF.
- Upload resumível direto com melhor tolerância a redes móveis instáveis.
- Google Picker para escolher uma pasta explicitamente.
- Sincronização de ficheiros adicionados diretamente ao Drive.
- Vídeo com transcodificação e thumbnails.
- QR code do álbum e do upload.
- Slideshow para ecrãs de evento.
- Reações e favoritos.
- Exportação ZIP assíncrona.
- Deteção de duplicados percetual.
- Marca de água opcional.
- Domínios personalizados.
- Multi-tenant e equipas.

---

## 27. Referências técnicas oficiais

Consultar documentação oficial atual antes da implementação:

- Google Drive API — uploads: https://developers.google.com/workspace/drive/api/guides/manage-uploads
- Google Drive API — scopes: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Google OAuth 2.0 para aplicações web no servidor: https://developers.google.com/identity/protocols/oauth2/web-server
- Google Drive API v3: https://developers.google.com/workspace/drive/api/reference/rest/v3
- Supabase Realtime/Postgres Changes: https://supabase.com/docs/guides/realtime/postgres-changes
- Next.js App Router e Route Handlers: https://nextjs.org/docs/app/getting-started/route-handlers

---

## 28. Primeira instrução de execução

Começa por:

1. criar o projeto base;
2. gerar `README.md`, `.env.example`, `Dockerfile` e a estrutura de pastas;
3. configurar lint, TypeScript estrito, Vitest e Playwright;
4. criar as migrações iniciais do Supabase com RLS;
5. implementar uma página pública de álbum com dados mockados apenas numa camada de desenvolvimento isolada;
6. substituir esses dados pela base real na fase seguinte;
7. executar e corrigir `pnpm check` e `pnpm build` antes de continuar.

Não tentes implementar todas as funcionalidades numa única alteração.
