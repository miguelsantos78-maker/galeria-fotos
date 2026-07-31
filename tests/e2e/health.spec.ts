import { expect, test } from "@playwright/test";

test("a página inicial carrega e mostra o nome do produto", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/LiveGallery/);
});

test("o endpoint de saúde responde com sucesso", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();

  const body = await response.json();
  expect(body.data.status).toBe("ok");
});
