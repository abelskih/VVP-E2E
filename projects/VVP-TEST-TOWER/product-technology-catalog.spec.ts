import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const ADMIN = { email: "admin@vvp.ru", password: "admin1234" };
const SUFFIX = Date.now().toString(36).toUpperCase();
const CODE = `E2ETECH-${SUFFIX}`;
const LANGUAGE = `Rust E2E ${SUFFIX}`;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(ADMIN.email);
  await page.getByLabel(/пароль/i).fill(ADMIN.password);
  await page.getByRole("button", { name: /войти/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"));
}

async function apiLogin(request: APIRequestContext) {
  expect((await request.post("/api/auth/login", { data: ADMIN })).status()).toBe(200);
}

test("custom language becomes reusable only after moderation", async ({ page, request }) => {
  await apiLogin(request);
  const created = await request.post("/api/products", {
    data: {
      code: CODE,
      name: `Technology catalog ${SUFFIX}`,
      productType: "Internal Product",
      criticality: "Medium",
      languages: [{ name: LANGUAGE, isPrimary: true }],
    },
  });
  expect(created.status()).toBe(201);
  const product = await created.json();

  try {
    expect(product.languages).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: LANGUAGE, status: "Pending" }),
    ]));
    const before = await request.get("/api/technology-catalog");
    expect(before.ok()).toBeTruthy();
    expect((await before.json()).languages).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: LANGUAGE }),
    ]));

    await login(page);
    await page.goto("/settings");
    await page.getByRole("button", { name: "Языки, Framework и проверки" }).click();
    const approve = page.getByRole("button", { name: `Одобрить ${LANGUAGE}` });
    await expect(approve).toBeVisible();
    await approve.click();
    await expect(approve).toHaveCount(0);

    const after = await request.get("/api/technology-catalog");
    expect(after.ok()).toBeTruthy();
    expect((await after.json()).languages).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: LANGUAGE, status: "Approved" }),
    ]));
  } finally {
    await request.delete(`/api/products/${product.id}`);
  }
});
