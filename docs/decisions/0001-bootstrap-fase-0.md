# 0001 — Âmbito e decisões técnicas da Fase 0

Data: 2026-07-31

## Contexto

A Fase 0 (`CLAUDE.md`, secção 22) exige criar o projeto base, configurar
ferramentas de qualidade e garantir que `pnpm check` e `pnpm build`
passam, sem ainda implementar Supabase, Google Drive, upload ou galeria
com dados reais.

## Decisões

1. **Versão do Next.js**: usada a versão estável mais recente disponível
   no momento da criação (`next@16`, com Turbopack por omissão em `dev`
   e `build`). Foi consultada a documentação incluída no pacote
   (`node_modules/next/dist/docs`) para confirmar as mudanças relevantes
   face a versões anteriores (APIs assíncronas de `params`, remoção do
   `next lint`, `output: "standalone"` mantido).

2. **Lint**: `next lint` foi removido no Next.js 16; o script `lint`
   usa o ESLint diretamente (`eslint .`) com a configuração _flat_
   gerada pelo `create-next-app` (`eslint-config-next`).

3. **Validação de ambiente**: `lib/env.ts` expõe `getServerEnv()` e
   `getPublicEnv()`, separando claramente variáveis privadas de
   variáveis `NEXT_PUBLIC_*`, para não arriscar importar segredos num
   Client Component. A validação só corre quando as funções são
   chamadas (memoizada), e é despoletada no arranque do servidor via
   `instrumentation.ts` — isto evita que `pnpm build`, que não inicia o
   servidor, falhe em ambientes sem segredos configurados (por exemplo
   CI sem credenciais Supabase/Google), mantendo ainda assim uma falha
   rápida e clara quando a aplicação arranca de facto (`pnpm dev` /
   `pnpm start`) sem configuração válida.

4. **Estrutura de pastas**: criada integralmente conforme a secção 9,
   incluindo as pastas que só serão preenchidas em fases futuras
   (`supabase/migrations`, `lib/google-drive`, `server/*`, etc.), com
   ficheiros `.gitkeep` onde ainda não há código. Isto evita
   reestruturações disruptivas mais tarde.

5. **Página pública de álbum e dados mockados**: a secção 28 do
   `CLAUDE.md` sugere implementar já uma página de álbum com dados
   mockados numa camada de desenvolvimento isolada. Decidiu-se adiar
   essa implementação para quando existir o domínio de álbuns/fotografias
   (Fases 2 e 5), criando entretanto apenas uma página placeholder em
   `/a/[slug]`. Optou-se pela opção mais segura: evitar construir uma
   camada de dados mock que teria de ser descartada, e manter a Fase 0
   estritamente focada em bootstrap e ferramentas, conforme o critério
   de saída definido na secção 22 (`pnpm check` e `pnpm build` a
   passar).

6. **Dockerfile**: build multi-stage com `pnpm` (via `corepack`) e
   `output: "standalone"` no `next.config.ts`, para uma imagem de
   runtime mínima adequada a Google Cloud Run.
