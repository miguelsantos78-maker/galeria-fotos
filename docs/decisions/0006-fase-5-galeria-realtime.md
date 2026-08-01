# 0006 — Fase 5: Galeria e realtime

Data: 2026-08-01

## Contexto

A Fase 5 pede grelha responsiva, paginação por cursor, lightbox,
subscrição Realtime, reconexão e fallback de refetch, e modo
apresentação (secção 22). Critério de saída: dois browsers no mesmo
álbum veem novas imagens sem recarregar. Este documento regista as
decisões tomadas, incluindo a implementação de dois endpoints que
tinham ficado deliberadamente por fazer nas Fases 3/4.

## Decisões

### 1. Realtime: nunca confiar no payload, só invalidar e refazer o pedido autorizado

`lib/realtime/use-photos-realtime.ts` subscreve `postgres_changes` em
`photos`, filtrado por `album_id`, mas o callback do evento nunca lê
`payload.new`/`payload.old` — só invalida a query
(`["albums", albumId, "photos"]`), que o `PhotoGrid` já usa via
`useInfiniteQuery`. Isto segue literalmente a secção 11 ("invalidar/
refazer a query relevante em vez de confiar cegamente no payload") e
evita ter de raciocinar sobre um caso genuinamente complicado: eventos
`DELETE` no Realtime do Supabase dependem de RLS ser avaliada sobre uma
linha que já não existe, o que nem sempre entrega o evento de forma
previsível. Como o refetch nunca depende do payload, um `DELETE`
"perdido" não é um problema de correção — o próximo refetch (por
evento ou pelo fallback periódico) converge sempre para o estado
correto.

Como a subscrição usa RLS (`photos_select_owner`/
`photos_select_visible_via_session`, secção 8) para decidir que eventos
chegam a cada cliente, não foi preciso escrever nenhuma política nova —
só uma migração a adicionar `photos` à publicação `supabase_realtime`
(`supabase/migrations/0005_realtime.sql`), vazia por omissão num
projeto Supabase novo.

### 2. Fallback de refetch periódico e indicador de ligação

`usePhotosRealtime` devolve `isConnected` (derivado do estado da
subscrição, `SUBSCRIBED` ou não). Enquanto `isConnected` for falso, um
`setInterval` de 15 segundos invalida a query na mesma — cobre tanto a
perda de ligação como uma eventual falha silenciosa do canal. A UI
mostra um aviso discreto ("Ligação em tempo real indisponível — a
atualizar periodicamente") só nesse estado, sem alarmar o utilizador
desnecessariamente quando tudo está a funcionar.

### 3. Dois endpoints que as Fases 3/4 tinham deixado explicitamente por implementar

- `GET /api/media/[photoId]/original` (secção 5.4/14): estava
  documentado como fora do âmbito da Fase 4 (agrupado em "Visualização
  de ficheiros"). Implementado agora como o endpoint que serve o botão
  "Transferir" do lightbox — `server/use-cases/media.ts#getOriginalForViewer`
  reutiliza o mesmo `DriveStorageProvider.getOriginalStream()` que já
  existia desde a Fase 3 sem consumidor. Nunca devolve um URL do Google
  nem um token; o Route Handler transmite os bytes diretamente
  (`Readable.toWeb()` para converter o stream Node em Web
  `ReadableStream`, a mesma divergência Node/Web já documentada na ADR
  0004), com `Cache-Control: private, no-store` — o acesso depende
  sempre da sessão de álbum atual, nunca de uma cópia em cache
  partilhada.
- A verificação de visibilidade replica exatamente a de
  `listPhotosForViewer` (Fase 4): `ready`, ou `pending_review` com
  permissão `moderate`. Uma fotografia fora disto devolve o mesmo
  `PHOTO_NOT_FOUND` genérico de uma fotografia inexistente — nunca
  revela se existe mas está escondida (secção 15).
- `albums.download_enabled` é respeitado mesmo com sessão válida:
  `ALBUM_DOWNLOAD_DISABLED` (403) quando desligado.

### 4. Estado "aberto" da lightbox é sempre derivado do URL, nunca de `useState` sincronizado por efeito

A primeira versão do `PhotoGrid` guardava o índice aberto em
`useState` e usava um `useEffect` para o abrir a partir de `?photo=...`
quando a lista carregava — e foi apanhado pelo ESLint
(`react-hooks/set-state-in-effect`, já visto na Fase 2/ADR 0003).
Corrigido eliminando esse estado: `openIndex` é sempre
`photos.findIndex((p) => p.id === searchParams.get("photo"))`, calculado
durante o render. Abrir uma fotografia (clique na grelha, ou o botão
"Apresentação") só chama `router.replace()` a atualizar `?photo=`; a
lightbox aparece porque o `openIndex` derivado deixa de ser `-1`, não
por um `setState` explícito. Isto também dá partilha de link interno
"a sério" — recarregar a página com `?photo=<id>` na URL abre
diretamente nessa fotografia.

Limitação aceite: se o URL for editado manualmente enquanto a lightbox
já está aberta (não através da própria navegação da lightbox), o
componente não remonta a meio — só reflete o novo `?photo=` na
próxima abertura. A navegação normal (setas, teclado, swipe, clique
noutra miniatura) não é afetada, porque atualiza sempre o URL a partir
de dentro da própria lightbox.

### 5. Grelha "masonry" com CSS `columns`, sem nova dependência

Em vez de uma biblioteca de masonry (adicionaria uma dependência não
justificada pela secção 4), a grelha usa `columns-2 sm:columns-3
md:columns-4` do Tailwind (CSS multi-column nativo) com
`break-inside-avoid` em cada item. Simples, responsivo, sem JavaScript
de layout — o único efeito secundário aceite é a ordem de leitura por
teclado (`Tab`) seguir a ordem do DOM, não necessariamente a posição
visual coluna a coluna, uma limitação conhecida desta técnica.

### 6. "Apresentação" como uma variante do lightbox, não um ecrã à parte

A secção 22 (Fase 5) pede "modo apresentação" como um item distinto da
lightbox, mas a secção 10.1 já descreve um botão "Apresentação" ao lado
de "Adicionar fotografias"/"Transferir". Em vez de duplicar toda a UI
de visualização, `Lightbox` aceita `startInPresentationMode`, que ativa
um `setInterval` de avanço automático (5 segundos), com um botão para
pausar/retomar — a mesma navegação por teclado/swipe continua
disponível. Respeita `prefers-reduced-motion` (secção 17): com essa
preferência ativa, o avanço automático simplesmente não arranca.
"Slideshow para ecrãs de evento" (secção 26) — loop contínuo,
não supervisionado, talvez com QR code — fica como evolução pós-MVP,
não confundir com este modo apresentação básico.

### 7. Ações do lightbox: só as disponíveis para convidados

A secção 10.2 lista "transferir, partilhar link interno, destacar ou
eliminar para administradores". Implementadas aqui: transferir (se
`downloadEnabled`) e partilhar link interno (copia o URL com
`?photo=<id>` para a área de transferência). "Destacar" e "eliminar"
são explicitamente de administrador e dependem de infraestrutura de
moderação que só a Fase 6 constrói (aprovar/ocultar/destacar) — fora
do âmbito desta fase, tal como a Fase 4 já tinha decidido não
implementar upload direto de administrador pela mesma razão.

### 8. Teste de componente real, finalmente a usar o `@vitest-environment jsdom` por ficheiro

A Fase 4 (ADR 0005, decisão 11) já tinha preparado
`vitest.config.mts` para permitir jsdom por ficheiro quando um teste
precisasse mesmo de DOM. `tests/unit/lightbox.test.tsx` é o primeiro a
usar isso: renderiza `<Lightbox>` com `@testing-library/react` e testa
navegação por teclado (setas, `Escape`), foco inicial no botão
"Fechar", e a presença condicional do botão "Transferir" — sem afetar
o ambiente `"node"`, mais rápido, do resto da suíte.

## Limitações conhecidas

- Sem testes de integração contra um projeto Supabase real com Realtime
  ativo (mesma limitação de ambiente das fases anteriores — sem Docker
  neste sandbox). A subscrição foi validada por leitura e pela
  documentação oficial do `@supabase/supabase-js`; o critério de saída
  ("dois browsers... sem recarregar") só pode ser confirmado
  manualmente com um projeto Supabase real ligado.
- Sem paginação/pré-carregamento fora da primeira página quando se abre
  a lightbox a partir de um link `?photo=<id>` de uma fotografia que
  esteja além da primeira página carregada — nesse caso a lightbox
  simplesmente não encontra a fotografia até o utilizador carregar mais
  páginas. Aceitável para o volume esperado (a secção 16 já assume
  lotes de 50).
- Sem testes E2E Playwright multi-browser para o critério de saída
  literal (dois browsers a ver a mesma atualização) — precisaria de um
  projeto Supabase de teste real, fora do âmbito desta sessão.
