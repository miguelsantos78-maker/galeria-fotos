# 0041 — A galeria abre num pedido só, e as primeiras imagens deixam de esperar

Data: 2026-08-11

## Contexto

Segunda passagem sobre velocidade, depois da ADR 0040, com uma
restrição explícita: **não sacrificar a qualidade das imagens**. Fica
portanto de fora baixar `CLIENT_OPTIMIZE_MAX_EDGE` ou as qualidades de
compressão — que era o caminho fácil, e é o que se deixa de lado.

## O que foi medido

**Tamanho dos bundles**: 1,4 MB em bruto, mas ~65 KB comprimidos por
pedaço. Não é o problema; não mexido.

**Encadeamento do arranque**: era. Abrir um álbum eram **dois pedidos
em série** — resolver o link e só depois listar as fotografias — porque
o `albumId` só se conhece quando o primeiro responde. Nada aparecia no
ecrã antes de ambos terminarem.

## Decisão

### 1. A primeira página vem já com a resolução do link

`resolveAlbumSession` já tinha tudo o que a listagem precisa: o álbum,
as permissões e a função de assinar URLs. Passa a devolver
`initialPhotos`, e a grelha usa isso como `initialData` da sua query.

Abrir a galeria passa a ser **um pedido em vez de dois** — poupa uma
ida completa à rede, autenticação incluída, no caminho mais sensível de
todos: o primeiro ecrã que o convidado vê.

Para não pagar uma consulta redundante à `album_sessions` (a sessão
acabou de ser criada ou reaproveitada ali mesmo), `listPhotosForViewer`
foi partido em dois: a parte que vai buscar as permissões e a parte que
lista. `resolveAlbumSession` chama a segunda diretamente.

O `initialData` só semeia a vista por omissão. Com o filtro "as minhas
fotos" ligado a lista é outra e tem mesmo de ser pedida.

### 2. As primeiras imagens deixam de esperar pelo `lazy`

Todas as miniaturas tinham `loading="lazy"`, incluindo as que já estão
visíveis quando a galeria abre. `lazy` faz o browser esperar pelo
cálculo do layout antes de sequer começar a descarregar — o que é certo
para o que está fora do ecrã, e é exatamente o contrário do que se quer
para as imagens que dão a sensação de a página ter carregado.

As primeiras nove (o primeiro ecrã num telemóvel a 3 colunas, com
folga) passam a `eager` com prioridade alta. Nove e não mais: a partir
daí só fariam concorrência, por largura de banda, ao que ainda nem está
à vista. Na grelha virtualizada aplica-se à primeira linha, já que o
virtualizador só monta o que está perto de ser visto.

A fotografia de capa ganha o mesmo tratamento — é a maior imagem do
ecrã e a primeira que se vê, portanto é ela que decide quando a página
"parece" carregada.

Todas ganham `decoding="async"`: com dezenas de miniaturas a chegar ao
mesmo tempo, descodificá-las de forma síncrona bloqueia o scroll.

### 3. Uma fonte que era descarregada para nada

`Geist_Mono` estava declarada no layout e a sua variável CSS definida,
mas nenhum componente usa `font-mono` — verificado por pesquisa em todo
o `app/` e `components/`. Era um ficheiro de fonte a ser pedido em
todas as páginas sem nunca ser usado. Removida.

## Verificação

`pnpm check` (280 testes, 2 novos) e `pnpm build`. Suite E2E completa
(20 testes).

Testes novos em `resolve-album.test.ts`: a primeira página vem
preenchida (com URLs assinados) e vem vazia num álbum sem fotografias.

Os mocks E2E foram atualizados para devolverem a forma real da API —
e foram eles que apanharam a mudança de contrato, falhando com
"element(s) not found" antes de eu lhes tocar. Ao escrever o teste
unitário apanhei também que `makeAlbumRow` gera ids sequenciais, pelo
que as fotografias do fixture caíam noutro álbum; corrigido fixando o
id no `setup`.

## Limitações conhecidas

- A resposta da resolução ficou maior (inclui até 50 fotografias com
  URLs assinados, na ordem das dezenas de KB). É uma troca favorável:
  substitui um pedido que devolvia exatamente o mesmo conteúdo.
- A qualidade das imagens mantém-se intocada, por decisão explícita.
  `CLIENT_OPTIMIZE_MAX_EDGE` continua nos 2400px e as qualidades de
  compressão nos valores da secção 13.
- Continua a haver uma chamada de autenticação por pedido de API, e o
  envio continua a fazer dois pedidos por fotografia (ADR 0040).
