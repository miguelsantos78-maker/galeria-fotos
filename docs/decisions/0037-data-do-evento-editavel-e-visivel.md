# 0037 — Data do evento: editável no BO, visível na galeria pública

Data: 2026-08-10

## Contexto

Pedido, a partir de um print da galeria pública (álbum "Despedida de
solteiros"): mostrar a data do evento por baixo do título, com
tamanho mais pequeno.

O esquema já tinha o campo certo para isto — `albums.event_start_at`
— e `resolve-album.ts` já o devolvia à galeria pública
(`PublicAlbumView.eventStartAt`), mas **nenhuma interface** alguma vez
o lia nem o escrevia: nem o formulário de criação de álbum, nem
`album-detail.tsx`, nem a própria galeria. O campo existia na base de
dados e ficava sempre `null`.

## Decisão

### `lib/format-date.ts`

Um único formatador (`formatEventDate`), partilhado entre o painel de
administração e a galeria pública, para as duas leituras da mesma data
nunca divergirem em formato — "17 de agosto de 2026", por extenso em
português, a condizer com o resto da interface (secção 1: pt-PT).

### Editar no BO

`components/admin/album-detail.tsx` ganha uma linha "Data do evento"
junto ao estado do álbum, com o mesmo padrão de edição inline já usado
para o nome (ADR 0034): lápis → campo → Guardar/Cancelar. Usa um
`<input type="date">` nativo, por ser só o dia que interessa para uma
etiqueta deste tipo — não uma hora específica.

`event_start_at` é um `timestamptz` completo; guarda-se ao meio-dia UTC
(`T12:00:00.000Z`) em vez de meia-noite, para a data mostrada nunca
mudar de dia consoante o fuso horário de quem a vê. Limpar o campo e
guardar envia `eventStartAt: null`, removendo a data.

### Mostrar na galeria pública

`components/gallery/album-resolver.tsx`: um parágrafo pequeno
(`text-xs sm:text-sm`) por baixo do título, nos dois estados do
cabeçalho (com e sem fotografia de capa) — só quando `eventStartAt`
está definido; um álbum sem data não mostra nada no lugar.

## Verificação

`pnpm check` (259 testes, 9 novos) e `pnpm build`. Suite E2E completa
(20 testes).

Testes novos:

- `tests/unit/format-date.test.ts` — formato por extenso em português.
- `tests/unit/album-detail.test.tsx` — mostra "não definida" e o botão
  para a definir; guarda a data escolhida (confirmando o corpo exato
  do `PATCH`, meio-dia UTC) e mostra-a formatada; remover a data
  (campo vazio) envia `null`.
- `tests/e2e/guest-album-flow.spec.ts` — a data aparece por baixo do
  título quando definida; nenhuma data aparece (nem "Invalid Date")
  quando não está.

Verificação visual (viewport de telemóvel) através de uma página
temporária fora de `/admin` — confirmado o resultado igual ao
pedido: "17 de agosto de 2026" por baixo do título, em tamanho
pequeno. Página apagada depois da verificação.

## Limitações conhecidas

- O formulário de criação de álbum (`albums-list.tsx`) continua sem
  campo de data — só é possível defini-la depois de o álbum criado,
  em `album-detail.tsx`. Aceitável: a criação já tem título e
  descrição só, e o resto das definições (visibilidade, moderação,
  etc.) também só se ajusta depois de criado.
- `event_end_at` continua sem interface nenhuma — o pedido era só a
  data (dia único), e o casamento em questão já é sabido ser de um dia
  só (ADR 0028).
