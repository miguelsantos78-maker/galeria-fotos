import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Verificação automática de acessibilidade (secção 17/22) nas páginas
 * que não precisam de sessão real. Não substitui a verificação manual
 * por teclado pedida na "Definição de concluído" (secção 23), só
 * apanha regressões óbvias (contraste, nomes acessíveis, landmarks).
 */
test("a página inicial não tem violações de acessibilidade sérias", async ({
  page,
}) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});

test("a página de login de administrador não tem violações de acessibilidade sérias", async ({
  page,
}) => {
  await page.goto("/admin/login");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});
