-- LiveGallery: índice em falta para a ordenação por omissão do painel
-- de administração.
--
-- server/repositories/photos-repository.ts#listForOwner ordena por
-- "uploaded_at" quando sortBy não é indicado (o valor por omissão em
-- server/use-cases/moderation.ts#listPhotosForOwner) — mas só existia
-- índice para (album_id, status, sort_order) e (album_id, captured_at),
-- nunca para (album_id, uploaded_at). Sem este índice, a listagem de
-- fotos no painel de administração (aba "Fotos", ordenação por data de
-- envio) fazia uma pesquisa sequencial em "photos" filtrada por
-- album_id, em vez de usar um índice — sem impacto visível com poucas
-- fotos, mas cada vez mais lento à medida que o álbum cresce.

create index photos_album_uploaded_idx
  on public.photos (album_id, uploaded_at desc);
