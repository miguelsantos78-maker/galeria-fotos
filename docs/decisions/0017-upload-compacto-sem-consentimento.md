# 0017 — Área de envio compacta, sem passo de consentimento

Data: 2026-08-03

## Contexto

Pedido direto do administrador: a área de envio (já embutida na
página principal, `docs/decisions/0016`) estava demasiado grande —
pediu para reduzir a um único campo de escolher/tirar fotografia, e
para retirar o bloco de consentimento.

## Decisão

`components/upload/upload-queue.tsx`:

- Removidos: a caixa pontilhada de arrastar-e-largar, o ícone
  ilustrativo, o texto "Arraste fotografias para aqui, ou", e os dois
  botões separados ("Escolher ficheiros" / "Tirar fotografia").
- Substituídos por **um único botão** ("Escolher ou tirar
  fotografias") ligado a um único `<input type="file" multiple>`, sem
  o atributo `capture`. Sem esse atributo, o seletor nativo do
  telemóvel (iOS/Android) mostra as duas opções — câmara e galeria —
  no mesmo diálogo, cumprindo o pedido de "um campo" sem perder a
  possibilidade de tirar fotografia na hora.
- Removida a caixa de consentimento ("As fotografias que enviar ficam
  visíveis...") e toda a lógica associada (estado, bloqueio dos
  campos até estar marcada).

## Desvio da secção 10.3 do CLAUDE.md, por pedido explícito

A secção 10.3 do `CLAUDE.md` menciona "mostrar uma mensagem de
consentimento antes do upload, configurável por álbum". A
implementação anterior já não cumpria isso por completo (era fixa,
não configurável por álbum) — esta mudança remove-a de vez, por
pedido direto e explícito do administrador nesta conversa. Registado
aqui para ficar claro que é uma decisão tomada conscientemente, não um
esquecimento.

## Verificação

`pnpm check` completo e suite E2E (15 testes) a passar — o teste que
verificava o texto do botão antigo foi atualizado para o novo texto
("Escolher ou tirar fotografias"); os restantes (incluindo o scan de
acessibilidade) continuam válidos sem alterações.
