-- Testes pgTAP para as políticas de RLS (CLAUDE.md secção 8).
--
-- Corridos via `supabase test db` (Supabase CLI) num projeto real, ou
-- localmente contra Postgres puro depois de carregar
-- tests/sql/00_supabase_stub.sql (ver docs/decisions/0002-fase-1-supabase-auth.md
-- para o que essa aproximação cobre e não cobre).

begin;
select plan(20);

-- ---------------------------------------------------------------------
-- Fixtures (inseridas como "postgres", que ignora RLS por ser superuser)
-- ---------------------------------------------------------------------

insert into auth.users (id, email, is_anonymous) values
  ('a0000000-0000-0000-0000-000000000001', 'admin.a@example.com', false),
  ('a0000000-0000-0000-0000-000000000002', 'admin.b@example.com', false),
  ('a0000000-0000-0000-0000-000000000003', 'editor.c@example.com', false),
  ('b0000000-0000-0000-0000-000000000001', null, true),
  ('b0000000-0000-0000-0000-000000000002', null, true),
  ('b0000000-0000-0000-0000-000000000003', null, true),
  ('b0000000-0000-0000-0000-000000000004', null, true);

-- O trigger on_auth_user_created já criou profiles 'editor' para os 3
-- utilizadores Google; promovemos dois deles a admin (simula o bootstrap
-- manual descrito em docs/decisions/0002).
update public.profiles set role = 'admin'
  where id in ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002');

insert into public.google_connections (id, user_id, google_account_email, encrypted_refresh_token, root_folder_id) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'admin.a@drive.example.com', 'enc-a', 'folder-a'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'admin.b@drive.example.com', 'enc-b', 'folder-b');

insert into public.albums (id, owner_id, google_connection_id, title, slug, drive_folder_id, status) values
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Álbum A', 'album-a', 'drive-folder-a', 'published'),
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'Álbum B', 'album-b', 'drive-folder-b', 'published');

insert into public.photos (id, album_id, drive_file_id, drive_folder_id, original_filename, safe_filename, mime_type, file_size, status) values
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'drive-file-1', 'drive-folder-a', 'foto1.jpg', 'foto1.jpg', 'image/jpeg', 1000, 'ready'),
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'drive-file-2', 'drive-folder-a', 'foto2.jpg', 'foto2.jpg', 'image/jpeg', 1000, 'pending_review'),
  ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 'drive-file-3', 'drive-folder-a', 'foto3.jpg', 'foto3.jpg', 'image/jpeg', 1000, 'hidden'),
  ('e0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000002', 'drive-file-4', 'drive-folder-b', 'foto4.jpg', 'foto4.jpg', 'image/jpeg', 1000, 'ready');

insert into public.album_sessions (album_id, user_id, permissions, expires_at) values
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '{view}', now() + interval '1 hour'),
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', '{view}', now() - interval '1 hour'),
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003', '{view}', now() + interval '1 hour'),
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000004', '{view,moderate}', now() + interval '1 hour');

-- ---------------------------------------------------------------------
-- 1. Um visitante não consegue enumerar outros álbuns.
-- ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';

select is(
  (select count(*)::int from public.albums where id = 'd0000000-0000-0000-0000-000000000002'),
  0,
  'guest com sessão só no álbum A não vê o álbum B'
);

select is(
  (select count(*)::int from public.albums where id = 'd0000000-0000-0000-0000-000000000001'),
  1,
  'guest com sessão válida vê o seu próprio álbum'
);

reset role;

-- ---------------------------------------------------------------------
-- 2. Uma sessão expirada perde acesso.
-- ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';

select is(
  (select count(*)::int from public.albums where id = 'd0000000-0000-0000-0000-000000000001'),
  0,
  'sessão expirada não dá acesso ao álbum'
);

select is(
  (select count(*)::int from public.photos where album_id = 'd0000000-0000-0000-0000-000000000001'),
  0,
  'sessão expirada não dá acesso às fotografias do álbum'
);

reset role;

-- ---------------------------------------------------------------------
-- 3. Um token revogado não consegue criar nova sessão: nenhum utilizador
--    autenticado (convidado ou não) tem permissão para inserir
--    diretamente em album_sessions — só a service role o faz, depois de
--    validar o token no servidor.
-- ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';

select throws_ok(
  $$ insert into public.album_sessions (album_id, user_id, permissions, expires_at)
     values ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '{view}', now() + interval '1 hour') $$,
  NULL::text,
  'um utilizador autenticado não pode inserir diretamente em album_sessions'
);

reset role;

-- ---------------------------------------------------------------------
-- 4. Um utilizador de um álbum não consegue ler fotografias de outro.
-- ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000003';
set local request.jwt.claim.role = 'authenticated';

