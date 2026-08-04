# 0025 — Ajustes ao lightbox em slide

Data: 2026-08-04

## Contexto

Depois de implementar o lightbox em slide sobre a página desfocada
(ADR 0024), o administrador enviou uma captura de ecrã anotada com
seis pedidos concretos: remover o botão "Apresentação" da barra
superior, mover o contador de fotografias para a esquerda mantendo
"Fechar" à direita, dar mais espaço no topo (botões coladas ao bordo),
adicionar marcadores (bullets) em baixo, e suavizar bastante o
desfoque — a intenção expressa foi "o desfoque devia ser o fundo da
página anterior", ou seja, reconhecível como a própria página por
trás, não uma mancha escura genérica.

## Decisão

### Sem botão de ligar/pausar apresentação no diálogo

`components/gallery/lightbox.tsx`: removido o botão e o estado
`isPresenting` que só existia para o controlar. O modo apresentação
continua a existir (secção 10.1/22, ligado a partir do botão
"Apresentação" já existente acima da grelha, em
`components/gallery/photo-grid.tsx`) mas passa a ser inteiramente
determinado pela prop `startInPresentationMode` — sem toggle interno,
sem forma de pausar sem fechar o diálogo. Trade-off aceite
explicitamente: simplicidade da barra superior em troca de controlo
fino sobre uma apresentação já iniciada.

### Barra superior: contador à esquerda, mais respiro no topo

Com o botão "Apresentação" removido, `justify-between` com os dois
elementos que restam (contador, "Fechar") já os coloca exatamente
onde foi pedido — sem precisar de reposicionamento manual. Substituído
`py-3` por `pt-6 pb-3 sm:pt-8`, para além do `.safe-top` já existente
(que só cobre o entalhe/barra de estado, não dá folga visual por si
só).

### Marcadores em baixo, com limite

Novo `MAX_PHOTOS_FOR_DOTS = 12`. Um marcador por fotografia deixa de
fazer sentido a partir de algumas dezenas — um álbum de casamento
facilmente chega a uma ou duas centenas de fotografias, e uma fila
tão comprida de bolinhas ficaria ilegível ou partiria o layout. Os
marcadores só aparecem até esse limite; o contador "X / Y" (já
existente, sempre visível) continua a indicar a posição em qualquer
caso. Colocados dentro do mesmo contentor `.safe-bottom` que a barra
de ações (data/transferir/eliminar), para não duplicar a margem de
segurança da barra de gestos.

### Desfoque mais suave

`backdrop-blur-2xl` (40px) mais `bg-black/35` deu lugar a
`backdrop-blur-md` (12px) mais `bg-black/20` — bastante mais ténue, e
sobretudo mais reconhecível como a própria página desfocada por trás
(exatamente o pedido), em vez de uma mancha escura quase opaca.

## Verificação

`pnpm check` completo (lint + typecheck + 210 testes — 4 novos em
`tests/unit/lightbox.test.tsx`: ausência do botão de apresentação,
avanço automático continua a funcionar via `startInPresentationMode`
mesmo sem o botão, marcadores presentes com poucas fotografias,
marcadores ausentes acima do limite) e `pnpm build`. Suite E2E (16
testes) sem alterações necessárias. Confirmado visualmente com uma
captura de ecrã temporária.

Aproveitado para corrigir, à parte, um erro de `tsc --noEmit` já
existente (não relacionado com este pedido) que tinha escapado à
verificação da ADR 0023 — ver essa nota lá.

## Limitações conhecidas

- Sem forma de pausar uma apresentação a meio, só fechar (decisão
  deliberada, ver acima).
- O limite de 12 fotografias para mostrar marcadores é arbitrário —
  ajustável se, na prática, se revelar demasiado baixo ou alto.
