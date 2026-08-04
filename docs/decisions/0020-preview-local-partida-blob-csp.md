# 0020 — Pré-visualização local do envio aparecia partida

Data: 2026-08-04

## Contexto

Reportado com captura de ecrã: ao selecionar uma fotografia para
enviar, a miniatura local (`components/upload/upload-queue.tsx`)
aparecia como ícone de imagem partida, com o nome do ficheiro como
texto alternativo visível por cima.

## Causa

A pré-visualização local usa `URL.createObjectURL(file)`, que produz
um URL `blob:`. O `Content-Security-Policy` (`lib/security/csp.ts`,
secção 15) definia `img-src 'self' data: https://<host-supabase>` —
sem `blob:` na lista, o browser bloqueia silenciosamente o carregamento
dessas imagens (sem erro visível na aplicação, só na consola), e o
`<img>` cai no comportamento por omissão do browser: o ícone de imagem
partida com o `alt` como texto.

## Decisão

Adicionado `blob:` a `img-src`. Continua restrito — não abre a
política a qualquer origem remota, só permite o esquema usado
exclusivamente para pré-visualizações geradas no próprio browser a
partir de ficheiros que o utilizador acabou de selecionar.

Como reforço (pedido explícito: "se não for possível colocar a imagem
real, coloca uma imagem dummy"), `upload-queue.tsx` ganhou um
`onError` no `<img>` da pré-visualização: se o `blob:` mesmo assim não
carregar por qualquer razão (ficheiro que o browser não consegue
decodificar, bloqueio inesperado de uma extensão do utilizador, etc.),
troca para um ícone genérico embutido em `data:image/svg+xml` — nunca
o ícone de imagem partida do browser com o nome do ficheiro exposto.

## Verificação

`pnpm check` completo (lint + typecheck + 194 testes — atualizado
`tests/unit/csp.test.ts` para a nova diretiva `img-src`), `pnpm build`
e suite E2E (15 testes).

## Nota à parte

A mensagem "Esta fotografia já foi enviada para este álbum" na mesma
captura de ecrã não é um bug — é a deteção de duplicados por `sha256`
(secção 13) a funcionar como esperado (o ficheiro já tinha sido
enviado antes); ficou visível ao mesmo tempo que a pré-visualização
partida só por coincidência.
