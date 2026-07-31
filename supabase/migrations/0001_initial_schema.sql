-- LiveGallery: esquema inicial (Fase 1).
-- Cria as tabelas descritas em CLAUDE.md secção 7, sem políticas de RLS
-- (ver 0003_row_level_security.sql).

create extension if not exists pgcrypto;

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text,
  avatar_url text,
  role text not null default 'editor' check (role in ('admin', 'editor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- google_connections
-- ---------------------------------------------------------------------

create table public.google_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  google_account_email text not null,
  encrypted_refresh_token text not null,
  token_key_version integer not null default 1,
  scope text[] not null default '{}',
  root_folder_id text,
  status text not null default 'active' check (status in ('active', 'revoked', 'error')),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index google_connections_user_id_idx on public.google_connections (user_id);

create trigger set_google_connections_updated_at
  before update on public.google_connections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- albums
-- ---------------------------------------------------------------------

create table public.albums (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  google_connection_id uuid not null references public.google_connections (id) on delete restrict,
  title text not null,
  description text,
  slug text not null unique,
  -- referência circular resolvida depois de "photos" existir; ver mais abaixo.
  cover_photo_id uuid,
  drive_folder_id text not null,
  visibility text not null default 'unlisted' check (visibility in ('private', 'unlisted', 'public')),
  upload_enabled boolean not null default true,
  moderation_enabled boolean not null default false,
  download_enabled boolean not null default true,
  event_start_at timestamptz,
  event_end_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index albums_owner_id_idx on public.albums (owner_id);

create trigger set_albums_updated_at
  before update on public.albums
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- album_share_links
-- ---------------------------------------------------------------------

create table public.album_share_links (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums (id) on delete cascade,
  token_hash text not null unique,
  pin_hash text,
  permissions text[] not null default '{view}' check (permissions <@ array['view', 'upload', 'moderate']::text[]),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index album_share_links_album_id_idx on public.album_share_links (album_id);

-- ---------------------------------------------------------------------
-- album_sessions
-- ---------------------------------------------------------------------

create table public.album_sessions (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  share_link_id uuid references public.album_share_links (id) on delete cascade,
  permissions text[] not null default '{view}' check (permissions <@ array['view', 'upload', 'moderate']::text[]),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index album_sessions_user_album_expires_idx
  on public.album_sessions (user_id, album_id, expires_at);

-- ---------------------------------------------------------------------
-- photos
-- ---------------------------------------------------------------------

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums (id) on delete cascade,
  uploaded_by uuid references auth.users (id) on delete set null,
  drive_file_id text not null unique,
  drive_folder_id text not null,
  preview_path text,
  original_filename text not null,
  safe_filename text not null,
  mime_type text not null,
  file_size bigint not null,
  width integer,
  height integer,
  sha256 text,
  blurhash text,
  captured_at timestamptz,
  uploaded_at timestamptz not null default now(),
  status text not null default 'queued' check (
    status in (
      'queued', 'uploading', 'processing', 'pending_review',
      'ready', 'hidden', 'failed', 'deleted'
    )
  ),
  moderation_note text,
  is_featured boolean not null default false,
  sort_order bigint not null default (floor(extract(epoch from clock_timestamp()) * 1000)),
  error_code text,
  error_message text,
  deleted_at timestamptz
);

create index photos_album_status_sort_idx
  on public.photos (album_id, status, sort_order desc);
create index photos_album_captured_idx
  on public.photos (album_id, captured_at desc);
create index photos_album_sha256_idx
  on public.photos (album_id, sha256);

alter table public.albums
  add constraint albums_cover_photo_id_fkey
  foreign key (cover_photo_id) references public.photos (id) on delete set null;

-- ---------------------------------------------------------------------
-- upload_jobs
-- ---------------------------------------------------------------------

create table public.upload_jobs (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  client_upload_id text not null,
  filename text not null,
  expected_size bigint not null,
  received_size bigint not null default 0,
  status text not null default 'pending' check (
    status in ('pending', 'uploading', 'completed', 'failed', 'expired')
  ),
  drive_session_uri_encrypted text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (album_id, user_id, client_upload_id)
);

create index upload_jobs_user_id_idx on public.upload_jobs (user_id);

create trigger set_upload_jobs_updated_at
  before update on public.upload_jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users (id) on delete set null,
  album_id uuid references public.albums (id) on delete set null,
  photo_id uuid references public.photos (id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_album_id_idx on public.audit_logs (album_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
