/**
 * Ключевые пользовательские сценарии в браузере (Task: E2E ключевых экранов).
 *
 * Покрывает то, что acceptance.spec.ts делает через API, — но через UI:
 * 1. Логин и логаут через интерфейс.
 * 2. RBAC на списке продуктов: viewer не видит чужой продукт.
 * 3. Детали тест-рана с рассчитанным гейтом (Release Readiness).
 * 4. Создание Finding через форму.
 *
 * Требует запущенных dev-серверов (web + API) и сид-пользователей (pnpm --filter api-server seed).
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const ADMIN = { email: "admin@vvp.ru", password: "admin1234" };
const VIEWER = { email: "viewer@vvp.ru", password: "viewer1234" };

const CODE = `E2EJ-${Date.now().toString(36).toUpperCase()}`;
const PRODUCT_NAME = `E2E Journeys ${CODE}`;

async function apiLogin(request: APIRequestContext, creds: { email: string; password: string }) {
  const res = await request.post("/api/auth/login", { data: creds });
  expect(res.status()).toBe(200);
}

async function uiLogin(page: Page, creds: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(creds.email);
  await page.getByLabel(/пароль/i).fill(creds.password);
  await page.getByRole("button", { name: /войти/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"));
}

test.describe.serial("Key screens: login → products → run detail → finding", () => {
  let productId: string;
  let runId: string;

  test.beforeAll(async ({ request }) => {
    // Подготовка данных через API: продукт + токен + отчёт с упавшей проверкой,
    // чтобы был тест-ран с рассчитанным гейтом.
    await apiLogin(request, ADMIN);
    const created = await request.post("/api/products", {
      data: {
        code: CODE,
        name: PRODUCT_NAME,
        productType: "Internal Product",
        criticality: "Medium",
        status: "Active",
      },
    });
    expect(created.status()).toBe(201);
    productId = (await created.json()).id;

    const tok = await request.post(`/api/products/${productId}/tokens`, {
      data: { name: "e2e-journeys" },
    });
    expect(tok.status()).toBe(201);
    const token = (await tok.json()).token as string;

    const report = await request.post("/api/v1/reports", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        schemaVersion: "1.0",
        productId: CODE,
        source: "SDK",
        triggerType: "Manual",
        branch: "main",
        sdkVersion: "1.0.1",
        contractVersion: "1.0.1",
        checks: [
          { type: "Typecheck", name: "Typecheck", status: "Passed", mandatory: true, blocking: true },
          {
            type: "Unit",
            name: "Unit tests",
            status: "Failed",
            mandatory: true,
            blocking: true,
            passedCount: 10,
            failedCount: 2,
            totalCount: 12,
            errorMessage: "2 tests failed",
          },
        ],
      },
    });
    expect(report.status()).toBe(201);
    runId = (await report.json()).runId;
  });

  test("login via UI, then logout returns to the login page", async ({ page }) => {
    await uiLogin(page, ADMIN);
    // После логина виден интерфейс приложения с кнопкой выхода.
    const logoutButton = page.getByRole("button", { name: "Выйти" });
    await expect(logoutButton).toBeVisible();

    await logoutButton.click();
    await page.waitForURL((url) => url.pathname.includes("/login"));
    await expect(page.getByRole("button", { name: /войти/i })).toBeVisible();

    // Сессия действительно закрыта: /api/auth/me отвечает 401.
    const me = await page.request.get("/api/auth/me");
    expect(me.status()).toBe(401);
  });

  test("products list respects RBAC: admin sees the product, viewer does not", async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto("/products");
    await page.getByPlaceholder(/поиск/i).first().fill(CODE);
    await expect(page.getByText(CODE).first()).toBeVisible();

    // Viewer без доступа к продукту не видит его в списке.
    await page.request.post("/api/auth/logout");
    await uiLogin(page, VIEWER);
    await page.goto("/products");
    // Список загрузился (страница не в состоянии загрузки).
    await expect(page.locator("main")).not.toContainText("Загрузка", { timeout: 15_000 });
    await expect(page.getByText(CODE)).toHaveCount(0);
  });

  test("test run detail shows checks and the evaluated release gate", async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto(`/test-runs/${runId}`);
    await expect(page.getByText(/Детали проверок/)).toBeVisible();
    await expect(page.getByText("Unit tests").first()).toBeVisible();
    // Гейт рассчитан: блок Release Readiness с заблокированным статусом.
    await expect(page.getByText("Release Readiness")).toBeVisible();
    await expect(page.getByText(/Blocked|Заблокирован/).first()).toBeVisible();
  });

  test("a finding can be created through the UI form", async ({ page }) => {
    const title = `E2E finding ${CODE}`;
    await uiLogin(page, ADMIN);
    await page.goto("/findings");
    await page.getByRole("button", { name: /Создать Finding/ }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Новый Finding")).toBeVisible();
    await dialog.getByPlaceholder(/Краткое описание/).fill(title);

    // Radix Select: открыть выпадающий список продукта и выбрать созданный продукт.
    await dialog.getByText("Выберите продукт").click();
    await page.getByRole("option", { name: PRODUCT_NAME }).click();

    await dialog.getByRole("button", { name: /^Создать$/ }).click();
    await expect(dialog).not.toBeVisible();

    // Finding появился в списке.
    await expect(page.getByText(title).first()).toBeVisible();
  });

  test.afterAll(async ({ request }) => {
    await apiLogin(request, ADMIN);
    if (productId) await request.delete(`/api/products/${productId}`);
  });
});
