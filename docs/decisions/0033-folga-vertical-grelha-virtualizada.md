# 0033 — A folga vertical desaparecia ao passar para a grelha virtualizada

Data: 2026-08-10

## Contexto

Reportado com duas capturas de ecrã do mesmo álbum (61 fotografias):
nas primeiras linhas há uma folga clara entre fotografias, mas mais
abaixo as linhas ficam coladas verticalmente — só na vertical, a folga
horizontal entre colunas mantém-se.

## Decisão

### A causa: duas grelhas diferentes, e só uma cuidava da folga entre linhas

`VIRTUALIZE_THRESHOLD = 60` (`photo-grid.tsx`): até 60 fotografias
montadas, a galeria usa a grelha CSS simples
(`grid grid-cols-3 gap-0.5 ...`), onde `gap-0.5` separa tanto colunas
como linhas, porque é tudo um único `display: grid`. Acima de 60,
passa a `VirtualizedPhotoGrid`, que agrupa as fotografias em linhas e
só monta as visíveis — cada linha é o seu **próprio** `grid` de uma
única fila, posicionado com `position: absolute` + `translateY`
calculado pelo `@tanstack/react-virtual`.

`gap-0.5` continuava lá, mas sem efeito nenhum na vertical: dentro de
uma única linha não há "linha seguinte" para o `row-gap` do CSS Grid
criar espaço contra. E o `translateY` de cada linha vinha só da altura
medida/estimada da própria linha — sem nenhum valor a somar para a
folga entre uma linha e a seguinte. Resultado: linhas encostadas.

Isto explica exatamente o que as capturas mostram: com 61 fotografias,
a primeira página (50, tamanho de página da secção 16) ainda cabe na
grelha simples — folga normal. Ao carregar a página seguinte, o total
passa a 61 > 60, a grelha virtualizada assume o lugar, e a folga
vertical desaparece a partir daí.

### A correção

Cada linha ganha `pb-0.5` (exceto a última, para não sobrar uma folga
a mais antes do que vem a seguir), e a estimativa de altura usada antes
da primeira medição real (`estimatedRowHeight`) passa a somar
`GRID_GAP_PX`, para não haver um salto visível assim que a medição real
substitui a estimativa.

## Verificação

`pnpm check` (242 testes) e `pnpm build`. Suite E2E completa.

O teste "virtualiza a grelha para álbuns com muitas fotografias" ganhou
uma asserção de regressão: mede com `boundingBox()` real (não em jsdom,
que não calcula layout) a distância vertical entre a última fotografia
da primeira linha e a primeira da segunda. Confirmado empiricamente
antes de escrever o limiar: sem a correção, essa distância era `0.33px`
— tecnicamente positivo, por isso um `toBeGreaterThan(0)` não teria
apanhado a regressão —, e com a correção fica `2.33px`, o valor
esperado. O teste usa `toBeGreaterThan(1)`.

## Limitações conhecidas

- A folga só foi corrigida verticalmente; a horizontal nunca teve este
  problema (continua a vir do `gap-0.5` de cada linha).
