import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Fluxo do convidado com o backend simulado por interceção de rede
 * (secção 19 proíbe chamar Supabase/Google reais em CI — isto testa a
 * interface real, servida pela aplicação real, só com as respostas de
 * `/api/albums/**` simuladas). Cenários que precisam mesmo de um
 * Supabase/Google de teste (envio de fotografias ponta-a-ponta, tempo
 * real entre dois browsers, moderação de administrador) ficam para
 * verificação manual em staging, tal como já documentado nas ADRs das
 * fases anteriores.
 */

const RESOLVED_ALBUM = {
  album: {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Casamento da Ana e do João",
    description: "Fotografias do grande dia.",
    visibility: "unlisted",
    uploadEnabled: true,
    downloadEnabled: true,
    eventStartAt: null,
    eventEndAt: null,
  },
  permissions: ["view", "upload"],
  isOwner: false,
};

async function mockResolve(
  page: import("@playwright/test").Page,
  overrides: Partial<typeof RESOLVED_ALBUM> = {},
) {
  await page.route("**/api/albums/resolve", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: { ...RESOLVED_ALBUM, ...overrides },
        error: null,
      }),
    });
  });
}

async function mockEmptyPhotos(page: import("@playwright/test").Page) {
  await page.route("**/api/albums/*/photos*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: { photos: [], nextCursor: null },
        error: null,
      }),
    });
  });
}

test("um convidado abre um link válido e vê o álbum", async ({ page }) => {
  await mockResolve(page);
  await mockEmptyPhotos(page);

  await page.goto("/a/token-de-teste");

  await expect(
    page.getByRole("heading", { name: "Casamento da Ana e do João" }),
  ).toBeVisible();
  await expect(page.getByText("Fotografias do grande dia.")).toBeVisible();
  await expect(page.getByText("Ainda não há fotografias")).toBeVisible();
});

test("mostra a área de envio de fotografias quando a sessão tem permissão de upload", async ({
  page,
}) => {
  await mockResolve(page);
  await mockEmptyPhotos(page);

  await page.goto("/a/token-de-teste");

  await expect(
    page.getByText("Escolher ou tirar fotografias"),
  ).toBeVisible();
});

test("esconde a área de envio de fotografias sem permissão de upload", async ({
  page,
}) => {
  await mockResolve(page, { permissions: ["view"] });
  await mockEmptyPhotos(page);

  await page.goto("/a/token-de-teste");

  await expect(
    page.getByText("Escolher ou tirar fotografias"),
  ).toHaveCount(0);
});

test("mostra uma mensagem clara quando o link não é válido", async ({
  page,
}) => {
  await page.route("**/api/albums/resolve", async (route) => {
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        data: null,
        error: {
          code: "ALBUM_LINK_INVALID",
          message: "Este link não é válido ou já não está disponível.",
          requestId: "test",
        },
      }),
    });
  });

  await page.goto("/a/token-invalido");

  await expect(
    page.getByRole("heading", { name: "Álbum indisponível" }),
  ).toBeVisible();
  await expect(
    page.getByText("Este link não é válido ou já não está disponível."),
  ).toBeVisible();
});

test("a página do álbum resolvido não tem violações de acessibilidade sérias", async ({
  page,
}) => {
  await mockResolve(page);
  await mockEmptyPhotos(page);

  await page.goto("/a/token-de-teste");
  await expect(
    page.getByRole("heading", { name: "Casamento da Ana e do João" }),
  ).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});
