-- LiveGallery: bucket privado para previews/thumbnails derivados.
-- Os originais ficam no Google Drive; este bucket nunca é público e só é
-- lido através de signed URLs de curta duração geradas pela service role.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photo-previews',
  'photo-previews',
  false,
  10485760, -- 10 MB: generoso para um preview/thumbnail WebP
  array['image/webp', 'image/jpeg']
)
on conflict (id) do nothing;

-- Sem políticas de storage.objects para "authenticated"/"anon": o bucket
-- é privado e todo o acesso passa pela service role (signed URLs geradas
-- no servidor), pelo que RLS nega tudo por omissão a outros papéis.
