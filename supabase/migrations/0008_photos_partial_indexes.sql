-- LiveGallery: índices parciais para as consultas quentes de "photos".
--
-- Praticamente todas as leituras de "photos" filtram por
-- "deleted_at is null" (galeria pública, painel de administração,
-- contagens do dashboard, deteção de duplicados) — mas nenhum dos
-- índices existentes incluía essa condição, por isso o Postgres tinha
-- de percorrer também as linhas já eliminadas antes de as descartar.
--
-- Índices PARCIAIS (com "where deleted_at is null"): além de guiarem
-- melhor estas consultas, ocupam menos espaço do que os equivalentes
-- completos, por só indexarem as linhas que a aplicação realmente lê.
-- Substituem os índices anteriores, que passam a ser redundantes.

-- Galeria pública: paginação por cursor sobre sort_order, filtrada por
-- álbum e estado (server/repositories/photos-repository.ts#listVisibleForAlbum).
create index photos_album_status_sort_active_idx
  on public.photos (album_id, status, sort_order desc)
  where deleted_at is null;

drop index if exists public.photos_album_status_sort_idx;

-- Painel de administração, ordenação por omissão (listForOwner) e
-- "uploads recentes" do dashboard (listRecentForAlbumIds). Substitui o
-- índice criado na migração 0007, que não era parcial.
create index photos_album_uploaded_active_idx
  on public.photos (album_id, uploaded_at desc)
  where deleted_at is null;

drop index if exists public.photos_album_uploaded_idx;

-- Painel de administração, ordenação alternativa por data de captura.
create index photos_album_captured_active_idx
  on public.photos (album_id, captured_at desc)
  where deleted_at is null;

drop index if exists public.photos_album_captured_idx;

-- Deteção de duplicados no envio (findByAlbumAndSha256), que também
-- filtra por deleted_at is null.
create index photos_album_sha256_active_idx
  on public.photos (album_id, sha256)
  where deleted_at is null;

drop index if exists public.photos_album_sha256_idx;
