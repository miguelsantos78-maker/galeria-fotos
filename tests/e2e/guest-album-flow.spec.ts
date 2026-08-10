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
    coverPhotoUrl: null as string | null,
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
        data: { photos: [], nextCursor: null, totalCount: 0 },
        error: null,
      }),
    });
  });
}

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function photoRow(id: string, isMine = false) {
  return {
    id,
    width: 800,
    height: 600,
    blurhash: null,
    status: "ready",
    isFeatured: false,
    uploadedAt: new Date().toISOString(),
    previewUrl: `https://signed.example.com/${id}.png`,
    thumbnailUrl: `https://signed.example.com/${id}-thumb.png`,
    isMine,
  };
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

  await expect(page.getByText("Escolher ou tirar fotografias")).toBeVisible();
});

test("esconde a área de envio de fotografias sem permissão de upload", async ({
  page,
}) => {
  await mockResolve(page, { permissions: ["view"] });
  await mockEmptyPhotos(page);

  await page.goto("/a/token-de-teste");

  await expect(page.getByText("Escolher ou tirar fotografias")).toHaveCount(0);
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

test("mostra a fotografia de capa quando o álbum tem uma definida", async ({
  page,
}) => {
  const coverUrl = "https://signed.example.com/cover.webp";
  await page.route(coverUrl, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  });
  await mockResolve(page, {
    album: { ...RESOLVED_ALBUM.album, coverPhotoUrl: coverUrl },
  });
  await mockEmptyPhotos(page);

  await page.goto("/a/token-de-teste");

  await expect(
    page.getByRole("heading", { name: "Casamento da Ana e do João" }),
  ).toBeVisible();
  const coverImage = page.locator(`img[src="${coverUrl}"]`);
  await expect(coverImage).toBeVisible();
  await expect(coverImage).toHaveAttribute("alt", "");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});

test("virtualiza a grelha para álbuns com muitas fotografias, e continua a abrir o lightbox", async ({
  page,
}) => {
  const PHOTO_COUNT = 90;
  await page.route("https://signed.example.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(TINY_PNG_BASE64, "base64"),
    });
  });
  await mockResolve(page, { permissions: ["view"] });
  await page.route("**/api/albums/*/photos*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          photos: Array.from({ length: PHOTO_COUNT }, (_, i) =>
            photoRow(`p${i + 1}`),
          ),
          nextCursor: null,
          totalCount: PHOTO_COUNT,
        },
        error: null,
      }),
    });
  });

  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/a/token-de-teste");
  await expect(
    page.getByRole("heading", { name: "Casamento da Ana e do João" }),
  ).toBeVisible();

  const tiles = page.locator('button:has(img[alt="Fotografia do álbum"])');
  await expect(tiles.first()).toBeVisible();

  // Só uma fração das 90 fotografias chega a montar-se no DOM de cada
  // vez — é a própria prova de que a virtualização está ativa.
  const mountedCount = await tiles.count();
  expect(mountedCount).toBeGreaterThan(0);
  expect(mountedCount).toBeLessThan(PHOTO_COUNT);

  // A grelha virtualizada tem de manter a mesma folga vertical entre
  // linhas que a grelha simples (`gap-0.5`) — regressão real: as linhas
  // ficavam coladas verticalmente a partir do momento em que a
  // virtualização assumia o lugar (viewport de 390px = 3 colunas, por
  // isso o mosaico 2 é o primeiro da segunda linha).
  // Limiar de 1px, não só "> 0": sem a folga de `pb-0.5` entre linhas
  // (ver docs/decisions/0033), o intervalo real medido era ~0.3px —
  // tecnicamente positivo, mas visualmente colado, como no defeito
  // reportado. 2px (0.125rem) é o valor esperado; alguma tolerância
  // para sub-pixel rendering.
  const lastOfFirstRow = await tiles.nth(2).boundingBox();
  const firstOfSecondRow = await tiles.nth(3).boundingBox();
  const verticalGap =
    (firstOfSecondRow?.y ?? 0) -
    ((lastOfFirstRow?.y ?? 0) + (lastOfFirstRow?.height ?? 0));
  expect(verticalGap).toBeGreaterThan(1);

  await tiles.first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("mostra o contador e filtra pelas fotografias do próprio convidado", async ({
  page,
}) => {
  await page.route("https://signed.example.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(TINY_PNG_BASE64, "base64"),
    });
  });
  await mockResolve(page, { permissions: ["view"] });

  // O servidor é que filtra (?mine=true) — o mock responde em
  // conformidade, como o endpoint real faria.
  await page.route("**/api/albums/*/photos*", async (route) => {
    const onlyMine = new URL(route.request().url()).searchParams.get("mine");
    const photos =
      onlyMine === "true"
        ? [photoRow("p1", true)]
        : [photoRow("p1", true), photoRow("p2"), photoRow("p3")];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: { photos, nextCursor: null, totalCount: photos.length },
        error: null,
      }),
    });
  });

  await page.goto("/a/token-de-teste");

  await expect(page.getByText("3 fotografias")).toBeVisible();

  // O rótulo do botão descreve a AÇÃO seguinte, por isso troca depois
  // do clique ("As minhas fotos" → "Todas as fotos").
  await page.getByRole("button", { name: "As minhas fotos" }).click();

  await expect(page.getByText("1 fotografia sua")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Todas as fotos" }),
  ).toBeVisible();
  await expect(
    page.locator('button:has(img[alt="Fotografia do álbum"])'),
  ).toHaveCount(1);

  // E voltar atrás repõe a lista completa.
  await page.getByRole("button", { name: "Todas as fotos" }).click();
  await expect(page.getByText("3 fotografias")).toBeVisible();
});
