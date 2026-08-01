# 0005 — Fase 4: Upload e processamento

Data: 2026-08-01

## Contexto

A Fase 4 pede UI de seleção e fila, endpoint seguro de upload, envio do
original ao Drive, preview/thumbnail/hash/metadados, estados e
tratamento de erros, e limites/rate limit (secção 22). Este documento
regista as decisões tomadas, uma ambiguidade real do esquema (secção 7)
resolvida, e um bug de ambiente de testes encontrado e corrigido.

## Decisões

### 1. `drive_file_id` não pode ser pré-gerado — o `upload_jobs` é o estado "em curso"

Ao contrário do álbum (Fase 3, onde o `id` é pré-gerado com
`randomUUID()` antes de existir a pasta no Drive), `photos.drive_file_id`
é atribuído pelo Google, não pela aplicação — não há como pré-gerar. Por
isso a linha em `photos` só é inserida depois de o original já estar no
Drive e os derivados já estarem na Storage; o `upload_jobs` (criado em
`initiateUpload`, atualizado ao longo de `completeUpload`) é que
representa o estado "em curso" visível pelo utilizador, incluindo falhas
(`status: 'failed'`/`'expired'`). Os estados intermédios do enunciado da
secção 5.3 (`queued`, `uploading`, `processing`) existem no tipo
`PhotoStatus` para uma futura arquitetura assíncrona/em fila, mas neste
fluxo síncrono de pedido único a linha em `photos` só chega a existir já
no estado terminal (`ready` ou `pending_review`).

### 2. `photos.preview_path` guarda só o preview — a thumbnail é derivável, sem coluna própria

A secção 13 pede preview (1600px) e thumbnail (480px) como derivados
distintos, mas a secção 7 só define uma coluna, `preview_path`. Em vez de
alterar o esquema (migração fora do âmbito desta fase, e a Fase 3 já
estabeleceu não antecipar mudanças de esquema sem necessidade concreta),
`lib/media/storage-paths.ts` define os dois caminhos como uma função pura
de `albumId`/`photoId` (`albums/{albumId}/{photoId}/preview.webp` e
`.../thumbnail.webp`, seguindo literalmente o exemplo da secção 13.11).
Só `preview_path` é gravado; o caminho da thumbnail é sempre recalculado
a partir de `albumId`/`photoId`, já conhecidos em todos os pontos onde é
preciso.

### 3. Deteção de duplicados: rejeitar, não ignorar

A secção 13.9 pede o sha256 do original "para deteção de duplicados",
sem especificar o comportamento. Decisão: `completeUpload` calcula o
sha256 antes de gastar uma chamada ao Drive e rejeita com
`PHOTO_DUPLICATE` (409) se já existir uma fotografia não eliminada com o
mesmo `(album_id, sha256)` — evita duplicar o mesmo ficheiro no Drive e
correspondes-lhe alertar o utilizador em vez de silenciosamente aceitar
uma repetição.

### 4. Upload em dois passos (`uploads` + `uploads/[uploadId]/complete`), síncrono nesta fase

A secção 14 lista os dois endpoints separadamente. Implementados como:
`POST .../uploads` valida autorização/limite e cria um `upload_jobs`
(`status: 'pending'`); `POST .../uploads/[uploadId]/complete` recebe os
bytes (multipart/form-data), revalida tudo outra vez (secção 5.2, passo
6) e faz Drive + processamento + Storage + `photos` de forma síncrona,
num único pedido. A secção 12 já previa esta simplificação: "Se a
primeira versão técnica usar streaming simples, manter a abstração e
abrir uma tarefa explícita para completar o modo retomável antes de
aceitar ficheiros grandes em produção" — é exatamente isso que fica
registado aqui como limitação conhecida. A estrutura em dois passos (com
`upload_jobs` a title o estado) já deixa espaço para o modo retomável
entrar mais tarde sem mudar a API pública.

### 5. Autorização de upload revalidada a cada pedido, nunca só a partir da `album_session`

