# 0046 — Cada pessoa apaga as fotografias que enviou

Data: 2026-08-18

## Contexto

Até aqui só o dono do álbum podia eliminar fotografias. Um convidado
que enviasse uma foto desfocada, repetida, ou em que aparecesse mal,
não tinha nada a fazer senão pedir ao organizador.

A secção 15 já pedia "disponibilizar eliminação completa de
fotografia" como requisito de privacidade. Faltava o caminho para quem
não é administrador.

## Decisão

`DELETE /api/photos/[photoId]` passa a servir dois tipos de pedido:

- **administrador dono do álbum**: apaga qualquer fotografia dele, como
  antes (`deletePhoto`);
- **qualquer outra pessoa**: apaga só as que enviou (`deleteOwnPhoto`).

A distinção é feita no servidor, a partir do perfil de quem pede -
nunca de nada que o cliente envie.

### As duas condições do caminho do autor

`deleteOwnPhoto` exige as duas, e não uma:

1. `photo.uploaded_by` é mesmo quem está a pedir. Esta coluna nunca sai
   para o cliente (só o booleano `isMine`, calculado no servidor - ver
   `PublicPhoto`), por isso não há nada a falsificar.
2. Existe uma `album_session` **válida** para essa pessoa e esse álbum.

A segunda é a que interessa explicar. O `auth.uid()` anónimo do
convidado vive no browser dele e **sobrevive** à revogação do link e à
expiração da sessão. Sem esta verificação, alguém a quem o organizador
tivesse retirado o acesso continuaria a poder apagar coisas lá dentro,
indefinidamente. Ter sido autor não chega: é preciso continuar a ter
acesso ao álbum.

A ordem é deliberada - primeiro a posse, depois a sessão - para o
convidado com sessão válida não conseguir usar as respostas para
descobrir de quem são as fotografias dos outros.

### O que acontece ao ficheiro

Exatamente o mesmo que na eliminação pelo administrador: o original é
apagado do Drive, os derivados da Storage, a linha fica `deleted`, e a
capa do álbum é limpa se era aquela.

Isso não é uma coincidência: as duas eliminações passam a partilhar
`removeFromDriveAndCatalog`. Se uma limpasse menos do que a outra,
ficariam ficheiros por apagar consoante quem carregou no botão - e o
que fica por apagar num caso destes é justamente o original que a
pessoa quis remover.

### Auditoria

Ação distinta: `photo.deleted_by_uploader`, em vez de `photo.deleted`.
O organizador tem de conseguir distinguir, no registo, uma eliminação
que ele fez de uma que um convidado fez.

### Rate limit

Novo balde `photo-delete`, 40 por minuto **por utilizador**. Por
utilizador e não por IP: num casamento os convidados estão todos atrás
da mesma rede, e um limite por IP castigaria a mesa inteira por causa
de uma pessoa. Cada eliminação custa uma chamada à API do Drive, por
isso o teto existe.

## Interface

O botão "Eliminar" da lightbox passa a aparecer também quando
`photo.isMine`. A confirmação é diferente da do administrador: diz
explicitamente que a fotografia desaparece para toda a gente, porque
para o convidado não é óbvio que uma galeria partilhada não tem um
"apagar só para mim".

Combinado com o filtro "as minhas fotografias" que já existia, quem
quiser limpar o que enviou consegue chegar lá sem percorrer o álbum
inteiro.

## Limitações conhecidas

Quem limpar os cookies, mudar de browser ou de telemóvel perde a
identidade anónima e deixa de conseguir apagar o que enviou antes -
para o servidor passa a ser outra pessoa. É o custo de não obrigar os
convidados a criar conta (secção 6.3), e a alternativa (deixar apagar
sem provar autoria) não é aceitável. Nesse caso resta pedir ao
organizador, que continua a poder apagar tudo.

## Testes

`tests/unit/use-cases/moderation.test.ts`, oito casos novos:

- o autor apaga a sua fotografia: sai do Drive, do catálogo, e fica
  registada como `photo.deleted_by_uploader` com o autor como ator;
- não apaga a de outro convidado (FORBIDDEN, e o Drive não é tocado);
- não apaga sem sessão, com sessão expirada, ou com sessão válida
  **noutro** álbum (ALBUM_SESSION_INVALID);
- apaga também uma fotografia ainda por aprovar;
- é idempotente e silencioso para uma já eliminada ou inexistente;
- limpa a capa do álbum quando era aquela.

Retirando as duas verificações de autorização do código, quatro destes
falham - é o que se quer de um teste de autorização.
