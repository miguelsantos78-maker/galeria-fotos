# 0030 — Capa de largura total, filtro com rótulo de ação e resposta ao toque nos botões

Data: 2026-08-08

## Contexto

Pedidos de utilização sobre a galeria pública e a lightbox, depois de
usar a aplicação no telemóvel.

## Decisão

### 1. A fotografia de capa passa a ocupar a largura total

`components/gallery/album-resolver.tsx`. O cabeçalho com capa estava
dentro de um cartão centrado (`mx-auto max-w-2xl`, com moldura e
sombra), o que deixava margens laterais visíveis. Passa a ser de margem
a margem: sem padding lateral e sem largura máxima, a fotografia é o
elemento de abertura do álbum e ganha em ocupar o ecrã todo. O painel
de texto (vidro fosco) mantém-se sobre a fotografia, agora com um
recuo maior em ecrãs largos.

O cabeçalho **sem** capa não muda: continua a ser o cartão centrado,
que sozinho num ecrã largo ficaria estranho a ocupar tudo.

### 2. O botão de apresentação sai da galeria

O modo apresentação nunca teve pausa nem controlos (ADR 0025) e, num
álbum de casamento aberto no telemóvel, era sobretudo um botão a
ocupar espaço ao lado do filtro. Removido da grelha e, com ele, todo o
código que só existia para o servir: a prop `startInPresentationMode`
da lightbox, o `setInterval` de avanço automático e o estado
`presenting` da grelha. Não fica prop órfã nem caminho morto.

### 3. O filtro passa a descrever a ação, não o estado

"Só as minhas" era ambíguo: com um rótulo fixo, o utilizador tinha de
inferir pelo destaque de cor se o filtro estava ligado. O rótulo passa
a dizer o que acontece ao carregar - "As minhas fotos" filtra,
"Todas as fotos" volta a mostrar tudo.

Por isso mesmo o botão **deixa de ter `aria-pressed`**: esse atributo
pressupõe um rótulo fixo, e com rótulo variável o estado seria
anunciado duas vezes, de forma contraditória ("Todas as fotos,
premido"). O contador ao lado ("N fotografias suas") continua a
confirmar o estado, e é `aria-live`.

### 4. Resposta visível ao toque em todos os botões principais

Num telemóvel não existe `hover`, e praticamente todos os botões só
tinham `transition-colors` com um `hover:` - ou seja, ao toque não
davam sinal nenhum de terem sido registados. Todos os botões
principais passam a ter `transition active:scale-95`, com
`motion-reduce:active:scale-100` para quem pediu movimento reduzido
(secção 17): lightbox (fechar, setas, transferir, eliminar), filtro,
"carregar mais", voltar ao topo, botão de envio e os controlos de
cancelar/repetir da fila.

O botão de envio é um `<label>` e não um `<button>`, mas `:active`
aplica-se na mesma ao toque, por isso ganha o mesmo tratamento.

### 5. Corrigido: `.safe-top`/`.safe-bottom` anulavam o `pt-*`/`pb-*`

O pedido inicial era só "afastar o botão Fechar do topo". Aumentar o
`pt-*` não teve efeito nenhum, e a razão é uma armadilha real:
`.safe-top` e `.safe-bottom` estão definidas em `app/globals.css`
**fora de qualquer `@layer`**, e regras sem camada ganham sempre a
regras em camadas - incluindo a qualquer utilitário `pt-*`/`pb-*` do
Tailwind aplicado ao mesmo elemento, que passava a ser silenciosamente
ignorado.

Estavam nessa situação quatro elementos: a barra superior e a inferior
da lightbox, a barra fixa de envio e o cabeçalho sem capa. Em todos, o
espaçamento próprio nunca chegou a ser aplicado - só o inset do
sistema, que em ecrãs sem entalhe é zero.

Passam a usar um valor explícito que **soma** as duas coisas
(`pt-[calc(env(safe-area-inset-top)+2.5rem)]`), em vez de juntar as
duas classes. As utilidades mantêm-se para quem precisa só do inset (o
cabeçalho com capa), agora com um aviso no ficheiro a explicar a
restrição.

## Verificação

`pnpm check` (lint + typecheck + formatação + 220 testes) e
`pnpm build`. Suite E2E completa (18 testes). Verificação visual com
captura de ecrã em viewport de telemóvel (390x844), antes e depois -
foi assim que a causa do ponto 5 apareceu: com o `pt-10` já no código,
a captura mostrava o botão à mesma colado ao topo.

Testes atualizados:

- `tests/unit/lightbox.test.tsx` - os dois testes do modo apresentação
  dão lugar a um só, que garante o contrário: não há botão para o
  ligar e a lightbox não avança sozinha ao fim de 30 s.
- `tests/e2e/guest-album-flow.spec.ts` - o teste do filtro passa a
  seguir a troca de rótulo e a verificar o caminho de volta (voltar a
  "Todas as fotos" repõe a lista completa), em vez de verificar
  `aria-pressed`.

## Limitações conhecidas

- A animação de toque é uniforme (95% de escala) em botões de tamanhos
  muito diferentes; nos mais pequenos (cancelar envio, 16x16) usa-se
  90% para o efeito ser percetível.
- `CRON_SECRET` continua por confirmar em produção (ADR 0029): as
  Vercel Cron Jobs só correm em deployments de Production, por isso
  falta validar a definição de Production Branch do projeto.
