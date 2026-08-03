# 0015 — Cabeçalho maior + área de upload em destaque na galeria

Data: 2026-08-03

## Contexto

Pedido do administrador, com um screenshot anotado: o cabeçalho da
galeria devia ficar "mais apelativo", e devia existir uma área de
upload visível logo a seguir ao cabeçalho (não só um botão flutuante
sobre a grelha), com a grelha de fotografias a passar para baixo dessa
área — tudo otimizado para telemóvel.

## Decisão

`components/gallery/album-resolver.tsx` reestruturado:

1. **Cabeçalho**: deixou de ser uma barra fixa (`sticky`) fina — passa
   a uma secção maior, centrada, com título serifado maior
   (`text-3xl`/`text-4xl`) e um gradiente subtil na cor da marca
   (`from-brand-600/10`, baseado em opacidade — não nas variantes claras
   fixas tipo `brand-50`, para continuar a fazer sentido em modo
   escuro). Deixar de ser fixo liberta espaço permanente no ecrã
   enquanto se percorre a grelha, mais importante em telemóvel do que
   manter o título sempre visível.
2. **Área de upload**: cartão em destaque logo a seguir ao cabeçalho,
   com ícone, título, descrição curta e botão "Enviar agora" — substitui
   o botão flutuante (FAB) da versão anterior
   (`docs/decisions/0010-redesenho-mobile-galeria.md`). Um ponto de
   entrada único e bem visível em vez de dois a competir pela atenção.
3. **Grelha**: sem alterações de comportamento, só passa a aparecer
   depois da área de upload em vez de logo a seguir ao cabeçalho.

`app/globals.css`: removido o utilitário `.fab-bottom`, que ficou sem
nenhum uso depois de o FAB ser substituído pela área de upload.

## Nota de acessibilidade

O cartão de upload é um único `<Link>` grande (bom alvo de toque em
telemóvel) com título, descrição e um botão decorativo lá dentro — o
nome acessível calculado a partir de todo esse texto ficaria longo e
impreciso. Definido `aria-label="Adicionar fotografias"` explicitamente
no link, para manter o nome acessível igual ao da versão anterior
(o teste `tests/e2e/guest-album-flow.spec.ts` continua a passar sem
alterações).

## Verificação

`pnpm check` completo e suite E2E (15 testes, incluindo o scan de
acessibilidade) a passar. Confirmado visualmente com Playwright em
390×844 (telemóvel) e 1280×900 (desktop).
