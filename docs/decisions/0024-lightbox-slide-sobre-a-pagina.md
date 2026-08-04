# 0024 — Lightbox em slide, sobre a própria página

Data: 2026-08-04

## Contexto

Pedido do administrador, a partir de uma captura de ecrã da mesma
aplicação de referência das ADRs 0022/0023: o visualizador de
fotografias (lightbox) devia abrir "em slide", com a fotografia
anterior/seguinte a espreitar dos lados, em vez de uma fotografia
sozinha a ocupar o ecrã inteiro. Direção confirmada em duas rondas de
pré-visualização (artefacto HTML, sem tocar em código): primeiro só o
carrossel com espreitadela, depois pedido explícito para o carrossel
abrir sobre a própria página do álbum (cabeçalho e grelha visíveis,
desfocados por trás) em vez de um ecrã preto à parte.

## Decisão

### Fundo: véu semitransparente desfocado, não preto sólido

`components/gallery/lightbox.tsx`: o `<div role="dialog">` de ecrã
inteiro passa de `bg-black/95` para `bg-black/35 backdrop-blur-2xl`.
Como o diálogo é `position: fixed` por cima do resto da página (não um
portal para fora da árvore), o `backdrop-filter` desfoca o que já lá
estava por trás — o cabeçalho com a fotografia de capa (ADR 0023) e a
grelha — sem precisar de qualquer estado ou lógica nova: é
literalmente o mesmo mecanismo visual do painel de texto sobre a
fotografia de capa, aplicado agora ao fundo inteiro do diálogo.

### Espreitadela: só 3 fotografias desenhadas de cada vez

Novo `VISIBLE_OFFSETS = [-1, 0, 1]`. Em vez de mapear todas as
fotografias do álbum (podem ser dezenas), só a atual e as duas
vizinhas imediatas chegam a ser desenhadas, posicionadas com
`transform: translateX` relativo ao deslocamento (`offset * 88%`) e
`scale(0.85)`/opacidade reduzida para as vizinhas — a mesma técnica
da pré-visualização aprovada. As vizinhas ganham `aria-hidden="true"`
(são só uma pista visual, não conteúdo navegável) e a imagem central
mantém o `alt` descritivo; as vizinhas têm `alt=""` para não
duplicarem informação para leitores de ecrã.

`object-contain` (não `object-cover`): mantém-se o comportamento já
existente de "imagem ajustada ao ecrã, sem cortar" (secção 10.2) —
mudou o enquadramento (cartão em vez de ecrã inteiro), não o
tratamento da própria fotografia.

### Sem pontos de paginação

A pré-visualização mostrava pontos (um por fotografia) para 3
fotografias de exemplo; num álbum real, com potencialmente dezenas ou
centenas de fotografias, uma fila de pontos deixaria de ser legível ou
útil. Mantido o contador "X / Y" já existente na barra superior, que
já cumpre esse papel de forma acessível (`aria-live="polite"`) e
escalável.

### O resto fica igual

Navegação por teclado/arrastar/setas, modo apresentação,
transferir/eliminar, foco preso no diálogo, e a integração com
`PhotoGrid`/tempo real — nada disto mudou, só a estrutura visual da
área central e o fundo do diálogo.

## Verificação

`pnpm check` completo (lint + typecheck + 206 testes — os 13 testes
existentes de `tests/unit/lightbox.test.tsx` continuam a passar sem
alterações, porque consultam por `role`/texto acessível, não por
classes CSS) e `pnpm build`. Suite E2E (16 testes) sem alterações
necessárias. Confirmado visualmente com uma captura de ecrã
temporária: fotografia atual em cartão arredondado ao centro, vizinhas
a espreitar dos lados, cabeçalho e grelha visíveis (desfocados) por
trás do diálogo.

Também corrigido, à parte, um erro de `tsc --noEmit` já existente em
`tests/e2e/guest-album-flow.spec.ts` (`coverPhotoUrl: null` sem
alargamento de tipo `string | null`) que tinha escapado à verificação
da ADR 0023 — o `next build` não o apanhou por não incluir os testes
E2E no seu typecheck, só `pnpm typecheck` (`tsc --noEmit` a
verificar o projeto inteiro) o revela.

## Limitações conhecidas

- Sem pontos de paginação (deliberado, ver acima) — a única pista de
  posição é o contador de texto.
- As fotografias vizinhas ficam com `pointer-events-none`: não é
  possível tocar diretamente numa delas para saltar para lá (continua
  a exigir seta/swipe/teclado) — manter simples para esta primeira
  versão; pode reconsiderar-se se vier a ser pedido.
