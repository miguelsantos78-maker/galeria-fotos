import { expect, test } from "@playwright/test";

/**
 * Protege as rotas administrativas mesmo sem sessão real (secção 6.1) —
 * cenários completos de login/CRUD de administrador precisam de um
 * projeto Supabase/Google de teste real e ficam para verificação manual
 * em staging (secção 19: nunca chamar APIs Google reais em CI).
 */
test.describe("acesso administrativo sem sessão", () => {
  test("/admin redireciona para o login", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("/admin/albums redireciona para o login", async ({ page }) => {
    await page.goto("/admin/albums");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("/admin/settings/integrations redireciona para o login", async ({
    page,
  }) => {
    await page.goto("/admin/settings/integrations");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("a página de login mostra o botão de entrar com Google", async ({
    page,
  }) => {
    await page.goto("/admin/login");
    await expect(
      page.getByRole("button", { name: /entrar com google/i }),
    ).toBeVisible();
  });
});

test.describe("respostas de API sem sessão administrativa", () => {
  test("GET /api/albums devolve 401 em JSON", async ({ request }) => {
    const response = await request.get("/api/albums");
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("GET /api/albums/x/photos/moderation devolve 401 em JSON", async ({
    request,
  }) => {
    const response = await request.get(
      "/api/albums/fake-album-id/photos/moderation",
    );
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });
});
