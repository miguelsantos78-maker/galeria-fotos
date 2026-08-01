-- LiveGallery: Supabase Realtime em "photos" (secção 11).
--
-- A publicação "supabase_realtime" existe por omissão num projeto
-- Supabase, mas começa vazia — é preciso adicionar cada tabela
-- explicitamente. Sem isto, `postgres_changes` nunca entrega eventos,
-- mesmo com RLS e subscrição corretas no cliente.
--
-- Eventos "postgres_changes" respeitam RLS: um cliente só recebe um
-- evento se a política de SELECT da tabela (secção 8,
-- "photos_select_owner"/"photos_select_visible_via_session") permitir
-- ver essa linha para o utilizador autenticado da ligação. Não é preciso
-- nenhuma política nova só para o Realtime.

alter publication supabase_realtime add table public.photos;
