-- Índice alinhado com a paginação por cursor da galeria pública, que
-- passou a desempatar por `id` (docs/decisions/0043).
--
-- Porquê: `photos.sort_order` tem por omissão o relógio em
-- milissegundos, por isso fotografias enviadas no mesmo instante — o
-- que acontece de verdade com dezenas de convidados a enviar ao mesmo
-- tempo — partilham o mesmo valor. A consulta passou a ordenar por
-- (sort_order desc, id desc) e a filtrar pelo par; sem o `id` no
-- índice, o Postgres tinha de ordenar o resultado à parte.
--
-- Substitui `photos_album_status_sort_active_idx` (migração 0008), que
-- fica redundante: um índice com mais colunas à direita serve na mesma
-- as consultas que só usavam as da esquerda.

create index if not exists photos_album_status_sort_id_active_idx
  on public.photos (album_id, status, sort_order desc, id desc)
  where deleted_at is null;

drop index if exists public.photos_album_status_sort_active_idx;
