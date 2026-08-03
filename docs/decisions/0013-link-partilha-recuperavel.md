# 0013 — Link de partilha recuperável pelo administrador

Data: 2026-08-03

## Contexto

Pedido explícito do administrador: aceder ao envio de fotografias
exigia sempre passar pela administração para gerar um link novo,
porque o token só era mostrado uma vez no momento da criação (secção
6.3 do `CLAUDE.md`: "guardar apenas o hash do token na base de
dados"). Perder o link (fechar a aba antes de copiar, trocar de
dispositivo) obrigava a revogar e criar outro. Pedido para tornar o
acesso ao envio mais simples.

Apresentadas três opções ao administrador — manter como está, lembrar
só no browser (sem mudar a base de dados), ou tornar o link
permanentemente recuperável — escolhida a terceira.

## Decisão

`album_share_links` passa a guardar também o token encriptado
(`encrypted_token` + `token_key_version`, migração
`0006_share_link_encrypted_token.sql`), com o mesmo mecanismo
AES-256-GCM já usado para o refresh token do Google Drive
(`lib/security/encryption.ts`, `encryptSecret`/`decryptSecret` —
reutilizados tal como estavam, sem alterações).

`token_hash` **mantém-se inalterado** como único mecanismo para
resolver um link de convidado (`POST /api/albums/resolve` continua a
comparar hashes, nunca decifra nada nesse caminho) — a mudança é
estritamente aditiva, só para permitir ao administrador **voltar a
ver** um link já criado.

`server/use-cases/share-links.ts`:

- `createShareLink` encripta o token além de o hashear, guardando as
  duas formas.
- `toPublicShareLink` (usado tanto na criação como na listagem)
  desencripta e devolve `token: string | null` — `null` só para links
  criados antes desta migração, que continuam válidos para convidados
  mas deixam de poder ser reexibidos (não há forma de recuperar um
  token do qual só existe o hash).

`components/admin/share-links-manager.tsx`: cada link ativo na lista
mostra agora o URL completo com um botão "Copiar", em vez de só o link
recém-criado numa mensagem que dizia para copiar imediatamente.

## Trade-off de segurança, explícito

Isto é um desvio pequeno, mas real, da secção 6.3 do `CLAUDE.md`
("guardar apenas o hash"). Com um token só em hash, nem um
compromisso total da base de dados (ex.: acesso de leitura ao
Postgres) permite recuperar o texto do link. Com um token também
encriptado, um atacante que tivesse simultaneamente acesso à base de
dados **e** a `APP_ENCRYPTION_KEY` conseguiria decifrá-lo — o mesmo
modelo de ameaça que a app já aceita para o refresh token do Google
Drive. Decisão consciente, pedida explicitamente pelo administrador,
depois de lhe apresentar a alternativa mais segura (manter como
estava) e a intermédia (só no browser, sem mudar a base de dados).

## Verificação

`pnpm check` completo e suite E2E (15 testes) a passar. Testes novos
em `tests/unit/use-cases/share-links.test.ts`: confirma que
`encrypted_token` fica guardado (e é diferente do token em texto
simples), que `toPublicShareLink` o recupera corretamente, e que
devolve `null` para uma linha sem `encrypted_token` (simulando um link
anterior a esta migração).

## Limitações conhecidas

- **Migração ainda não aplicada ao projeto Supabase de produção** —
  precisa de ser corrida manualmente (SQL Editor ou `supabase db
  push`) antes de esta funcionalidade funcionar em produção; até lá, a
  criação de links continua a funcionar (as colunas novas aceitam
  `null`), só sem o token ficar recuperável.
- Links já existentes (criados antes desta migração) não passam a ser
  recuperáveis retroativamente — só os criados depois. Para o álbum já
  em uso pelo administrador, isto significa criar um novo link depois
  do deploy para beneficiar desta funcionalidade.
