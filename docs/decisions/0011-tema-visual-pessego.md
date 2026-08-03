# 0011 — Tema visual: pêssego/terracota + tipografia serifada

Data: 2026-08-03

## Contexto

Pedido explícito do administrador: a interface estava "muito standard"
e devia adaptar-se ao estilo de um convite de casamento de referência
enviado por si (fundo claro, monograma e detalhes em pêssego/rosa,
tipografia serifada elegante para os nomes/data, grinalda floral em
traço fino, muito espaço em branco). Não foi possível confirmar se o
pedido era um tema global ou uma personalização por álbum antes de
avançar (pergunta feita ao administrador, sem resposta direta) —
decidiu-se pelo tema global, por ser a mudança mais direta e por a
app não ter (nem pedir, no `CLAUDE.md`) um mecanismo de personalização
visual por álbum; construir um seria uma funcionalidade nova maior,
não um ajuste de estilo.

## Decisões

### 1. Paleta "brand" trocada de azul para pêssego/terracota

`app/globals.css`: os tokens `--color-brand-50` a `--color-brand-950`
mudaram de uma escala azul/violeta para uma escala pêssego/terracota,
calculada a partir do tom do monograma do convite (matiz ~18°) com
verificação de contraste WCAG feita por script (fórmula de luminância
relativa) antes de aceitar os valores finais:

- `brand-600` (`#ba562c`, usado em botões/FAB com texto branco):
  contraste 4.71:1 com branco — passa AA (mínimo 4.5:1).
- `brand-700` (`#914322`, estado hover): 6.93:1.

Como todos os componentes já usavam classes Tailwind ligadas a estes
tokens (`bg-brand-600`, `hover:bg-brand-700`, `ring-brand-600`, etc.),
mudar só os valores no CSS aplicou a nova cor a toda a aplicação —
botões, FAB, foco de teclado, checkboxes — sem editar cada componente.

### 2. Tipografia serifada só nos títulos, sem-serifa mantida no resto

`app/layout.tsx`: adicionada a fonte `Playfair Display`
(`next/font/google`) como `--font-serif-display`, exposta em
`globals.css` como `--font-serif` (mesmo padrão já usado para
`--font-sans`/`--font-mono`), o que ativa a classe utilitária
`font-serif` do Tailwind.

Aplicada só aos títulos de página (`<h1>`) em todo o site — página
inicial, login, dashboard administrativo, lista de álbuns, detalhe de
álbum, integração Google Drive, PIN, galeria pública e página de
envio. O resto do texto (botões, listas, formulários, texto corrido)
manteve a Geist Sans. Combinação deliberada: um título serifado de
destaque sobre uma interface funcional em sans-serif é o mesmo
contraste que um convite impresso tem entre o nome do casal e o texto
mais pequeno — aplicar serifa a **tudo** (incluindo botões e listas)
prejudicaria a legibilidade funcional da aplicação.

### 3. Espaçamento

Aumentado o preenchimento vertical (`py-*`) dos cabeçalhos de página em
toda a aplicação (ex.: `py-12` → `py-14`, `py-24` → `py-28` na página
inicial) e alguns `gap`/`mt` entre título e subtítulo, para um ar menos
denso — sem alterar a estrutura do cabeçalho fixo/FAB da Fase anterior
(`docs/decisions/0010-redesenho-mobile-galeria.md`), que continua
otimizada para telemóvel.

### 4. Verificação

`pnpm check` (lint + typecheck + testes unitários) e a suite E2E
completa (15 testes, incluindo os scans `axe` de acessibilidade em
`/`, `/admin/login` e na galeria pública) confirmados a passar depois
da mudança — importante em particular para o contraste da nova cor,
que não é assumido, é testado.

## Limitações conhecidas

- Não foi possível confirmar com o administrador se o pedido original
  era tema global ou personalização por álbum — decisão tomada pela
  opção mais simples e coerente com o resto da app; se a intenção for
  mesmo um tema por álbum (ex.: cada evento com a sua paleta), fica
  como funcionalidade nova a pedir explicitamente (implica alterar o
  esquema de `albums` e a UI de administração).
- O vídeo de referência enviado pelo administrador não pôde ser
  analisado nesta sessão (sem capacidade de leitura de vídeo); a
  paleta e tipografia foram tiradas só da imagem estática do convite.
