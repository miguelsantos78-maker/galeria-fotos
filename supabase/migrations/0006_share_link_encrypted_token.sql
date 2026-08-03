-- LiveGallery: token de partilha recuperável pelo administrador
-- (docs/decisions/0013-link-partilha-recuperavel.md).
--
-- "token_hash" continua a ser o único usado para resolver um link de
-- convidado (comparação por hash, tal como antes) — este par novo é
-- só para o administrador poder voltar a ver/copiar o link já criado,
-- sem precisar de o regenerar. Encriptado com AES-256-GCM
-- (lib/security/encryption.ts), o mesmo mecanismo já usado para o
-- refresh token do Google Drive em google_connections.
--
-- Nulo em linhas antigas (criadas antes desta migração) — esses links
-- continuam a funcionar normalmente para convidados, só não ficam
-- recuperáveis no painel de administração.

alter table public.album_share_links
  add column encrypted_token text,
  add column token_key_version integer;
