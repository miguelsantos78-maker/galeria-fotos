# 0032 — O log "[object Object]" e os repositórios que não lançavam Errors de verdade

Data: 2026-08-10

## Contexto

Durante um envio real de várias fotografias em simultâneo, algumas
falharam com um erro genérico e outras corretamente como duplicadas.
O log da função para uma das falhas genéricas:

```json
{
  "level": "error",
  "message": "unhandled_error",
  "error": "[object Object]"
}
```

Sem mensagem nenhuma para diagnosticar. A causa estava em
`lib/api/response.ts`:

```ts
error: error instanceof Error ? error.message : String(error),
```

Para isto produzir exatamente `"[object Object]"`, `error` tinha de
ser um objeto simples, não uma instância de `Error` — apesar de todo o
código da aplicação só lançar `AppError` ou `Error` de verdade.

## Decisão

### A causa: `supabase-js` nem sempre devolve um `PostgrestError`

Todos os repositórios seguem o padrão:

```ts
const { data, error } = await db.from("photos").insert(input)...;
if (error) throw error;
```

Numa falha ao nível do Postgres (violação de restrição, política RLS),
`error` é uma instância de `PostgrestError`, que estende `Error` — este
caminho sempre funcionou bem. Mas `@supabase/postgrest-js` tem um
segundo caminho: quando o próprio `fetch` para o Supabase falha (timeout,
ligação interrompida a meio, cabeçalhos demasiado grandes) e
`throwOnError()` não está ligado — que é o caso em toda a aplicação —,
a biblioteca **não lança**; devolve
`{ success: false, error: { message, details, hint, code } }`, um
**objeto simples**, não uma `PostgrestError`.

`if (error) throw error` lançava esse objeto tal e qual. É exactamente
o cenário que vários envios concorrentes tornam mais provável: mais
ligações simultâneas ao Supabase a partir da mesma função, mais chance
de uma delas sofrer um soluço de rede a meio.

O ficheiro Drive já criado era corretamente apagado pelo bloco
`catch` de `completeUpload` (a limpeza nunca dependeu de `error` ser
um `Error`) — o problema era só a mensagem, não uma fuga de recursos.

### `toPostgrestError()` normaliza antes de lançar

`lib/db/postgrest-error.ts`. Todas as ocorrências de `if (error) throw
error` nos sete repositórios (`albums`, `album-sessions`,
`audit-log`, `google-connections`, `photos`, `share-links`,
`upload-jobs`) passam a `if (error) throw toPostgrestError(error)`:
instâncias de `Error` (o caso comum) passam sem alteração; um objeto
simples com `message` string vira uma `Error` de verdade com essa
mensagem; sem `message` nenhuma, uma mensagem de recurso explica que
foi uma falha de rede.

### `jsonError` deixa de desistir num objeto sem `message`

Mesmo com a normalização acima a cobrir o caminho conhecido, o log
passa a tentar extrair `.message` de qualquer objeto que o tenha,
antes de cair no `String()` genérico — para qualquer erro futuro,
normalizado ou não, aparecer com alguma informação em vez de
`"[object Object]"`. Ganha também `errorName` (o `.name` da `Error`, ou
`typeof` quando nem isso há), útil para distinguir uma falha de rede
de uma violação de restrição a olho no log.

## Verificação

`pnpm check` (lint + typecheck + formatação + 242 testes) e
`pnpm build`.

Testes novos:

- `tests/unit/postgrest-error.test.ts` — as quatro formas de entrada
  de `toPostgrestError`, e um teste de ponta a ponta contra
  `createPhotosRepository` real (não o adaptador falso usado nos
  testes de use-case) com um cliente Supabase mínimo que devolve a
  forma exata de uma falha de rede — prova que `insert()` já lança uma
  `Error`, não o objeto simples.
- `tests/unit/api-response.test.ts` — `jsonError` extrai a mensagem de
  um objeto simples, cai num valor de recurso quando não há
  `message` nenhuma, e nunca devolve o erro interno ao cliente (só a
  mensagem genérica).

## Limitações conhecidas

- A mensagem que o convidado vê para esta falha continua genérica
  ("Ocorreu um erro inesperado.", com botão "Tentar novamente") em vez
  de identificar explicitamente que foi uma falha de rede transitória.
  O objetivo aqui era tornar o erro diagnosticável nos logs; distinguir
  a mensagem para o convidado é um passo separado, e de valor menor —
  o botão de repetir já funciona para este caso.
- A normalização cobre os sete repositórios que já existem. Um
  repositório novo que repita `if (error) throw error` sem passar por
  `toPostgrestError` volta a ficar exposto ao mesmo problema; não há
  neste momento uma verificação automática (lint) que o impeça.
