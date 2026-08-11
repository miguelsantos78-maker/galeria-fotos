# 0039 — Auditoria: largura de banda, limites e o que falhava em silêncio

Data: 2026-08-10

## Contexto

Segunda metade da auditoria (a primeira, com os dois achados críticos,
está na ADR 0038). Mesmo enquadramento: mais de 100 pessoas e mais de
1000 fotografias.

O fio comum entre estes cinco pontos é que **nenhum deles dava erro**.
Todos degradavam em silêncio: uma lista truncada sem aviso, uma
proteção desligada sem o dizer, tráfego a repetir-se sem razão.

## 1. Largura de banda: as miniaturas eram descarregadas de novo a cada visita

O maior desperdício, e não era óbvio.

Cada URL assinado do Supabase leva um `?token=<JWT>` com a sua própria
expiração embutida, por isso **muda a cada assinatura**. Um URL
diferente é uma chave de cache diferente: o browser voltava a
descarregar todas as miniaturas a cada abertura da galeria, mesmo
tendo-as acabado de ver. Num álbum de mil fotografias vistas por uma
centena de convidados, essa repetição sozinha chega para esgotar o
tráfego mensal do plano gratuito.

Duas correções que só funcionam em conjunto:

- **`lib/media/preview-url.ts`** passa a reaproveitar URLs assinados
  entre pedidos (memória da instância, tal como o cliente Redis do rate
  limiting), enquanto lhes sobrar mais de 10 minutos de validade. É o
  que torna a chave de cache estável.
- **`lib/media/preview-storage.ts`** grava os derivados com
  `cacheControl` de um ano em vez da hora por omissão. Os derivados são
  imutáveis: o caminho inclui o `photoId` e nunca é reescrito.

Reaproveitar não alarga o acesso: já se entregavam URLs de uma hora, e
um reaproveitado tem sempre menos tempo de vida pela frente do que um
acabado de emitir.

## 2. `listForAlbumIds` truncava nas 1000 linhas, sem o dizer

O PostgREST impõe um teto de linhas por resposta (`max-rows`, 1000 por
omissão no Supabase) e **não sinaliza** que truncou. Uma consulta sem
`range` a um álbum com mais de 1000 fotografias devolvia as primeiras
1000 e mais nada.

Quem consome isto é a sincronização com o Drive — que trata ausência
como eliminação. Uma lista truncada era exatamente o input que a
salvaguarda da ADR 0038 recusa; melhor ainda é não a truncar de todo.
Passa a paginar em voltas de 500.

## 3. O rate limiting podia estar desligado sem ninguém saber

`lib/security/rate-limit.ts` desliga-se sozinho sem
`UPSTASH_REDIS_REST_URL`/`TOKEN` — sensato em desenvolvimento, mas em
produção é uma ausência de proteção que ninguém escolheu
conscientemente. A única pista de que não existia era não haver pista
nenhuma.

Passa a registar um aviso em produção (uma só vez, não a cada pedido),
e `/api/health` passa a devolver dois booleanos: `rateLimiting` e
`scheduledMaintenance`. Só "está configurado?", nunca valores nem
comprimentos de segredos — é isso que mantém o endpoint seguro em
aberto. Os dois foram escolhidos por falharem ambos em silêncio: sem
`CRON_SECRET`, a manutenção diária também nunca corre.

## 4. `album_sessions` crescia a cada abertura de link

`useResolveAlbum` resolve o link a cada montagem do componente, e
`resolveAlbumSession` inseria sempre uma linha nova. Abrir a galeria,
atualizar a página e saltar para o envio eram três linhas para
descrever o mesmo acesso; com uma centena de convidados ao longo de um
dia, milhares.

Passa a reaproveitar a sessão em vigor. Só insere quando não há
nenhuma válida, ou quando a que existe já não reflete o estado atual —
permissões alteradas entretanto (upload desligado a meio), ou um link
diferente do que a criou. Sem essa condição, uma sessão antiga deixaria
o convidado com mais acesso do que o link atual concede.

## 5. Sem teto de fotografias por álbum

Nada impedia envios em ciclo. `MAX_PHOTOS_PER_ALBUM` (5000 por
omissão) dá folga larga sobre as 1000 esperadas — não é para
restringir o uso normal, é para um cliente descontrolado não conseguir
encher a conta sozinho antes de alguém reparar.

Verificado em `initiateUpload`, o passo barato: chumbar em
`completeUpload` seria gastar a rede e o Drive exatamente naquilo que o
limite existe para poupar.

## Verificação

`pnpm check` (277 testes, 10 novos) e `pnpm build`. Suite E2E completa
(20 testes).

Testes novos:

- `preview-url.test.ts` — o mesmo caminho devolve o mesmo URL em
  pedidos seguidos; só assina o que falta; volta a assinar perto da
  expiração; não assina duas vezes um caminho repetido.
- `resolve-album.test.ts` — três resoluções seguidas dão uma linha só;
  permissões diferentes forçam uma sessão nova; convidados diferentes
  continuam separados.
- `uploads.test.ts` — o teto recusa e, importante, recusa **antes** de
  criar o `upload_job`.

O typechecker apanhou sozinho todos os sítios a atualizar quando
`initiateUpload` passou a precisar do repositório de fotografias — que
é precisamente o valor de os `deps` serem explícitos.

## Limitações conhecidas

- O reaproveitamento de URLs vive na memória da instância: instâncias
  serverless novas começam vazias. Não há garantia de acerto, só
  probabilidade — que é o suficiente, porque o pior caso é o
  comportamento anterior.
- O `cacheControl` de um ano só se aplica a derivados gravados a partir
  de agora; os previews já existentes mantêm a hora com que foram
  gravados até serem reprocessados.
- Fica por tratar o download de originais através da função (10 MB numa
  rede móvel lenta contra um limite de 60 s). Precisa de redirecionar
  para um URL temporário do Drive em vez de transmitir pela função, o
  que muda o modelo de autorização — não é uma afinação, é uma decisão
  de arquitetura, e não me pareceu prudente tomá-la a dias do evento.
