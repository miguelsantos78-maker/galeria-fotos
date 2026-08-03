# 0010 — Redesenho mobile da galeria pública e do envio

Data: 2026-08-03

## Contexto

A app é partilhada por link e usada sobretudo em telemóvel (secção 1 do
`CLAUDE.md`: "inspirada na experiência de um álbum partilhado do Google
Fotos"). A interface original das rotas `/a/[slug]` e
`/a/[slug]/upload` era funcional mas genérica — grelha masonry com
colunas CSS, fila de envio em lista de texto, sem cabeçalho fixo nem
otimização específica para toque/thumb-reach. Pedido explícito:
melhorar a experiência visual, mobile-first, seguindo os padrões gerais
de utilização do Google Fotos (grelha densa, lightbox de ecrã inteiro,
ação de adicionar bem alcançável).

Importante: seguiu-se apenas os **padrões gerais de interação**
(grelha quadrada densa, botão flutuante de ação principal, seletor
visual de fotografias em fila) — nenhum recurso visual, ícone, marca ou
código do Google Fotos foi copiado, conforme a proibição explícita da
secção 1.

## Decisões

### 1. Grelha quadrada densa em vez de masonry

`components/gallery/photo-grid.tsx`: substituída a grelha masonry
(`columns-2/3/4` + `break-inside-avoid`, alturas variáveis por foto)
por uma grelha CSS uniforme (`grid grid-cols-3/4/5/6`, `aspect-square`,
`object-cover`, `gap-0.5`) — cada miniatura é cortada a quadrado e a
grelha fica praticamente edge-to-edge em telemóvel. É o padrão mais
reconhecível de um álbum partilhado tipo Google Fotos e evita o salto
de layout imprevisível de colunas com alturas desiguais.

### 2. Cabeçalho fixo + botão de ação flutuante (FAB)

`components/gallery/album-resolver.tsx`: título/descrição do álbum
passam para um cabeçalho `sticky top-0` com fundo translúcido
(`backdrop-blur`), e o botão "Adicionar fotografias" passa de um botão
em linha no topo da página para um botão flutuante fixo
(`position: fixed`, canto inferior direito) — mantém-se sempre
alcançável com o polegar, independentemente do scroll na grelha,
seguindo o padrão de FAB do próprio Google Fotos para a ação principal
de um ecrã. O botão "Apresentação" ficou mais discreto (ícone + texto
pequeno, alinhado à direita, por cima da grelha) para não competir pelo
mesmo espaço.

### 3. Fila de envio com pré-visualização real, não lista de texto

`components/upload/upload-queue.tsx`: cada ficheiro selecionado gera
uma pré-visualização local (`URL.createObjectURL`, revogada no
desmonte do componente) mostrada numa grelha de miniaturas quadradas —
com sobreposição de progresso, marca de conclusão, ou motivo de erro
diretamente sobre a miniatura — em vez de uma lista com o nome do
ficheiro em texto. Replica o reconhecimento visual imediato ("photo
picker") em vez de obrigar a ler nomes de ficheiro (normalmente
`IMG_1234.jpg`, pouco úteis).

### 4. Áreas seguras (notch / barra de gestos)

`app/layout.tsx` ganhou `viewport.viewportFit = "cover"`; `globals.css`
ganhou utilitários `.safe-top`/`.safe-bottom`/`.fab-bottom` que leem
`env(safe-area-inset-*)`. Aplicados ao cabeçalho fixo, ao FAB e à
lightbox de ecrã inteiro — sem efeito em ecrãs sem notch/ilha dinâmica
(fica `0px`), mas evita conteúdo escondido atrás do hardware em
iPhones mais recentes.

### 5. Verificação visual

Sem um dispositivo real disponível nesta sessão, a verificação foi
feita com Playwright num viewport de telemóvel (390×844), com fotos de
teste geradas localmente (SVG em `data:` URI — nunca um recurso
externo) para confirmar visualmente a grelha, o FAB e a lightbox antes
de aceitar o resultado. A suite E2E completa (15 testes, incluindo o
scan de acessibilidade `axe`) foi corrida contra uma build de produção
limpa depois destas mudanças.

## Limitações conhecidas

- Não há um dispositivo físico para confirmar comportamento de
  `env(safe-area-inset-*)` num iPhone real — só a lógica CSS foi
  verificada.
- A fila de envio não foi testada com ficheiros reais nesta sessão
  (sem Supabase/Drive de produção acessíveis daqui); a lógica de
  pré-visualização/revogação de `ObjectURL` foi verificada por leitura
  e pelos testes automatizados existentes, não por um envio real.
