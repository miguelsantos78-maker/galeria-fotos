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
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/unit/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
