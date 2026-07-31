-- LiveGallery: criação automática de "profiles" para novos utilizadores
-- Google (administradores/editores). Utilizadores anónimos (convidados)
-- ficam de fora — não têm nem precisam de uma linha em "profiles".
--
-- O papel ("role") é sempre criado como 'editor'. A promoção a 'admin' é
-- uma ação deliberada e fora deste trigger (ver docs/decisions/0002).

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;

  insert into public.profiles (id, email, display_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    'editor'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
