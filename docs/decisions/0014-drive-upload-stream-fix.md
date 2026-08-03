# 0014 — Corrigir o envio ao Drive: `media.body` precisa de um stream, não de um `Buffer`

Data: 2026-08-03

## Contexto

Com o `sharp` finalmente a funcionar na Vercel (`docs/decisions/0012`),
o envio ao Google Drive continuava a falhar com a mensagem genérica
"Não foi possível enviar a fotografia para o Google Drive." O
`catch {}` sem registo (corrigido em commit anterior, ver
`server/use-cases/uploads.ts`) escondia a causa real. Com o registo
adicionado, o erro real apareceu nos logs:

```
t.body.pipe is not a function
```

## Causa

`lib/google-drive/drive-provider.ts`, `uploadOriginal`, passava
`media: { mimeType, body }` diretamente ao `drive.files.create` da
`googleapis`, com `body` a ser o `Buffer` do ficheiro
(`server/use-cases/uploads.ts` lê o corpo do pedido para um
`Buffer.from(...)`). A interface `UploadOriginalInput.body`
(`lib/google-drive/types.ts`) sempre aceitou
`NodeJS.ReadableStream | Buffer` — mas a própria biblioteca
`googleapis`/`gaxios`, internamente, só sabe montar o pedido multipart
de upload de ficheiro a partir de algo com `.pipe()` (um stream); um
`Buffer` não tem esse método, daí o erro em runtime, não detetado pelo
TypeScript (o tipo do pacote aceita o `Buffer`, só o comportamento
real em runtime é que não).

## Correção

`uploadOriginal` normaliza o `body` antes de o passar à `googleapis`:
`Buffer.isBuffer(body) ? Readable.from(body) : body` (`node:stream`).
Mudança mínima, isolada ao adaptador — não foi preciso tocar na
interface `DriveStorageProvider` nem em `server/use-cases/uploads.ts`.

## Porque não foi apanhado antes

Os testes existentes (`tests/unit/use-cases/uploads.test.ts`, etc.)
usam um adaptador falso do `DriveStorageProvider`
(`tests/unit/fakes/drive-provider.ts`), como já é o padrão do projeto
para isolar a camada de domínio da `googleapis` real (secção 12 do
`CLAUDE.md`) — o comportamento real da própria biblioteca só é
exercitado com uma conta Google real, que só existe fora deste
ambiente de desenvolvimento. Fica como limitação já conhecida desde a
Fase 3/4: este tipo de erro só aparece em verificação manual contra o
Drive real (checklist de produção, secção 3).

## Verificação

`pnpm check` completo e suite E2E (15 testes) a passar. **Não foi
possível confirmar contra o Google Drive real nesta sessão** — só a
compilação/tipos. Precisa de confirmação em produção com um envio
real.
