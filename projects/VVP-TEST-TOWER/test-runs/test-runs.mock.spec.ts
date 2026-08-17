import { expect, test } from "@playwright/test";

import {
  PRODUCT_ID,
  RUN_ID,
  installAuthenticatedRoutes,
  installListRoute,
  runSummary,
} from "./fixtures/test-runs";
import { TestRunsPage } from "./pages/test-runs.page";

test.describe("@mock Test Runs list", () => {
  test.beforeEach(async ({ page }) => {
    await installAuthenticatedRoutes(page);
  });

  test("renders runs and opens detail @scenario:TEST-RUNS-LIST-MOCK", async ({ page }) => {
    await installListRoute(page, () => ({
      body: {
        items: [runSummary()],
        total: 1,
        page: 1,
        pageSize: 20,
      },
    }));
    const runs = new TestRunsPage(page);

    await runs.goto();

    await expect(runs.runRow(RUN_ID)).toContainText("VVP Test Tower");
    await expect(runs.runRow(RUN_ID)).toContainText("main");
    await expect(runs.runRow(RUN_ID)).toContainText("deadbee");
    await expect(runs.runRow(RUN_ID)).toContainText("Не пройдено");
    await expect(runs.runRow(RUN_ID)).toContainText("Заблокирован");
    await expect(runs.runRow(RUN_ID)).toContainText("1 fail / 5");

    await runs.openRun(RUN_ID);
    await expect(page).toHaveURL(`/test-runs/${RUN_ID}`);
  });

  test("applies filters and resets pagination", async ({ page }) => {
    const urls: URL[] = [];
    await installListRoute(page, (url) => {
      urls.push(url);
      return {
        body: {
          items: [runSummary()],
          total: 45,
          page: Number(url.searchParams.get("page")),
          pageSize: 20,
        },
      };
    });
    const runs = new TestRunsPage(page);

    await runs.goto();
    await runs.goNext();
    await expect
      .poll(() => urls.at(-1)?.searchParams.get("page"))
      .toBe("2");

    await runs.selectProduct("VVP Test Tower");
    await runs.selectStatus("Failed");
    await runs.fillBranch("release");

    await expect
      .poll(() => urls.at(-1)?.searchParams.get("branch"))
      .toBe("release");
    expect(urls.at(-1)?.searchParams.get("page")).toBe("1");
    expect(urls.at(-1)?.searchParams.get("productId")).toBe(PRODUCT_ID);
    expect(urls.at(-1)?.searchParams.get("overallStatus")).toBe("Failed");
  });

  test("paginates within boundaries", async ({ page }) => {
    await installListRoute(page, (url) => ({
      body: {
        items: [runSummary()],
        total: 45,
        page: Number(url.searchParams.get("page")),
        pageSize: 20,
      },
    }));
    const runs = new TestRunsPage(page);

    await runs.goto();
    await expect(runs.previousButton).toBeDisabled();
    await runs.goNext();
    await expect(runs.paginationSummary).toHaveText("Показано 21 - 40 из 45");
    await runs.goNext();
    await expect(runs.paginationSummary).toHaveText("Показано 41 - 45 из 45");
    await expect(runs.nextButton).toBeDisabled();
    await runs.goPrevious();
    await expect(runs.paginationSummary).toHaveText("Показано 21 - 40 из 45");
  });

  test("shows the empty state", async ({ page }) => {
    await installListRoute(page, () => ({
      body: { items: [], total: 0, page: 1, pageSize: 20 },
    }));
    const runs = new TestRunsPage(page);

    await runs.goto();

    await expect(runs.emptyState).toBeVisible();
  });

  test("shows a request error", async ({ page }) => {
    await installListRoute(page, () => ({
      status: 500,
      body: { error: "Database unavailable" },
    }));
    const runs = new TestRunsPage(page);

    await runs.goto();

    await expect(runs.errorState).toHaveText(
      "Не удалось загрузить тестовые прогоны.",
    );
  });
});