`authorizeUpload()` (`server/use-cases/uploads.ts`) confirma a cada
pedido — tanto em `initiateUpload` como em `completeUpload` — que a
sessão ainda tem permissão `upload`, que o álbum continua `published` e
que `upload_enabled` continua ativo. As permissões capturadas na
`album_session` no momento da resolução do link (Fase 2) são só um
ponto de partida; um administrador pode desativar o upload ou arquivar o
álbum a meio de uma sessão de 24 horas, e o próximo pedido tem de o
respeitar (secção 5.2, passo 6: "O backend volta a validar
autorização...").

### 6. Sem upload direto de administrador — só o fluxo de convidado descrito na secção 2/5.2

Ponderada a hipótese de o dono do álbum também poder enviar fotografias
diretamente (sem `album_session`), mas a secção 10.4 (ações de
administrador) não inclui "enviar fotografias" na lista, e a secção 2
descreve o envio sempre como uma ação do convidado. Implementar
autorização dupla (dono OU sessão) seria uma funcionalidade não pedida.
Fica documentado como possível evolução, não como lacuna.

### 7. Limites: validados a cada pedido; rate limiting por IP/sessão fica para a Fase 7

`MAX_UPLOAD_BYTES` é verificado três vezes: no cliente (UX, não
segurança), em `initiateUpload` (contra o `expectedSize` declarado) e em
`completeUpload` (contra o tamanho real do buffer, e outra vez por
`Content-Length` no Route Handler antes de ler o corpo, para não gastar
memória com um pedido manifestamente grande). `MAX_FILES_PER_UPLOAD` é
só imposto na fila do cliente (`components/upload/upload-queue.tsx`),
porque cada pedido HTTP transporta um único ficheiro — não há um
"lote" para o servidor limitar. Rate limiting por IP/sessão/álbum
(secção 15) continua sem `UPSTASH_REDIS_*` configurado, tal como já
ficou decidido para `/api/albums/resolve` na Fase 2 (ADR 0003) — mesma
razão, mesma fase de destino (Fase 7, hardening).

### 8. Grelha de fotografias mínima, não a galeria completa da Fase 5

`GET /api/albums/[albumId]/photos` e `components/gallery/photo-grid.tsx`
existem só para provar o critério de saída desta fase ("fotografias
válidas chegam ao Drive e ficam visíveis através do preview"). Já usam
paginação por cursor (`sort_order`, secção 14/16) e URLs assinados de
curta duração (secção 5.4), mas não têm masonry, virtualização,
lightbox nem subscrição Realtime — tudo isso é explicitamente Fase 5
(secção 22). A grelha usa `<img>` simples em vez de `next/image`,
porque os URLs assinados apontam para um domínio de Storage que varia
por instalação (não dá para pré-configurar `images.remotePatterns` de
forma genérica sem saber o domínio Supabase real).

### 9. Consentimento antes do upload: aviso estático, não configurável por álbum

A secção 15 pede uma mensagem de consentimento "configurável por álbum",
o que implicaria um novo campo em `albums` — fora do esquema definido na
secção 7 e fora do âmbito desta fase (que já tem uma superfície grande).
Decisão: mostrar sempre o mesmo aviso estático com uma caixa de
confirmação que tem de ser marcada antes de os campos de seleção de
ficheiros ficarem ativos. A parte "configurável por álbum" fica como
limitação conhecida — precisaria de uma migração e de um campo novo no
formulário de administração.

### 10. Blurhash como dependência nova, justificada pelo nome da própria coluna

A secção 13.10 permite "blurhash ou placeholder equivalente". A tabela
`photos` (secção 7) já tem uma coluna chamada literalmente `blurhash`,
o que aponta para a intenção original. Decisão: usar o pacote `blurhash`
(MIT, ~9 kB, sem dependências próprias, muito usado) em vez de inventar
um placeholder alternativo — o `sharp` já produz o raw RGBA numa
resolução pequena (32×32) que o `blurhash` só precisa de codificar, sem
custo adicional relevante.

### 11. Bug de ambiente encontrado e corrigido: `vitest` com `environment: "jsdom"` parte o `file-type`

`pnpm test` começou a falhar com `TypeError: Expected the input argument
to be of type Uint8Array or ArrayBuffer, got object` em qualquer teste
que chamasse `detectImageMimeType()` (que usa `file-type`). Isolado: o
`file-type` faz `input instanceof Uint8Array`, e um `Buffer` do Node
falha esse `instanceof` dentro do contexto isolado que o
`vitest-environment-jsdom` cria (o jsdom tem o seu próprio realm, com o
seu próprio `Uint8Array`, diferente do `Uint8Array` do qual `Buffer`
herda no realm "real" do Node) — um problema conhecido de
`jsdom`/`vitest` com `Buffer`, não um bug no código desta aplicação.

Nenhum teste da suíte (incluindo os das Fases 0–3) alguma vez usou
`@testing-library/react` para renderizar componentes — o `environment:
"jsdom"` estava configurado "por preparação", sem necessidade real
ainda. Corrigido trocando o ambiente por omissão para `"node"` em
`vitest.config.mts` (mais correto para uma suíte que é sobretudo lógica
de servidor), com uma nota a explicar que ficheiros que precisem de DOM
no futuro (testes de componentes, Fase 5+) podem ativar jsdom por
ficheiro com o comentário `// @vitest-environment jsdom`. Efeito
colateral positivo: a suíte ficou bastante mais rápida (o arranque do
jsdom por ficheiro custava a maior parte do tempo de `environment` nos
testes anteriores).

## Limitações conhecidas

- Sem upload retomável (secção 12): ficheiros grandes fazem um único
  pedido `multipart/form-data`; `upload_jobs.drive_session_uri_encrypted`
  existe no esquema mas não é usado ainda. Fica como tarefa explícita
  antes de aceitar ficheiros grandes em produção, tal como o `CLAUDE.md`
  já previa.
- Sem rate limiting por IP/sessão/álbum (decisão 7) — deferido para a
  Fase 7, tal como o `resolve` da Fase 2.
- Mensagem de consentimento estática, não configurável por álbum
  (decisão 9).
- A grelha de fotografias é deliberadamente mínima (decisão 8); a
  experiência completa (masonry, lightbox, tempo real, modo
  apresentação) é a Fase 5.
- `original_filename`/EXIF `captured_at`: o `CLAUDE.md` (secção 13) não
  inclui extrair a data de captura do EXIF nos passos do processamento;
  `captured_at` fica `null` por agora, para não introduzir mais uma
  dependência (parser de EXIF) não pedida explicitamente.
- Sem testes de integração contra um Supabase/Google Drive reais (mesma
  limitação das Fases 1–3): a orquestração está testada com
  repositórios, adaptador Drive e armazenamento de preview falsos
  (`tests/unit/fakes/`). Confirmado manualmente com `pnpm start` que os
  endpoints devolvem os códigos de erro esperados sem sessão (401) e que
  as páginas não rebentam sem um projeto Supabase real ligado (mesma
  limitação de ambiente das fases anteriores — sem acesso à rede
  externa neste sandbox).
