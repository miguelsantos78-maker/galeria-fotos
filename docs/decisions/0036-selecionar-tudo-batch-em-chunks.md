# 0036 — "Selecionar tudo" no BO, e ações em lote divididas em pedidos mais pequenos

Data: 2026-08-10

## Contexto

Pedido para tornar mais fácil eliminar fotografias no painel de
administração. A seleção múltipla já existia (checkbox por fotografia

- Aprovar/Ocultar/Eliminar em lote), mas só dava para marcar uma a uma
  — eliminar um álbum inteiro (ou a maior parte dele) obrigava a clicar
  em cada checkbox.

## Decisão

### "Selecionar tudo"

Botão sempre visível junto ao título "Fotografias", mesmo sem nenhuma
fotografia marcada — é o ponto de partida para limpar um álbum
inteiro, não só um atalho para quem já tinha começado a marcar.

Como a listagem agora pagina a partir das 20 (ADR 0034), "selecionar
tudo" tem de carregar primeiro as páginas que ainda faltarem — senão
só selecionava o que já estava montado no ecrã. `fetchNextPage()`
devolve uma promessa com o resultado já atualizado, e o ciclo usa esse
valor para decidir se continua, em vez de uma referência presa ao
momento em que a função foi criada (o erro óbvio a cometer aqui,
porque `hasNextPage` lido do fecho léxico nunca mudaria dentro do
mesmo ciclo).

### Ações em lote deixam de ser um único pedido

Um administrador que selecione centenas de fotografias e prima
"Eliminar" estava prestes a mandar um único `POST` com centenas de
IDs. `batchModeratePhotos` corre cada fotografia sequencialmente
(secção 16, para não rajar a API do Drive) — nada garantia que um
pedido assim coubesse no tempo máximo de execução da função antes de
a Vercel o cortar a meio, sem indicação nenhuma de quantas tinham
realmente sido processadas.

Cada ação em lote passa a dividir-se em pedidos de 25 fotografias,
correndo um de cada vez, com o progresso visível ("A processar 40 de
61…") em vez de um botão só desativado. As falhas de todos os chunks
somam-se numa única mensagem no fim. O endpoint
`/api/albums/[albumId]/photos/batch` ganha também `maxDuration = 60`
(o mesmo valor já usado no envio, ADR anterior) como rede de segurança
do lado do servidor — o limite de 25 do cliente já devia bastar, mas
o valor máximo aceite pelo schema continua a ser 200.

`useMutation` para as ações em lote dá lugar a uma função assíncrona
simples: com vários pedidos sequenciais e progresso a meio, o modelo
de uma mutação só (pendente → sucesso/erro) já não descrevia bem o que
estava a acontecer.

## Sobre o Google Drive vs. Supabase

Questão que surgiu a par deste pedido: os originais **estão** a ir
para o Google Drive, não para o Supabase — confirmado a ler
`server/use-cases/uploads.ts`: o envio ao Drive (`uploadOriginal`)
acontece antes de qualquer escrita no Supabase Storage, e só continua
se tiver sucesso. O que fica no Supabase Storage (bucket privado
`photo-previews`) são só os derivados comprimidos — um preview WebP
com 1600px de lado máximo e uma miniatura com 480px (`PREVIEW_MAX_EDGE`/
`THUMBNAIL_MAX_EDGE`, `lib/env.ts`), tipicamente uma fração pequena do
tamanho do original de uma fotografia de telemóvel. É a arquitetura
descrita na secção 5.1 do `CLAUDE.md`: Drive para originais, Supabase
Storage só para os previews que a grelha e as miniaturas precisam.

## Verificação

`pnpm check` (254 testes, 4 novos) e `pnpm build`.

Testes novos em `tests/unit/photo-moderation.test.tsx`:

- "Selecionar tudo" marca todas as fotografias já carregadas;
- "Selecionar tudo" carrega primeiro as páginas em falta, antes de
  selecionar;
- uma seleção de 30 fotografias divide-se em dois pedidos (25 + 5), não
  um só;
- as falhas de vários chunks somam-se numa mensagem final.

Verificação visual (1440px) através de uma página temporária fora de
`/admin` (as rotas administrativas exigem sessão real — ver ADR 0035):
confirmado "Selecionar tudo"/"Limpar seleção" lado a lado, todas as
fotografias marcadas depois do clique, e a barra de ações a mostrar a
contagem certa. Página apagada depois da verificação, sem chegar a ser
submetida.

## Limitações conhecidas

- Sem confirmação intermédia durante o processamento em chunks — se o
  administrador fechar a página a meio de uma eliminação grande, os
  chunks já enviados ficam concluídos e os restantes não chegam a
  correr (nem ficam pendentes: cada chunk é independente).
