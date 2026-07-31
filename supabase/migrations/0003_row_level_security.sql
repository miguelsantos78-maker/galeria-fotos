-- LiveGallery: Row Level Security (CLAUDE.md secção 8).
--
-- Convenções gerais:
--   * `authenticated` cobre tanto administradores/editores (login Google)
--     como convidados (anonymous sign-in do Supabase) — o Supabase mapeia
--     ambos para o papel `authenticated`, distinguindo-os apenas pelo
--     claim `is_anonymous` dentro do JWT. O papel `anon` só se aplica a
--     pedidos sem qualquer sessão, o que a aplicação nunca usa para dados
--     de álbuns/fotografias (a sessão anónima é sempre criada antes).
--   * Escritas em `photos`, `album_sessions` e `audit_logs` acontecem
--     sempre através de Route Handlers com a service role (que ignora
--     RLS) — por isso estas tabelas não têm políticas de INSERT/UPDATE
--     para `authenticated`.
--   * Cada política de administrador confirma o papel 'admin' consultando
--     a própria linha de `profiles` do utilizador autenticado (nunca a
--     de outro utilizador), pelo que não é necessária nenhuma função
--     SECURITY DEFINER adicional.

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Apenas nome e avatar são editáveis pelo próprio utilizador; "role" e
-- "email" só podem ser alterados pela service role (RLS não impede
-- colunas específicas, por isso restringimos ao nível de privilégios).
revoke update on public.profiles from authenticated;
grant select, update (display_name, avatar_url) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- google_connections
-- ---------------------------------------------------------------------

alter table public.google_connections enable row level security;

create policy "google_connections_owner_admin_all"
  on public.google_connections for all
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

grant select, insert, update, delete on public.google_connections to authenticated;

-- ---------------------------------------------------------------------
-- albums
-- ---------------------------------------------------------------------

alter table public.albums enable row level security;

create policy "albums_owner_admin_all"
  on public.albums for all
  to authenticated
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "albums_select_via_session"
  on public.albums for select
  to authenticated
  using (
    exists (
      select 1 from public.album_sessions s
      where s.album_id = albums.id
        and s.user_id = auth.uid()
        and s.expires_at > now()
    )
  );

grant select, insert, update, delete on public.albums to authenticated;

-- ---------------------------------------------------------------------
-- album_share_links (nunca acessível a convidados — só o dono do álbum)
-- ---------------------------------------------------------------------

alter table public.album_share_links enable row level security;

create policy "album_share_links_owner_admin_all"
  on public.album_share_links for all
  to authenticated
  using (
    exists (
      select 1 from public.albums a
      join public.profiles p on p.id = a.owner_id
      where a.id = album_share_links.album_id
        and a.owner_id = auth.uid()
        and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.albums a
      join public.profiles p on p.id = a.owner_id
      where a.id = album_share_links.album_id
        and a.owner_id = auth.uid()
        and p.role = 'admin'
    )
  );

grant select, insert, update, delete on public.album_share_links to authenticated;

-- ---------------------------------------------------------------------
-- album_sessions (criadas apenas pela service role via Route Handler)
-- ---------------------------------------------------------------------

alter table public.album_sessions enable row level security;

create policy "album_sessions_select_own"
  on public.album_sessions for select
  to authenticated
  using (user_id = auth.uid());

grant select on public.album_sessions to authenticated;

-- ---------------------------------------------------------------------
-- photos (escritas sempre pela service role; leitura conforme estado)
-- ---------------------------------------------------------------------

alter table public.photos enable row level security;

create policy "photos_select_owner"
  on public.photos for select
  to authenticated
  using (
    exists (
      select 1 from public.albums a
      where a.id = photos.album_id and a.owner_id = auth.uid()
    )
  );

create policy "photos_select_visible_via_session"
  on public.photos for select
  to authenticated
  using (
    exists (
      select 1 from public.album_sessions s
      where s.album_id = photos.album_id
        and s.user_id = auth.uid()
        and s.expires_at > now()
        and (
          photos.status = 'ready'
          or (photos.status = 'pending_review' and 'moderate' = any (s.permissions))
        )
    )
  );

grant select on public.photos to authenticated;

-- ---------------------------------------------------------------------
-- upload_jobs (apenas leitura do próprio job, para acompanhar progresso)
-- ---------------------------------------------------------------------

alter table public.upload_jobs enable row level security;

create policy "upload_jobs_select_own"
  on public.upload_jobs for select
  to authenticated
  using (user_id = auth.uid());

grant select on public.upload_jobs to authenticated;

-- ---------------------------------------------------------------------
-- audit_logs (sem acesso de cliente; só a service role, que ignora RLS)
-- ---------------------------------------------------------------------

alter table public.audit_logs enable row level security;
