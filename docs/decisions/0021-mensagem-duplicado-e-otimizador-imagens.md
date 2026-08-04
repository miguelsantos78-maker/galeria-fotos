# 0021 — Mensagem de duplicado enquadrada + otimizador de imagens no browser

Data: 2026-08-04

## Contexto

Dois pedidos seguidos do administrador, ambos sobre o mesmo ecrã de
envio: "quando a foto já existe, mostra uma mensagem mais enquadrada
com o layout da plataforma", e depois "coloca um otimizador do tamanho
das imagens para garantir que não são carregadas imagens muito
grandes".

## Decisão

### Mensagem de duplicado com tratamento próprio

`server/use-cases/uploads.ts` já rejeitava um envio repetido com
`PHOTO_DUPLICATE` (secção 13, deteção por `sha256`), mas o cliente só
guardava a `message` do erro, não o `code` — todos os erros de envio
caíam na mesma sobreposição preta/branca genérica com "Tentar
novamente".

`uploadFileWithProgress` (`components/upload/upload-queue.tsx`) passa
agora a capturar também `error.code` do corpo JSON (nova classe
`UploadHttpError`), guardado em `QueueItem.errorCode`. Um duplicado é
tratado como um estado informativo, não um erro no sentido comum — a
fotografia já está no álbum, nada correu mal — por isso usa o
vocabulário visual de aviso já existente no resto da aplicação
(`bg-warning/15 text-warning`, o mesmo padrão do rótulo "Pendente" no
painel de moderação) em vez do preto/vermelho genérico: fundo
`bg-surface/95` (adapta-se a tema claro/escuro), ícone circular âmbar,
e um botão "Remover" (tira o item da fila) em vez de "Tentar
novamente" — repetir o envio do mesmo ficheiro voltaria sempre a dar
duplicado, por isso não faz sentido oferecer essa ação aqui.

### Otimizador de imagens no browser

Novo `lib/media/client-image-optimizer.ts`. Fotografias com mais de 2
MB (`CLIENT_OPTIMIZE_TRIGGER_BYTES`) são redimensionadas no browser,
antes de entrarem na fila de envio, para um lado máximo de 2400 px
(`CLIENT_OPTIMIZE_MAX_EDGE`) via `createImageBitmap` + `canvas`. Isto
ataca dois problemas ao mesmo tempo:

1. Fotos de câmara de telemóvel excedem facilmente o limite de 4 MB
   por pedido das Serverless Functions da Vercel
   (`docs/decisions/0009`) — antes desta mudança, essas fotos eram
   sempre rejeitadas com "Ficheiro demasiado grande", sem alternativa
   para o convidado.
2. Mesmo fotos um pouco abaixo desse limite (ex.: 3 MB) demoravam mais
   a enviar em ligações móveis do que precisavam — o pedido do
   administrador ("garantir que não são carregadas imagens muito
   grandes") pede otimização, não só evitar a rejeição pontual.

Novo estado `"optimizing"` na fila (`QueueStatus`), com o mesmo
tratamento visual do estado "Na fila…" ("A otimizar…"). A validação de
tamanho (`MAX_FILE_BYTES`) só corre depois de tentar otimizar — na
maioria dos casos o ficheiro já cabe; se mesmo depois de otimizado
continuar grande demais, cai no erro genérico existente.

Falha sempre "aberta" para o ficheiro original: sem suporte a
`createImageBitmap`, qualquer erro durante a otimização, ou se a
versão redimensionada não ficar mais pequena, o ficheiro original
segue por diante inalterado — a validação de tamanho do lado do
servidor continua a ser a garantia real (secção 15: "não confiar no
nome, extensão ou MIME enviado pelo cliente").

`createImageBitmap(file, { imageOrientation: "from-image" })` — sem
isto, fotografias em retrato tiradas com o telemóvel de lado
ficariam rodadas incorretamente depois de otimizadas, porque o
`canvas` desenha pixels em bruto e ignora a orientação EXIF por
omissão.

## Trade-off, explícito

O "original" preservado no Google Drive para uma fotografia grande
otimizada no browser já não é byte-a-byte o ficheiro que saiu da
câmara — é a versão redimensionada a 2400 px. A secção 13 do
`CLAUDE.md` pede para preservar o original "sem recompressão" do lado
do **servidor**; isto continua verdadeiro (o servidor nunca
reencodifica o que recebe). A otimização acontece antes, no browser, e
é uma escolha deliberada pedida pelo administrador: preferir sempre
conseguir enviar a fotografia (com alguma perda de resolução acima de
2400 px) a rejeitá-la. 2400 px continua a ser mais do que suficiente
para ecrã e impressão a tamanhos normais, e bem acima do preview
(1600 px, secção 13).

## Verificação

`pnpm check` completo (lint + typecheck + 202 testes — 5 novos em
`tests/unit/media/client-image-optimizer.test.ts` para
`computeTargetDimensions`, a parte pura e testável sem `canvas`; 3
novos em `tests/unit/upload-queue.test.tsx`, com um `XMLHttpRequest`
falso para simular as respostas `PHOTO_DUPLICATE` vs. erro genérico) e
`pnpm build`. Suite E2E (15 testes) sem alterações. Confirmado
visualmente com uma captura de ecrã temporária (Playwright, rede
simulada): a mensagem de duplicado aparece enquadrada com o tema
pêssego/terracota da aplicação, distinta do erro genérico.

## Limitações conhecidas

- `optimizeImageFile` não tem cobertura automática direta (depende de
  `canvas`/`createImageBitmap`, indisponíveis em `jsdom`) — só a
  função pura `computeTargetDimensions` tem testes unitários. O
  comportamento de falha aberta (devolver o ficheiro original em caso
  de erro) cobre este risco: o pior cenário é a otimização não
  acontecer, nunca um envio bloqueado por ela.
- Não otimiza HEIC (fora do âmbito do MVP, secção 10.3) nem qualquer
  tipo fora de `ACCEPTED_TYPES`.
