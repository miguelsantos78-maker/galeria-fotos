# 0022 — Cabeçalho em cartão + botão de envio flutuante

Data: 2026-08-04

## Contexto

O administrador enviou três capturas de ecrã de uma aplicação de
casamento diferente (aparenta ser "Ivy" ou semelhante), pedindo um
layout "idêntico". Essa referência tem uma estrutura bem mais ampla do
que a LiveGallery — contador "Happily married" com anos/meses/dias,
separador "Premium album", abas Memories/Planning/Recaps/convidados, e
categorias de sub-álbuns (Reception, Cocktails, Party, Brides) com
cartões horizontais.

Réplica "idêntica" implicaria copiar a aparência de um produto de
terceiros e construir funcionalidades novas fora do âmbito do MVP
(sub-álbuns por categoria, separador de planeamento, contador de
convidados — secção 25 do `CLAUDE.md`). Apresentadas ao administrador
as partes concretas da referência via `AskUserQuestion`; escolhidas
duas, explicitamente mais restritas: o estilo visual do cabeçalho/
cartões, e o botão de envio fixo em baixo. Não foram pedidos o
contador, as categorias/sub-álbuns nem as abas — não implementados.

## Decisão

### Cabeçalho como cartão flutuante

`components/gallery/album-resolver.tsx`: o cabeçalho deixa de ser uma
faixa de gradiente a toda a largura e passa a ser um cartão
arredondado (`rounded-card`, `border`, `shadow-md`) com margens
laterais, à semelhança dos painéis com sombra da referência. Mantém o
mesmo conteúdo de sempre — ornamento, título, descrição — só muda o
enquadramento.

### Botão de envio fixo em baixo

O painel "Adicionar fotografias" (ícone + título + descrição + botão,
sempre no topo da página) foi removido. `UploadQueue`
(`components/upload/upload-queue.tsx`) passa a renderizar-se a si
próprio como um grupo fixo no fundo do ecrã (`fixed inset-x-0
bottom-0`, com `.safe-bottom` para a barra de gestos): um botão em
pílula ("Escolher ou tirar fotografias", com ícone de câmara),
equivalente ao botão azul "Upload" da referência, mas na paleta
pêssego/terracota já estabelecida da aplicação (nunca as cores ou
marca de terceiros — secção 1 do `CLAUDE.md` já proíbe copiar
elementos visuais proprietários, ali sobre o Google Fotos, mas o
mesmo princípio aplica-se a qualquer produto de referência).

Quando há envios em curso, uma faixa horizontal com scroll
(miniaturas de 64×64 px) aparece por cima do botão, dentro do mesmo
grupo fixo — substituindo a grelha 3 colunas de miniaturas grandes que
existia antes. A um tamanho tão compacto deixou de caber texto nas
sobreposições de estado; os estados "A otimizar…"/"Na fila…" passam a
um ponto pulsante simples, e os estados de erro/duplicado passam a um
badge circular só com ícone (aviso âmbar para duplicado, "✕" vermelho
para erro genérico) — a explicação completa continua acessível via
`aria-label`/`title` em cada botão, e o toque continua a acionar a
mesma ação de sempre (tentar novamente / remover).

`PhotoGrid` ganha `padding-bottom` extra na página quando o envio está
disponível, para a última linha de fotografias não ficar escondida
atrás do botão fixo.

## Verificação

`pnpm check` completo (lint + typecheck + 202 testes — 3 testes de
`tests/unit/upload-queue.test.tsx` atualizados para procurar os
botões de erro/duplicado pelo `aria-label` em vez de texto visível,
já que essa informação deixou de estar em texto solto na miniatura
compacta) e `pnpm build`. Suite E2E (15 testes, incluindo o scan de
acessibilidade) atualizada — os dois testes que verificavam o título
"Adicionar fotografias" (que deixou de existir como heading) passam a
verificar apenas o texto do botão, já testado nesses mesmos casos.
Confirmado visualmente com uma captura de ecrã temporária em viewport
móvel (390×844).

## Limitações conhecidas

- Não inclui o contador de tempo, as categorias/sub-álbuns nem as abas
  de planeamento da referência — foram explicitamente excluídos pelo
  administrador ao escolher o âmbito desta mudança.
- As miniaturas compactas (64 px) já não mostram a mensagem de erro
  como texto visível, só em `aria-label`/`title` — aceitável para uma
  faixa transitória e secundária, mas é um trade-off de legibilidade
  imediata que vale registar caso volte a ser pedido mais detalhe
  visível ali.
