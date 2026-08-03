# 0012 — Corrigir o `sharp` na Vercel com `node-linker=hoisted`

Data: 2026-08-03

## Contexto

O `ERR_DLOPEN_FAILED` do `sharp` em produção (Vercel) ficou por
resolver depois da tentativa registada em
`docs/decisions/0009-deploy-vercel.md` (decisão 6) ser revertida por
suspeita de quebrar o deployment por completo. Falta corrigir o envio
de fotografias sem repetir esse problema.

## Decisão

Adicionado `.npmrc` com `node-linker=hoisted`. Isto muda a estrutura do
`node_modules` gerada pelo `pnpm install`: em vez da estrutura por
omissão (`node_modules/.pnpm/<pacote>@<versão>/node_modules/<pacote>`,
ligada por symlinks — o `node_modules/sharp` que se via era um link
simbólico), passa a uma estrutura "achatada", tipo `npm`/`yarn`
clássico, com `node_modules/<pacote>` como diretório real. Pacotes com
versões conflituantes (como o `sharp` interno do próprio Next.js,
0.34.5, coexistindo com o nosso 0.35.3 — ver decisão 6 do ADR 0009)
ficam aninhados dentro do pacote que os pediu
(`node_modules/sharp/node_modules/@img/...`), tal como sempre
funcionou em `npm`.

Confirmado por inspeção do `.nft.json` gerado localmente
(`VERCEL=1 pnpm build`): com esta estrutura, o rastreio automático de
ficheiros da Vercel passou a incluir sozinho, sem configuração
nenhuma, quase tudo o que o `sharp` precisa — os módulos JavaScript e
o binário nativo `.node`. Só faltava **um único ficheiro**:
`node_modules/sharp/node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.3`
(18 MB — a biblioteca partilhada que o `.node` carrega em runtime via
`dlopen`, invisível ao rastreio estático porque não é um `require()`
ao nível do JavaScript).

`next.config.ts` mantém `outputFileTracingIncludes`, mas agora:

- **Muito mais pequeno**: só este ficheiro específico, não a árvore
  inteira de `sharp`/`@img` como na tentativa anterior.
- **Sem ambiguidade de versão**: o caminho já aponta diretamente para
  a cópia aninhada correta (`sharp/node_modules/@img/...`), não há
  glob a apanhar por engano a versão 0.34.5 do Next.js.
- **Só a rota que precisa**: `/api/albums/*/uploads/*/complete`.

## Porque se acredita que isto não repete a falha de "Deploying outputs..."

Não há confirmação absoluta (continua sem ser possível testar o passo
de deploy da Vercel diretamente nesta sessão), mas a mudança reduz os
fatores suspeitos da tentativa anterior:

1. Deixou de haver ficheiros de **duas versões diferentes** do sharp
   incluídos na mesma função (antes, mesmo tentando excluir a 0.34.5,
   ela aparecia incluída por outro mecanismo).
2. O volume incluído passou de dezenas de ficheiros (~18 MB × várias
   cópias) para **um único ficheiro** (~18 MB, uma vez).
3. Os caminhos deixaram de atravessar a estrutura simbólica profunda
   do `node_modules/.pnpm` (muitos `../../../../..` a saltar para fora
   da árvore da própria função) — agora é um caminho relativo mais
   curto e direto dentro da própria árvore de dependências da rota.

## Verificação

`pnpm check` (lint + typecheck + testes unitários) e a suite E2E
completa (15 testes) confirmados a passar. `VERCEL=1 pnpm build`
local confirma o ficheiro certo incluído só na rota certa.

### Correção de seguimento: faltava a rota de iniciar o envio

Testado em produção real: o deployment funcionou (não repetiu a falha
de "Deploying outputs..."), mas o envio continuou a falhar — desta vez
com o erro a acontecer em `POST /api/albums/[albumId]/uploads` (a
rota que **inicia** o envio), não só na de concluir. Causa:
`server/use-cases/uploads.ts` tem `initiateUpload` e `completeUpload`
no mesmo ficheiro, com `import { processImage } from
"@/lib/media/process-image"` (que importa "sharp") no topo — carregar
o módulo para `initiateUpload` carrega também esse import, mesmo sem
nunca chamar `processImage()`. A chave de
`outputFileTracingIncludes` mudou de `/api/albums/*/uploads/*/complete`
para `/api/albums/*/uploads` (sem o `/*/complete` final) — como o
Next.js usa `picomatch` com `contains: true`, esta chave mais curta
corresponde às duas rotas (a rota de conclusão contém a de iniciar
como substring do seu caminho). Confirmado por inspeção dos dois
`.nft.json`: ambas as rotas passaram a incluir o ficheiro, as
restantes (`/api/health`, `/api/albums/[albumId]/photos`) continuam
sem ele.

## Limitações conhecidas

- `node-linker=hoisted` é uma mudança estrutural ao `node_modules` de
  todo o projeto, não só do `sharp` — reduz (não elimina) o isolamento
  estrito de dependências que o pnpm normalmente garante (um pacote
  pode acidentalmente conseguir `require()` uma dependência "fantasma"
  não declarada diretamente, se estiver hoisted). Não foram encontrados
  sintomas disso nesta sessão (`pnpm check` e suite E2E completos
  continuam a passar), mas é uma mudança a ter em conta se aparecerem
  erros de módulo em falta depois de futuras alterações de
  dependências.
- Ainda por confirmar em produção real (ver secção "Verificação").
