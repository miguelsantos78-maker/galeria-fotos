# 0009 — Deploy na Vercel em vez de Cloud Run

Data: 2026-08-01

## Contexto

O `CLAUDE.md` (secção 4) recomenda Google Cloud Run via Docker como
deploy de produção, mas não o exige — pede apenas que a aplicação
"continue portátil e possa ser executada localmente com `pnpm dev`". O
administrador já tinha conta Vercel criada e o repositório ligado, e
preferiu evitar o caminho gcloud/Docker (que, além disso, não pôde ser
validado de ponta a ponta nesta sessão de desenvolvimento por falta de
acesso de rede ao registo Docker — ver
`docs/decisions/0008-fase-7-hardening-deploy.md`, decisão 7). Decisão:
seguir com a Vercel como plataforma de deploy.

## Decisões

### 1. `output: "standalone"` só se aplica fora da Vercel

`next.config.ts` passou a condicionar `output: "standalone"` a
`!process.env.VERCEL` — esse modo de build só interessa à imagem Docker
usada pelo Cloud Run; a Vercel gera o seu próprio output otimizado e
ignora/não precisa desta opção. `VERCEL=1` é definida automaticamente
pela plataforma em build, por isso a mesma base de código continua a
servir os dois alvos de deploy sem configuração manual adicional.

### 2. `maxDuration = 60` nas rotas de upload e proxy de original

`POST /api/albums/[albumId]/uploads/[uploadId]/complete` (envia o
original para o Drive + processa derivados) e
`GET /api/media/[photoId]/original` (transmite o original do Drive) só
correm em código de servidor; ambas podiam ultrapassar o limite de 10s
por omissão das Serverless Functions da Vercel em planos gratuitos.
`export const maxDuration = 60` não tem efeito fora da Vercel (Cloud Run
não lê esta propriedade).

### 3. `MAX_UPLOAD_BYTES` reduzido de 25 MB para 4 MB

A secção 10.3 do `CLAUDE.md` pede um "limite configurável por ficheiro,
inicialmente 25 MB". As Serverless Functions da Vercel (runtime Node.js)
têm um **limite fixo de 4,5 MB por pedido**, imposto pela própria
plataforma antes mesmo do código da aplicação correr — não é
configurável, e não há forma de o contornar mantendo o envio do
ficheiro através da função serverless atual (`request.formData()` lê o
pedido completo). Decisão: baixar o valor por omissão de
`MAX_UPLOAD_BYTES` para `4_000_000` bytes (~3,8 MiB), com margem de
segurança sob o limite da plataforma, em vez de aceitar uploads que
falhariam sistematicamente em produção. Fica documentado como
específico da Vercel — em `Cloud Run`/Docker este limite não existe, e
o valor pode voltar a `26214400` nesse cenário (nota deixada no próprio
`.env.example`).

Isto é uma limitação real, não cosmética: fotografias originais de
câmaras/telemóveis mais recentes ultrapassam frequentemente 4 MB. Duas
direções foram consideradas para resolver isto por completo, nenhuma
implementada nesta fase:

- **Compressão no browser antes do envio** (não depois) — só isto reduz
  de facto o tamanho do pedido que chega à função serverless da Vercel;
  uma otimização "depois do carregamento" no servidor não ajuda aqui,
  porque a Vercel rejeita o pedido ao nível da plataforma antes de o
  código da aplicação correr. É a opção mais alinhada com a arquitetura
  atual (mantém o envio a passar pela função serverless) e o próximo
  passo recomendado.
- **Upload direto para um destino que não seja a função serverless**
  (ex.: evoluir a abstração `DriveStorageProvider`/upload retomável já
  prevista na secção 12.2), ou manter só este endpoint em Cloud Run e o
  resto na Vercel — resolve o limite por completo, mas é uma mudança de
  arquitetura maior, fora do âmbito desta fase.

### 4. Suite de testes atualizada

`tests/unit/env.test.ts` (valor por omissão) e
`components/upload/upload-queue.tsx` (validação rápida no cliente,
espelhando o novo valor) foram atualizados para `4_000_000`, com um
comentário a explicar a origem do número.

## Limitações conhecidas

- Fotografias originais acima de ~4 MB são rejeitadas na validação do
  cliente antes de sequer tentar o envio, enquanto a aplicação estiver
  na Vercel sem compressão no browser.
- `CLAUDE.md` continua a indicar "25 MB" como valor inicial (secção
  10.3) — não foi alterado, por ser a especificação original do
  projeto; esta ADR documenta o desvio específico da plataforma de
  deploy escolhida, como pede a secção 3 do `CLAUDE.md`.
- Compressão/redimensionamento no browser antes do envio fica como
  melhoria planeada, não implementada nesta fase.
