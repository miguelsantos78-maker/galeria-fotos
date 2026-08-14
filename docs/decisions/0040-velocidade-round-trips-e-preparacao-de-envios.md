# 0040 — Velocidade: round trips a mais e envios todos a preparar ao mesmo tempo

Data: 2026-08-11

## Contexto

Relato de que abrir as páginas e enviar fotografias estava a demorar
muito. Antes de mexer em nada, medi onde é que o tempo estava
realmente a ser gasto.

## O que foi medido

**Processamento de imagem** (sharp, fotografia de 12MP, 8 MB): ~650ms
por fotografia, quase tudo na descodificação do JPEG original. Testei
uma alternativa — descodificar uma vez para um intermédio do tamanho
do preview e derivar dali a miniatura e o blurhash — e ganhou apenas
5% (654ms → 621ms). Não compensa a complexidade; o `.clone()` que já
existia estava a fazer o seu trabalho. **Não alterado.**

**Round trips de rede**: é aqui que estava o problema.

`supabase.auth.getUser()` não lê um cookie — faz um pedido de rede ao
servidor de autenticação (`GET /auth/v1/user`), confirmado no código do
`@supabase/auth-js`. E corria **duas vezes por pedido**: uma no
proxy/middleware, outra na própria rota.

Contando o caminho completo de uma fotografia (iniciar + concluir),
eram cerca de **20 idas à rede em série** antes de a resposta voltar.
Num envio de 50 fotografias, só a autenticação eram 200 round trips.

## Decisão

### 1. O middleware deixa de autenticar em `/api`

As rotas de API já criam o seu próprio cliente Supabase — que num
Route Handler consegue escrever cookies — e fazem a sua própria
autenticação. Passar pelo middleware primeiro duplicava o round trip
sem acrescentar garantia nenhuma.

Os cabeçalhos de segurança continuam a ser aplicados a tudo. As
páginas (incluindo o portão otimista de `/admin`) mantêm-se
inalteradas.

### 2. Consultas independentes passam a correr juntas

Em série, cada uma somava a sua latência à seguinte. Nenhuma destas
dependia do resultado da outra:

- `authorizeUpload`: sessão ∥ álbum — e corre **duas vezes** por
  fotografia (ao iniciar e ao concluir);
- `initiateUpload`: autorização ∥ contagem do álbum;
- `completeUpload`: ligação Google ∥ processamento da imagem ∥ marcação
  de "uploading" — as duas consultas passam a acontecer atrás dos
  ~650ms de CPU que iam correr de qualquer forma;
- fecho de `completeUpload`: `upload_jobs.update` ∥ `audit_logs`;
- `resolveAlbumSession`: fotografia de capa ∥ sessão em vigor — este
  está no caminho crítico de abrir a galeria, o primeiro pedido que o
  convidado faz.

A ordem das verificações mantém-se onde é observável: em
`authorizeUpload`, a sessão continua a ser avaliada antes do álbum,
para a mensagem de erro não passar a depender de qual respondeu
primeiro.

Somando tudo, o caminho de cada fotografia passa de ~20 idas à rede em
série para ~13.

### 3. As fotografias deixam de ser todas preparadas ao mesmo tempo

O achado com maior efeito na lentidão **sentida**, e não estava do lado
do servidor.

Ao selecionar 30 fotografias, arrancavam 30 `createImageBitmap` +
canvas em simultâneo. Num telemóvel isso é uma tempestade de memória e
CPU que trava a interface — e, pior, **nenhum envio podia começar
enquanto a primeira não terminasse**, porque todas disputavam o mesmo
processador. O convidado ficava a olhar para uma fila parada.

Passam a ser preparadas duas de cada vez, por ordem: a primeira fica
pronta quase de imediato e o envio arranca enquanto as restantes ainda
estão a ser preparadas.

## Verificação

`pnpm check` (278 testes, 1 novo) e `pnpm build`. Suite E2E completa
(20 testes).

O teste novo (`upload-queue.test.tsx`) mede a concorrência de pico da
preparação. Confirmei que **falha com o código antigo** — com o limite
a 99 acusa `expected 5 to be less than or equal to 2` — para não ser um
teste que passa por acaso.

Os restantes ganhos são de latência, não de comportamento observável:
a garantia relevante é os 278 testes existentes continuarem a passar
sem alteração, provando que paralelizar não mudou o que as funções
fazem.

## Limitações conhecidas

- Continua a haver uma chamada de autenticação por pedido de API (a da
  própria rota). Eliminá-la exigiria validar o JWT localmente com o
  segredo do projeto — mais superfície de risco do que me parece
  prudente a dias do evento.
- O envio continua a fazer dois pedidos por fotografia (iniciar +
  concluir). Juntá-los, ou pedir os "jobs" em lote, era o próximo
  ganho estrutural, mas muda o contrato do envio.
- `CLIENT_OPTIMIZE_MAX_EDGE` mantém-se em 2400px, acima dos 1600px que
  o preview precisa, para preservar detalhe no original guardado no
  Drive. Baixá-lo aceleraria os envios em rede móvel à custa da
  qualidade do arquivo — é uma escolha de produto, não uma afinação
  técnica, por isso fica por decidir.
