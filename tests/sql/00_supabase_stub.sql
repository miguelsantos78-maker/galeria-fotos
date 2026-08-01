-- Aproximação mínima do runtime do Supabase (schemas "auth"/"storage" e
-- os papéis "anon"/"authenticated"/"service_role"), usada APENAS para
-- validar localmente a sintaxe e o comportamento das migrações e das
-- políticas de RLS em Postgres puro, sem depender do Supabase CLI/Docker.
--
-- Isto NÃO faz parte das migrações da aplicação (não vive em
-- supabase/migrations/) e nunca deve ser aplicado a um projeto Supabase
-- real, que já fornece estes schemas.

create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  is_anonymous boolean not null default false,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
  language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create or replace function auth.role() returns text
  language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;

create schema if not exists storage;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant all on all tables in schema public, auth, storage to service_role;
grant all on all sequences in schema public, auth, storage to service_role;

-- As tabelas da aplicação só são criadas pelas migrações a seguir a este
-- stub; privilégios por omissão garantem que a service role também as
-- pode aceder sem precisar de um GRANT explícito por tabela (tal como
-- acontece na configuração real de um projeto Supabase).
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