select is(
  (select count(*)::int from public.photos where album_id = 'd0000000-0000-0000-0000-000000000001'),
  0,
  'guest do álbum B não vê fotografias do álbum A'
);

select is(
  (select count(*)::int from public.photos where album_id = 'd0000000-0000-0000-0000-000000000002'),
  1,
  'guest do álbum B vê as fotografias prontas do seu álbum'
);

reset role;

-- ---------------------------------------------------------------------
-- 5. Um utilizador anónimo não consegue editar metadados — nem sequer um
--    convidado com permissão de "moderate" (moderação passa sempre pela
--    service role no servidor, nunca por escrita direta do cliente).
-- ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';

select throws_ok(
  $$ update public.photos set moderation_note = 'hack' where id = 'e0000000-0000-0000-0000-000000000001' $$,
  NULL::text,
  'guest com permissão "view" não consegue editar metadados de uma fotografia'
);

reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000004';
set local request.jwt.claim.role = 'authenticated';

select throws_ok(
  $$ update public.photos set moderation_note = 'hack' where id = 'e0000000-0000-0000-0000-000000000001' $$,
  NULL::text,
  'guest com permissão "moderate" continua sem conseguir escrever diretamente em photos'
);

reset role;

-- ---------------------------------------------------------------------
-- Extra: visibilidade por estado da fotografia.
-- ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';

select is(
  (select count(*)::int from public.photos where id = 'e0000000-0000-0000-0000-000000000002'),
  0,
  'guest só com "view" não vê fotografias pending_review'
);

select is(
  (select count(*)::int from public.photos where id = 'e0000000-0000-0000-0000-000000000003'),
  0,
  'guest não vê fotografias hidden'
);

reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000004';
set local request.jwt.claim.role = 'authenticated';

select is(
  (select count(*)::int from public.photos where id = 'e0000000-0000-0000-0000-000000000002'),
  1,
  'guest com "moderate" vê fotografias pending_review'
);

reset role;

-- ---------------------------------------------------------------------
-- Extra: administradores gerem os seus próprios recursos e apenas esses.
-- ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';

select lives_ok(
  $$ update public.albums set title = 'Álbum A (editado)' where id = 'd0000000-0000-0000-0000-000000000001' $$,
  'admin dono consegue editar o seu próprio álbum'
);

-- Um UPDATE cujo USING não corresponde a nenhuma linha não gera erro —
-- apenas afeta zero linhas. Por isso confirmamos com uma leitura a
-- seguir (já fora do papel "authenticated"), em vez de throws_ok.
select lives_ok(
  $$ update public.albums set title = 'hack' where id = 'd0000000-0000-0000-0000-000000000002' $$,
  'tentativa do admin A de editar o álbum do admin B não gera erro...'
);

reset role;

select is(
  (select title from public.albums where id = 'd0000000-0000-0000-0000-000000000002'),
  'Álbum B',
  '...mas também não altera nenhuma linha, porque o RLS filtrou o UPDATE'
);

-- ---------------------------------------------------------------------
-- Extra: um editor sem papel "admin" não pode criar álbuns.
-- ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000003';
set local request.jwt.claim.role = 'authenticated';

select throws_ok(
  $$ insert into public.albums (owner_id, google_connection_id, title, slug, drive_folder_id)
     values ('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'Álbum Ilegal', 'album-ilegal', 'drive-x') $$,
  NULL::text,
  'um editor sem papel admin não consegue criar álbuns'
);

reset role;

-- ---------------------------------------------------------------------
-- Extra: um utilizador não consegue promover-se a admin.
-- ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000003';
set local request.jwt.claim.role = 'authenticated';

select lives_ok(
  $$ update public.profiles set display_name = 'Editor C' where id = 'a0000000-0000-0000-0000-000000000003' $$,
  'um utilizador consegue atualizar o seu próprio nome'
);

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = 'a0000000-0000-0000-0000-000000000003' $$,
  NULL::text,
  'um utilizador não consegue promover-se a admin através de RLS'
);

reset role;

-- ---------------------------------------------------------------------
-- Extra: album_share_links e audit_logs nunca são visíveis a convidados.
-- ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';

select throws_ok(
  $$ select 1 from public.audit_logs limit 1 $$,
  NULL::text,
  'um convidado não tem qualquer acesso a audit_logs'
);

reset role;

-- ---------------------------------------------------------------------
-- Extra: a service role ignora RLS (usada só pelo backend).
-- ---------------------------------------------------------------------

set local role service_role;

select is(
  (select count(*)::int from public.albums),
  2,
  'a service role vê todos os álbuns, ignorando RLS'
);

reset role;

select * from finish();
rollback;
