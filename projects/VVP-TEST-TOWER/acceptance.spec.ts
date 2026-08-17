/**
 * Главный сквозной сценарий приёмки MVP (§22 спецификации).
 *
 * Подготовка данных (продукт, токен, отчёты) выполняется через публичный API —
 * тот же путь, что использует SDK. Ключевые точки проверяются через UI.
 * Требует запущенных API Server и web (pnpm dev) и сид-пользователей.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const ADMIN = { email: "admin@vvp.ru", password: "admin1234" };
const VIEWER = { email: "viewer@vvp.ru", password: "viewer1234" };

const CODE = `E2E-${Date.now().toString(36).toUpperCase()}`;

function report(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1.0",
    productId: CODE,
    source: "SDK",
    triggerType: "Manual",
    branch: "main",
    version: "0.0.1",
    sdkVersion: "1.0.1",
    contractVersion: "1.0.1",
    checks: [
      { type: "Typecheck", name: "Typecheck", status: "Passed", mandatory: true, blocking: true },
      { type: "Lint", name: "Lint", status: "Passed", mandatory: true, blocking: false },
      { type: "Unit", name: "Unit tests", status: "Passed", mandatory: true, blocking: true, passedCount: 12, failedCount: 0, totalCount: 12, coveragePercent: 80 },
      { type: "Build", name: "Build", status: "Passed", mandatory: true, blocking: true },
      { type: "Regression", name: "Regression tests", status: "Passed", mandatory: true, blocking: true },
    ],
    ...overrides,
  };
}

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

test.describe.serial("Acceptance scenario §22", () => {
  let productId: string;
  let token: string;
  let failedRunId: string;
  let findingId: string;

  test("admin creates a product, assigns roles and creates an API token", async ({ page }) => {
    // 1. Администратор входит в систему (UI).
    await uiLogin(page, ADMIN);
    await page.goto("/dashboard");
    await expect(page.getByText(/dashboard|продукт/i).first()).toBeVisible();

    // 2-3. Создаёт продукт и назначает владельцев (API — как из формы).
    const users = await page.request.get("/api/users");
    const userList = (await users.json()).items ?? (await users.json());
    const owner = userList.find((u: { role: string }) => u.role === "Product Owner");
    const ql = userList.find((u: { role: string }) => u.role === "Quality Lead");

    const created = await page.request.post("/api/products", {
      data: {
        code: CODE,
        name: `E2E Acceptance ${CODE}`,
        productType: "Internal Product",
        criticality: "Medium",
        status: "Active",
        ownerUserId: owner?.id,
        qualityLeadUserId: ql?.id,
      },
    });
    expect(created.status()).toBe(201);
    productId = (await created.json()).id;

    // 6. Создаёт API token.
    const tok = await page.request.post(`/api/products/${productId}/tokens`, {
      data: { name: "e2e-token" },
    });
    expect(tok.status()).toBe(201);
    token = (await tok.json()).token;
    expect(token).toMatch(/^vvp_/);

    // Продукт виден в реестре продуктов (UI).
    await page.goto("/products");
    await page.getByPlaceholder(/поиск/i).first().fill(CODE);
    await expect(page.getByText(CODE).first()).toBeVisible();
  });

  test("a failed mandatory check blocks the release", async ({ page }) => {
    // 7-13. SDK отправляет отчёт с упавшей обязательной проверкой.
    const res = await page.request.post("/api/v1/reports", {
      headers: { Authorization: `Bearer ${token}` },
      data: report({
        checks: [
          {
            type: "Unit",
            name: "Unit tests",
            status: "Failed",
            mandatory: true,
            blocking: true,
            passedCount: 10,
            failedCount: 2,
            totalCount: 12,
            errorMessage: "2 tests failed: booking flow",
          },
        ],
      }),
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    failedRunId = body.runId;
    // 14, 16. Release readiness рассчитан и релиз заблокирован.
    expect(body.releaseReadinessStatus).toBe("Blocked");

    // 15. В карточке продукта виден результат (UI).
    await uiLogin(page, ADMIN);
    await page.goto(`/products/${productId}`);
    await expect(
      page.getByText(/Blocked|Заблокирован/).filter({ visible: true }).first(),
    ).toBeVisible();
  });

  test("a finding is created from the failed check and assigned", async ({ page }) => {
    await apiLogin(page.request, ADMIN);
    const users = await page.request.get("/api/users");
    const list = (await users.json()).items ?? (await users.json());
    const developer = list.find((u: { role: string }) => u.role === "Developer") ?? list[0];

    // 17. Из упавшей проверки создаётся Finding.
    const res = await page.request.post("/api/findings", {
      data: {
        productId,
        testRunId: failedRunId,
        type: "Bug",
        title: "Unit tests: падение в booking flow",
        severity: "High",
        regressionTestRequired: true,
        ownerUserId: developer?.id, // 18 (часть). Назначен разработчику.
      },
    });
    expect(res.status()).toBe(201);
    findingId = (await res.json()).id;

    // 18. Finding нельзя закрыть без regression-теста.
    const close = await page.request.patch(`/api/findings/${findingId}`, {
      data: { status: "Resolved" },
    });
    expect(close.status()).toBe(400);
  });

  test("a new successful run updates readiness and the dashboard", async ({ page }) => {
    // Закрываем finding с добавленным regression-тестом.
    await apiLogin(page.request, ADMIN);
    const close = await page.request.patch(`/api/findings/${findingId}`, {
      data: {
        status: "Resolved",
        regressionTestAdded: "tests/regression/booking-flow.test.ts",
        resolution: "Исправлено, добавлен regression-тест",
      },
    });
    expect(close.status()).toBe(200);

    // 19. Новый успешный прогон обновляет readiness.
    const res = await page.request.post("/api/v1/reports", {
      headers: { Authorization: `Bearer ${token}` },
      data: report(),
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.releaseReadinessStatus).not.toBe("Blocked");

    // 20. Dashboard показывает актуальный статус (UI).
    await uiLogin(page, ADMIN);
    await page.goto("/dashboard");
    await expect(page.getByText(/продукт/i).first()).toBeVisible();
    // Дашборд загрузился: виден созданный продукт или числовые метрики.
    await expect(page.locator("main")).not.toContainText("Загрузка", { timeout: 15_000 });
  });

  test("a user without access cannot see the product", async ({ page }) => {
    // 21. Пользователь без доступа не может увидеть продукт.
    await apiLogin(page.request, VIEWER);
    const res = await page.request.get(`/api/products/${productId}`);
    expect([403, 404]).toContain(res.status());

    await uiLogin(page, VIEWER);
    await page.goto(`/products/${productId}`);
    // Данные продукта не должны быть видны пользователю без доступа.
    await expect(page.getByText(CODE)).toHaveCount(0);
  });

  test.afterAll(async ({ request }) => {
    await apiLogin(request, ADMIN);
    if (productId) await request.delete(`/api/products/${productId}`);
  });
});
