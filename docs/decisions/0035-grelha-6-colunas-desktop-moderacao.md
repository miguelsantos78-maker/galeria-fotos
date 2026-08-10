# 0035 — Grelha de moderação a 6 colunas em ecrãs largos

Data: 2026-08-10

## Contexto

Print do painel de administração (~1860px de largura) mostrando a
listagem de fotografias presa a 3 colunas, com uma faixa enorme de
espaço vazio à direita — o contentor da página tinha `max-w-3xl`
(768px) e a grelha não ia além de `sm:grid-cols-3`, por isso nenhum
dos dois crescia com o ecrã.

Confirmado com o pedido: a mudança é só para ecrãs largos
(desktop/tablet) — o telemóvel mantém-se como está.

## Decisão

`components/admin/album-detail.tsx`: o contentor da página passa de
`max-w-3xl` para `max-w-6xl` (1152px). O cabeçalho e os links de
partilha continuam confortáveis nessa largura, por usarem linhas com
`flex-wrap` em vez de texto corrido que ficasse incomodamente largo.

`components/admin/photo-moderation.tsx`: a grelha (e os marcadores de
carregamento, para não haver um salto quando as fotografias reais
chegam) ganham a mesma progressão de colunas que a galeria pública já
usa (`photo-grid.tsx`) — `grid-cols-2` (telemóvel) →
`sm:grid-cols-3` → `md:grid-cols-4` → `lg:grid-cols-6` (1024px+,
desktop/tablet largo).

## Verificação

`pnpm check` (250 testes) e `pnpm build`. Suite E2E completa (18
testes) — nenhum teste fixava o número de colunas, por isso nada
partiu.

Verificação visual com capturas de ecrã reais (1440px e 390px),
através de uma página temporária fora de `/admin` (as rotas
administrativas exigem sessão real, gerida pelo `proxy.ts` — não há
forma de as alcançar sem autenticação neste ambiente). Confirmado: 6
colunas sem espaço morto em ecrã largo, 2 colunas inalteradas em
telemóvel. Página apagada depois da verificação, sem chegar a ser
submetida.

## Limitações conhecidas

- Sem teste automatizado a fixar o número de colunas por breakpoint —
  a mesma limitação que já existia para a galeria pública, cuja
  verificação também é sempre visual.
