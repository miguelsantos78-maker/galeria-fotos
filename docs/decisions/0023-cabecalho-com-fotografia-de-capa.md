# 0023 — Cabeçalho com fotografia de capa

Data: 2026-08-04

## Contexto

Pedido do administrador, a partir de capturas de ecrã de outra
aplicação de casamento (a mesma referência da ADR 0022): o cabeçalho
devia poder usar uma fotografia como fundo, com o título sobre a
imagem. Antes de implementar, foi publicada uma pré-visualização
(artefacto HTML, sem tocar em código) com o mesmo sistema de cores e
tipografia da aplicação, iterada em várias rondas com o administrador
(tamanho de texto, posição, remoção de um desfoque a toda a largura
que cortava o texto) até chegar à versão aprovada: fotografia a
preencher o cartão todo, título e descrição sobre a imagem, dentro de
um painel com fundo semitransparente e desfoque.

## Decisão

### Dados: reaproveitar `cover_photo_id`, já existente

O álbum já tem `cover_photo_id` (secção 7) e a ação "Definir capa" já
existe no painel de administração (secção 10.4,
`updatePhotoModeration` com `setAsCover`). Faltava só expor essa
fotografia na resposta pública do álbum.

`server/use-cases/resolve-album.ts`: `PublicAlbumView` ganha
`coverPhotoUrl: string | null`. `resolveAlbumSession` resolve esse URL
com uma nova função `resolveCoverPhotoUrl`, que:

- devolve `null` se o álbum não tiver `cover_photo_id`;
- procura a fotografia (`PhotosRepository.findById`) e devolve `null`
  se não existir, estiver eliminada, ou ainda não tiver
  `preview_path` (processamento ainda a decorrer);
- gera um URL assinado de curta duração
  (`lib/media/preview-url.ts#createSignedPreviewUrls`, os mesmos 5
  minutos já usados na grelha — secção 5.4) só quando há um preview
  válido.

`ResolveDeps` ganha `photos` e `createSignedUrls`, injetados em
`app/api/albums/resolve/route.ts` a partir do cliente admin do
Supabase — o mesmo padrão já usado em
`app/api/albums/[albumId]/photos/route.ts`.

### Interface: fotografia + painel de texto desfocado

`components/gallery/album-resolver.tsx`: quando `album.coverPhotoUrl`
existe, o cabeçalho passa a ser a fotografia a preencher o cartão
(`h-72 sm:h-80`, `object-cover`), com um painel sobreposto
(`bg-surface/60` + `backdrop-blur-md`, inset a poucos pixels das
bordas) contendo o ornamento, o título e a descrição — o mesmo
"vidro fosco" da pré-visualização aprovada. Sem fotografia de capa,
mantém-se exatamente o cartão sólido introduzido na ADR 0022, sem
qualquer alteração.

`alt=""` na imagem: é decorativa — o título ao lado da imagem já
descreve o álbum por texto, por isso não faz sentido duplicar essa
informação num texto alternativo (WCAG 1.1.1, imagens puramente
decorativas podem ter `alt` vazio).

## Verificação

`pnpm check` completo (lint + typecheck + 206 testes — 4 novos em
`tests/unit/use-cases/resolve-album.test.ts`: sem capa → `null`; com
capa e preview válido → URL assinado correto; capa eliminada → `null`;
capa sem preview ainda → `null`) e `pnpm build`. Suite E2E (16 testes,
1 novo): renderiza a fotografia de capa com `alt=""` e passa no scan
de acessibilidade (`@axe-core/playwright`) também neste estado — não
só no estado sem fotografia, que já era coberto.

## Limitações conhecidas

- Sem otimização de formato/tamanho específica para o cabeçalho — usa
  o mesmo preview (1600 px, secção 13) já gerado para a grelha e o
  lightbox, não um recorte dedicado a proporções de cabeçalho.
- O administrador tem de definir a capa manualmente (painel →
  moderação → "Definir capa"); não há seleção automática da primeira
  fotografia enviada.
