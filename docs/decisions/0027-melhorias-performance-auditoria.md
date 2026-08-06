# 0027 — Melhorias de performance da auditoria (0026)

Data: 2026-08-05

## Contexto

Continuação da auditoria da ADR 0026: o administrador pediu para
avançar com os quatro itens de performance maiores, deixados por
decidir nesse commit.

## Decisão

### 1. `processImage` deixa de descodificar o original três vezes

`lib/media/process-image.ts#renderDerivatives`: preview, thumbnail e
blurhash partiam cada um de um `sharp(original)` independente — três
descodificações completas do mesmo ficheiro (até `MAX_INPUT_PIXELS`).
Passa a existir uma única pipeline base (`sharp(original).rotate()`),
com `.clone()` para cada uma das três saídas — o padrão que a própria
documentação do sharp recomenda para "criar múltiplas saídas a partir
de uma única entrada, lida uma só vez". Reduz CPU/tempo de cada envio,
mais visível em ficheiros maiores.

### 2. `staleTime` por omissão no React Query

`app/providers.tsx`: `new QueryClient()` sem opções usa
`staleTime: 0` — todos os dados ficam imediatamente "obsoletos",
refazendo o pedido em cada remontagem ou regresso à aba. Passa a
existir um `staleTime` global de 15 segundos. Uma invalidação
explícita (mutação, evento de tempo real) continua sempre a refazer o
pedido de imediato — `staleTime` só limita os _refetches automáticos_
implícitos.

Adicionalmente, `components/gallery/photo-grid.tsx` desliga
`refetchOnWindowFocus` só nessa consulta — o tempo real (com fallback
periódico de 15s) já a mantém atualizada, tornando o refetch ao voltar
à aba puramente redundante ali.

### 3. Invalidação de tempo real com debounce

`lib/realtime/use-photos-realtime.ts`: cada evento `postgres_changes`
invalidava a consulta de imediato — e invalidar uma consulta paginada
(`useInfiniteQuery`) refaz _todas_ as páginas já carregadas, não só a
mais recente, para as manter consistentes entre si. Numa rajada de
envios (vários convidados a enviar fotos ao mesmo tempo durante o
evento), isso disparava essa cascata inteira uma vez por fotografia.
`invalidate()` passa a esperar 800ms de pausa nos eventos antes de
invalidar — uma rajada inteira passa a provocar uma única invalidação.

### 4. Grelha virtualizada por linhas, acima de 60 fotografias

Novo `@tanstack/react-virtual` (^3.14.9, MIT, mesma organização do
`@tanstack/react-query` já usado, compatível com React 19) — justifica
a nova dependência (secção 24, regra 7 do `CLAUDE.md`) por ser mantida
pela mesma equipa de uma dependência já confiada no projeto, e por
implementar exatamente o que a secção 16 do `CLAUDE.md` já previa:
"virtualizar a grelha quando o número de fotografias justificar".

`components/gallery/virtualized-photo-grid.tsx`: virtualiza por
_linha_, não por fotografia — as fotografias continuam agrupadas em
linhas do mesmo tamanho que a grelha CSS responsiva desenharia
(`useColumnCount` espelha em JavaScript os pontos de quebra do
Tailwind já usados: 3/4/5/6 colunas), e cada linha usa a mesma grelha
CSS de sempre por dentro — só decide que linhas chegam a montar-se no
DOM, com `useWindowVirtualizer` (a página inteira é que tem scroll,
não um contentor à parte) e `measureElement` para a altura real de
cada linha corrigir a estimativa inicial.

`components/gallery/photo-grid.tsx`: só ativa a virtualização acima de
`VIRTUALIZE_THRESHOLD = 60` fotografias — abaixo disso, continua a
grelha simples de sempre (`grid` direto, sem `@tanstack/react-virtual`
envolvido), risco zero para o caso comum (a maioria dos álbuns). A
sentinela do scroll infinito (`IntersectionObserver`) não precisou de
nenhuma alteração — a posição dela na página depende da altura total
reservada pelo contentor virtualizado (`getTotalSize()`), não do
número de nós DOM realmente montados.

`useMounted()` (via `useSyncExternalStore`, não `useState` +
`useEffect`) garante que a virtualização só liga depois de montado no
cliente — nunca durante a geração no servidor, para não arriscar
`useWindowVirtualizer` a tocar em `window` nesse passo; o
`eslint-plugin-react-hooks` já sinaliza `useState`+`useEffect` só para
isto como o anti-padrão a evitar, daí a escolha direta por
`useSyncExternalStore`.

## Verificação

`pnpm check` completo (lint + typecheck + 214 testes — 4 novos em
`tests/unit/use-photos-realtime.test.tsx`, cobrindo o debounce numa
rajada e o cancelamento ao desmontar; os 5 testes de
`process-image.test.ts` continuam a passar com `.clone()`) e
`pnpm build`. Suite E2E (17 testes, 1 novo): simula um álbum com 90
fotografias, confirma que só uma fração chega a montar-se no DOM (a
prova de que a virtualização está mesmo ativa) e que continua possível
abrir o lightbox a partir de uma fotografia virtualizada. Confirmado
visualmente com capturas de ecrã antes/depois de fazer scroll — sem
sobreposições nem espaços em branco.

## Limitações conhecidas

- O limite de 60 fotografias para ativar a virtualização é arbitrário,
  tal como o limite de 12 para os marcadores do lightbox (ADR 0025) —
  ajustável se, na prática, se revelar demasiado baixo ou alto.
- `getDashboardStats` (painel de administração) continua a carregar
  todas as fotos do dono para memória só para contar — já documentado
  no próprio código como simplificação do MVP; fora do âmbito desta
  auditoria, que se concentrou na galeria pública.
