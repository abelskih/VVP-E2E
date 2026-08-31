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
  await login(page);
  await page.goto("/products/new");
  await page.getByLabel("Название продукта").fill(`Technology catalog ${SUFFIX}`);
  await page.getByLabel("Код продукта").fill(CODE);
  await page.getByText("Выберите...").first().click();
  await page.getByRole("option", { name: "Internal Product" }).click();
  await page.getByText("Выберите...").last().click();
  await page.getByRole("option", { name: "Medium" }).click();
  await page.getByRole("button", { name: /Далее/ }).click();

  const languageInput = page.getByPlaceholder("Выберите или введите своё значение").first();
  await languageInput.fill(LANGUAGE);
  await page.getByRole("button", { name: "Добавить" }).first().click();
  await page.getByRole("button", { name: `Сделать ${LANGUAGE} основным` }).click();
  await expect(page.getByText(/не будет в общих подсказках/).first()).toBeVisible();
  await page.getByRole("button", { name: /Далее/ }).click();
  await page.getByRole("button", { name: /Создать продукт и продолжить/ }).click();
  await expect(page.getByText("Release Gate")).toBeVisible();

  await page.goto("/settings");
  await page.getByRole("button", { name: "Языки, Framework и проверки" }).click();
  await expect(page.getByText(LANGUAGE)).toBeVisible();
  await page.getByRole("button", { name: `Одобрить ${LANGUAGE}` }).click();
  await expect(page.getByText(LANGUAGE)).toHaveCount(0);

  await page.goto("/products/new");
  await page.getByLabel("Название продукта").fill(`Suggestion proof ${SUFFIX}`);
  await page.getByLabel("Код продукта").fill(`${CODE}-2`);
  await page.getByText("Выберите...").first().click();
  await page.getByRole("option", { name: "Internal Product" }).click();
  await page.getByText("Выберите...").last().click();
  await page.getByRole("option", { name: "Medium" }).click();
  await page.getByRole("button", { name: /Далее/ }).click();
  await expect(page.locator(`datalist option[value="${LANGUAGE}"]`)).toHaveCount(1);

  await apiLogin(request);
  const products = await request.get(`/api/products?search=${encodeURIComponent(CODE)}`);
  if (products.ok()) {
    const body = await products.json();
    for (const product of body.items ?? body) {
      if (String(product.code).startsWith(CODE)) await request.delete(`/api/products/${product.id}`);
    }
  }
});
