import { expect, test } from "@playwright/test";

import {
  CHECK_ID,
  RUN_ID,
  installAuthenticatedRoutes,
  installListRoute,
  json,
  runDetail,
} from "./fixtures/test-runs";
import { TestRunDetailPage } from "./pages/test-run-detail.page";

async function installDetailRoute(
  page: Parameters<typeof installAuthenticatedRoutes>[0],
  body: unknown = runDetail(),
  status = 200,
) {
  await page.route(`**/api/test-runs/${RUN_ID}`, (route) =>
    json(route, body, status),
  );
}

test.describe("@mock Test Run detail", () => {
  test.beforeEach(async ({ page }) => {
    await installAuthenticatedRoutes(page);
  });

  test("renders run, gate, checks, metadata, and average coverage @scenario:TEST-RUN-DETAIL-MOCK", async ({
    page,
  }) => {
    const detail = runDetail();
    const secondCheck = {
      ...detail.checks[0],
      id: "55555555-5555-4555-8555-555555555555",
      name: "API unit tests",
      status: "Passed",
      coveragePercent: 35.8,
      errorMessage: null,
      outputTruncated: false,
      hasRawOutput: false,
      testCasesCount: 0,
    };
    await installDetailRoute(page, {
      ...detail,
      checks: [...detail.checks, secondCheck],
    });
    const run = new TestRunDetailPage(page);

    await run.goto(RUN_ID);

    await expect(run.heading).toContainText("22222222");
    await expect(run.text("VVP Test Tower")).toBeVisible();
    await expect(run.text("Release Readiness")).toBeVisible();
    await expect(run.text("Blocking check failed")).toBeVisible();
    await expect(run.check(CHECK_ID).root).toContainText("Unit tests");
    await expect(run.check(CHECK_ID).root).toContainText("Coverage: 64.2%");
    await expect(run.text("Avg coverage Unit")).toBeVisible();
    await expect(run.text("50%")).toBeVisible();
    await expect(run.text("e2e/test-runs")).toHaveCount(0);
    await expect(run.branchCommit).toBeVisible();
    await expect(run.text("ci")).toBeVisible();
  });

  test("loads test cases lazily and filters failed cases", async ({ page }) => {
    let requests = 0;
    await installDetailRoute(page);
    await page.route(
      `**/api/test-runs/${RUN_ID}/checks/${CHECK_ID}/test-cases`,
      (route) => {
        requests += 1;
        return json(route, {
          items: [
            {
              id: "case-fail",
              name: "rejects invalid booking",
              suite: "booking",
              className: null,
              status: "Failed",
              durationMs: 12,
              errorMessage: "expected 400",
            },
            {
              id: "case-pass",
              name: "creates booking",
              suite: "booking",
              className: null,
              status: "Passed",
              durationMs: 8,
              errorMessage: null,
            },
          ],
          total: 2,
        });
      },
    );
    const run = new TestRunDetailPage(page);
    const check = run.check(CHECK_ID);

    await run.goto(RUN_ID);
    expect(requests).toBe(0);
    await check.openTestCases();
    await expect(check.text("rejects invalid booking")).toBeVisible();
    await expect(check.text("creates booking")).toBeVisible();
    expect(requests).toBe(1);
    await check.showFailedOnly();
    await expect(check.text("creates booking")).toHaveCount(0);
    await check.showAll();
    await expect(check.text("creates booking")).toBeVisible();
  });

  test("loads, marks, and hides truncated raw output", async ({ page }) => {
    let requests = 0;
    await installDetailRoute(page);
    await page.route(
      `**/api/test-runs/${RUN_ID}/checks/${CHECK_ID}/output`,
      (route) => {
        requests += 1;
        return json(route, {
          rawOutput: "FAIL booking flow",
          outputTruncated: true,
        });
      },
    );
    const run = new TestRunDetailPage(page);
    const check = run.check(CHECK_ID);

    await run.goto(RUN_ID);
    expect(requests).toBe(0);
    await check.openLogs();
    await expect(check.rawOutput("FAIL booking flow")).toBeVisible();
    await expect(check.truncatedMarker).toBeVisible();
    expect(requests).toBe(1);
    await check.hideLogs();
    await expect(check.rawOutput("FAIL booking flow")).toHaveCount(0);
  });

  test("creates a Finding from a failed check", async ({ page }) => {
    let submitted: unknown;
    await installDetailRoute(page);
    await page.route(`**/api/test-runs/${RUN_ID}/findings`, async (route) => {
      submitted = route.request().postDataJSON();
      await json(
        route,
        {
          id: "finding-1",
          productId: "11111111-1111-4111-8111-111111111111",
          testRunId: RUN_ID,
          type: "Bug",
          title: "Booking regression",
          severity: "Critical",
          status: "Open",
          createdAt: "2026-07-20T10:05:00.000Z",
        },
        201,
      );
    });
    const run = new TestRunDetailPage(page);

    await run.goto(RUN_ID);
    await run.check(CHECK_ID).openFinding();
    await run.submitFinding({
      title: "Booking regression",
      description: "Checkout fails for a valid booking",
      type: "Bug",
      severity: "Critical",
    });

    expect(submitted).toEqual({
      title: "Booking regression",
      description: "Checkout fails for a valid booking",
      type: "Bug",
      severity: "Critical",
      checkResultId: CHECK_ID,
    });
  });

  test("hides Finding creation from a Viewer", async ({ page }) => {
    await page.unroute("**/api/auth/me");
    await installAuthenticatedRoutes(page, "Viewer");
    await installDetailRoute(page);
    const run = new TestRunDetailPage(page);

    await run.goto(RUN_ID);

    await expect(run.check(CHECK_ID).findingButton).toHaveCount(0);
  });

  test("shows access denied, load error, and missing run states", async ({
    page,
  }) => {
    const run = new TestRunDetailPage(page);

    await installDetailRoute(page, { error: "Forbidden" }, 403);
    await run.goto(RUN_ID);
    await expect(run.accessDenied).toBeVisible();

    await page.unroute(`**/api/test-runs/${RUN_ID}`);
    await installDetailRoute(page, { error: "Unavailable" }, 500);
    await run.goto(RUN_ID);
    await expect(run.loadError).toBeVisible();

    await page.unroute(`**/api/test-runs/${RUN_ID}`);
    await installDetailRoute(page, null);
    await run.goto(RUN_ID);
    await expect(run.notFound).toBeVisible();
  });

  test("returns to the Test Runs list", async ({ page }) => {
    await installDetailRoute(page);
    await installListRoute(page, () => ({
      body: { items: [], total: 0, page: 1, pageSize: 20 },
    }));
    const run = new TestRunDetailPage(page);

    await run.goto(RUN_ID);
    await run.goBack();

    await expect(page).toHaveURL("/test-runs");
  });
});
