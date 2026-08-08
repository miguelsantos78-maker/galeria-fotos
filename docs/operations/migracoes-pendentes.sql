-- =====================================================================
-- LiveGallery — migrações pendentes em produção (0006 a 0008)
--
-- COMO USAR: abrir o painel do Supabase → SQL Editor → colar isto tudo
-- → Run. Demora menos de um segundo num álbum desta dimensão.
--
-- Seguro de correr mais do que uma vez, e seguro sem saber ao certo o
-- que já foi aplicado: cada instrução usa "if not exists"/"if exists",
-- por isso o que já existir é simplesmente ignorado, sem erro.
--
-- Corresponde ao estado final das migrações 0006, 0007 e 0008 do
-- repositório. A 0007 não aparece aqui porque a 0008 substitui o índice
-- que ela criava — criá-lo primeiro só para o apagar a seguir seria
-- trabalho desperdiçado. O resultado final é exatamente o mesmo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0006 — Link de partilha recuperável pelo administrador
--
-- Sem isto, criar um link continua a funcionar, mas o link deixa de
-- poder ser reexibido/copiado mais tarde no painel de administração
-- (docs/decisions/0013). Colunas anuláveis: nada a preencher depois.
-- ---------------------------------------------------------------------

alter table public.album_share_links
  add column if not exists encrypted_token text,
  add column if not exists token_key_version integer;

-- ---------------------------------------------------------------------
-- 0008 — Índices parciais de "photos" (inclui o objetivo da 0007)
--
-- Praticamente todas as leituras de "photos" filtram por
-- "deleted_at is null", mas nenhum índice cobria essa condição. Estes
-- são parciais: mais seletivos e mais pequenos, por só indexarem as
-- linhas que a aplicação lê (docs/decisions/0029).
--
-- Cada "drop index" remove o equivalente não-parcial, que passa a ser
-- redundante — inclui "photos_album_uploaded_idx" da 0007, caso já
-- tenha chegado a ser criado.
-- ---------------------------------------------------------------------

-- Galeria pública: paginação por cursor sobre sort_order.
create index if not exists photos_album_status_sort_active_idx
  on public.photos (album_id, status, sort_order desc)
  where deleted_at is null;

drop index if exists public.photos_album_status_sort_idx;

-- Painel de administração (ordenação por omissão) e "uploads recentes".
create index if not exists photos_album_uploaded_active_idx
  on public.photos (album_id, uploaded_at desc)
  where deleted_at is null;

drop index if exists public.photos_album_uploaded_idx;

-- Painel de administração, ordenação por data de captura.
create index if not exists photos_album_captured_active_idx
  on public.photos (album_id, captured_at desc)
  where deleted_at is null;

drop index if exists public.photos_album_captured_idx;

-- Deteção de duplicados no envio (findByAlbumAndSha256).
create index if not exists photos_album_sha256_active_idx
  on public.photos (album_id, sha256)
  where deleted_at is null;

drop index if exists public.photos_album_sha256_idx;

-- =====================================================================
-- CONFIRMAR QUE CORREU BEM
-- Correr isto a seguir; deve devolver 6 linhas (2 colunas + 4 índices).
-- =====================================================================

-- select 'coluna: ' || column_name as resultado
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name = 'album_share_links'
--    and column_name in ('encrypted_token', 'token_key_version')
-- union all
-- select 'índice: ' || indexname
--   from pg_indexes
--  where schemaname = 'public'
--    and indexname like 'photos_album_%_active_idx'
--  order by 1;
