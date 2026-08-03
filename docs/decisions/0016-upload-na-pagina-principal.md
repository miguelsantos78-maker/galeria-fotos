# 0016 — Envio de fotografias integrado na página principal do álbum

Data: 2026-08-03

## Contexto

Pedido direto do administrador: eliminar o ecrã dedicado de envio
(`/a/[slug]/upload`) e tornar possível enviar fotografias logo no
primeiro ecrã (a página do álbum), para a aplicação ser "simples de
utilizar" — sem uma navegação extra só para chegar ao envio.

## Decisão

- `components/gallery/album-resolver.tsx` passa a incluir o
  `UploadQueue` (`components/upload/upload-queue.tsx`, já existente e
  inalterado na sua lógica interna) diretamente na página do álbum,
  dentro do cartão "Adicionar fotografias" — sem precisar de navegar
  para lado nenhum. `UploadQueue` já só precisa do `albumId`, que a
  página do álbum já tem disponível depois de resolver o link.
- `app/(public)/a/[slug]/upload/page.tsx` deixa de renderizar um ecrã
  próprio — passa a redirecionar (`redirect()`) para `/a/[slug]`, só
  para não partir marcadores/links antigos apontados para esse
  caminho.
- `components/upload/upload-page.tsx` (o ecrã dedicado) foi removido.

## Efeito colateral positivo

O `UploadQueue`, ao concluir um envio, já invalidava a query
`["albums", albumId, "photos"]` que o `PhotoGrid` usa — como os dois
componentes ficam agora na mesma página, o utilizador vê a fotografia
enviada a aparecer na grelha por baixo sem sair do sítio onde está,
sem precisar de "voltar ao álbum" (esse link deixou de fazer sentido
e foi removido).

## Acessibilidade

O título "Adicionar fotografias" passou de parágrafo a `<h2>` (estava
como texto normal, sem hierarquia semântica) — hierarquia de
cabeçalhos correta (`h1` = título do álbum, `h2` = secção de envio) e
permite navegação por cabeçalhos com leitor de ecrã.

## Verificação

`pnpm check` completo e suite E2E (15 testes) a passar — os dois
testes que verificavam um `<a>` com o texto "Adicionar fotografias"
foram adaptados para verificar antes o cabeçalho da secção e o
seletor de ficheiros, já que deixou de haver navegação para outro
ecrã. O scan de acessibilidade (`axe`) sobre a página do álbum passa a
cobrir também o formulário de envio, por estar agora na mesma página.
