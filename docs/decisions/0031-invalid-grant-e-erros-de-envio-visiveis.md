# 0031 — `invalid_grant` do Google e erros de envio visíveis

Data: 2026-08-10

## Contexto

Em produção, sete envios seguidos falharam. Na interface, cada
miniatura mostrava apenas um X vermelho com "tentar novamente"; repetir
falhava sempre. O log da função revelou a causa:

```json
{
  "level": "error",
  "operation": "uploads.completeUpload.driveUpload",
  "message": "invalid_grant",
  "driveErrorCode": 400
}
```

`invalid_grant` é a resposta do Google quando o refresh token deixou de
ser aceite. As causas são todas do lado da conta Google: acesso
revogado, palavra-passe alterada, token seis meses sem uso, ou - a mais
provável num projeto ainda não publicado - o ecrã de consentimento
OAuth em "Testing", estado em que o Google expira os refresh tokens ao
fim de 7 dias.

Dois problemas distintos ficaram à vista.

## Decisão

### 1. `invalid_grant` deixa de ser tratado como falha transitória

`server/use-cases/uploads.ts` apanhava qualquer erro do Drive e
devolvia sempre `UPLOAD_DRIVE_FAILED` ("não foi possível enviar"). Para
uma falha de rede ou de quota está certo - repetir resolve. Para
`invalid_grant` está errado em três frentes: repetir nunca pode
funcionar, todos os envios de todos os convidados vão falhar até
alguém agir, e a ligação continuava marcada como `active`, por isso o
painel de administração dizia que estava tudo bem.

Passa a haver um `lib/google-drive/errors.ts` com
`isInvalidGrantError()`, e no caminho de falha do envio:

- a ligação passa a `status: 'error'` - o estado que
  `components/admin/google-drive-integration.tsx` já mostrava como "Com
  erro - é necessário reconectar";
- fica registo em `audit_logs` (`google_connection.invalid_grant`);
- o convidado recebe `GOOGLE_CONNECTION_INVALID` (503) com uma
  mensagem que explica que o problema não é dele e não se resolve a
  tentar outra vez.

A deteção olha para a mensagem e para o corpo da resposta, porque o
`google-auth-library` propaga o erro de formas diferentes conforme
falhe no pedido do token ou na chamada à API.

O botão de repetir mantém-se: depois de o administrador reconectar,
repetir é exatamente a ação certa e as fotografias ainda estão na fila.

### 2. As mensagens de erro passam a ser visíveis

A causa de o problema ter demorado a diagnosticar: a mensagem do
servidor era guardada em `errorMessage` e usada **só** em `title` e
`aria-label` da miniatura. Um `title` precisa de hover, que não existe
em telemóvel - que é onde a maioria dos convidados envia. Na prática a
interface mostrava um ícone vermelho e nada mais, contra a secção 10.3
("mensagens de erro claras por ficheiro").

Passa a haver um painel `role="alert"` acima da fila com a mensagem
real do servidor, agrupada por mensagem - sete ficheiros a falhar pela
mesma razão são uma linha, não sete.

O `role="alert"` que estava no ícone da miniatura foi removido: com o
painel, eram duas regiões a anunciar a mesma falha, e a da miniatura
não tinha texto nenhum para anunciar.

Duplicados ficam de fora do painel: já têm tratamento próprio, em tom
de aviso, na miniatura (ADR 0021).

## Verificação

`pnpm check` (lint + typecheck + formatação + 231 testes) e
`pnpm build`.

Testes novos:

- `tests/unit/google-drive-errors.test.ts` - as quatro formas em que o
  erro chega, e os casos que não são `invalid_grant`.
- `tests/unit/use-cases/uploads.test.ts` - `invalid_grant` marca a
  ligação como `error` e regista auditoria; uma falha transitória do
  Drive **não** mexe no estado da ligação (o par importa: sem o segundo
  teste, marcar a ligação como avariada a cada soluço de rede passaria
  despercebido).
- `tests/unit/upload-queue.test.tsx` - a mensagem do servidor aparece
  no ecrã, falhas iguais agrupam-se numa linha, e duplicados não
  entram no painel de falhas.

O adaptador falso do Drive ganhou `state.failNextUploadWith` para
poder exercitar estes caminhos.

## Limitações conhecidas

- Só o caminho de envio deteta `invalid_grant`. A transmissão do
  original (`/api/media/[photoId]/original`), a eliminação e a
  sincronização com o Drive continuam a devolver erro genérico nesse
  caso. Vale a pena centralizar, mas o envio é o caminho que os
  convidados usam e era o que estava a falhar.
- A aplicação não avisa o administrador por email quando isto acontece
  - ele só vê ao abrir o painel. Num evento ao vivo, é pouco.
