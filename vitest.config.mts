import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // O Next.js torna "server-only" um no-op em bundles de servidor via
      // bundler; fora do Next.js (aqui, nos testes) o pacote real lança
      // sempre uma exceção ao ser importado, por isso substituímos por um
      // módulo vazio equivalente.
      "server-only": fileURLToPath(
        new URL("./tests/unit/mocks/server-only-noop.ts", import.meta.url),
      ),
    },
  },
  test: {
    // "node", não "jsdom": nenhum teste atual renderiza componentes React
    // (isso só chega com testes de UI, ainda por escrever) e o jsdom tem um
    // bug real de cross-realm com `Buffer`/`Uint8Array` — `x instanceof
    // Uint8Array` falha para um `Buffer` do Node dentro do contexto isolado
    // do jsdom, o que partiu `file-type` (usado em lib/media/validate-image.ts,
    // Fase 4). Ficheiros que precisem de DOM podem ativar jsdom por ficheiro
    // com o comentário `// @vitest-environment jsdom` no topo.
    environment: "node",
    globals: true,
    setupFiles: ["./tests/unit/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
