import { expect, test, type APIResponse } from "@playwright/test";

import { TestRunDetailPage } from "./pages/test-run-detail.page";
import { TestRunsPage } from "./pages/test-runs.page";

const ADMIN = { email: "admin@vvp.ru", password: "admin1234" };

async function expectStatus(response: APIResponse, expected: number) {
  expect(
    response.status(),
    `${response.url()}: ${await response.text()}`,
  ).toBe(expected);
}

test("@smoke creates a real run and opens it from list to detail", async ({
  page,
}, testInfo) => {
  const code = `E2E-RUNS-${Date.now().toString(36).toUpperCase()}-${testInfo.workerIndex}`;
  let productId: string | undefined;

  try {
    const login = await page.request.post("/api/auth/login", { data: ADMIN });
    await expectStatus(login, 200);

    const created = await page.request.post("/api/products", {
      data: {
        code,
        name: `Playwright Test Runs ${code}`,
        productType: "Internal Product",
        criticality: "Medium",
        status: "Active",
      },
    });
    await expectStatus(created, 201);
    productId = (await created.json()).id;

    const tokenResponse = await page.request.post(
      `/api/products/${productId}/tokens`,
      { data: { name: "test-runs-smoke" } },
    );
    await expectStatus(tokenResponse, 201);
    const token = (await tokenResponse.json()).token as string;
    expect(token).toMatch(/^vvp_/);

    const reportResponse = await page.request.post("/api/v1/reports", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        schemaVersion: "1.0",
        productId: code,
        source: "SDK",
        sdkVersion: "1.0.1",
        contractVersion: "1.0.1",
        triggerType: "Manual",
        version: "0.0.1",
        branch: "e2e/test-runs",
        commitSha: "abcdef1234567890",
        environment: "playwright",
        checks: [
          {
            type: "Unit",
            name: "Playwright smoke unit check",
            status: "Failed",
            mandatory: true,
            blocking: true,
            passedCount: 1,
            failedCount: 1,
            totalCount: 2,
            rawOutput: "FAIL rejects invalid booking",
            testCases: [
              {
                name: "creates booking",
                suite: "booking",
                status: "Passed",
                durationMs: 5,
              },
              {
                name: "rejects invalid booking",
                suite: "booking",
                status: "Failed",
                durationMs: 7,
                errorMessage: "expected 400",
              },
            ],
          },
        ],
      },
    });
    await expectStatus(reportResponse, 201);
    const runId = (await reportResponse.json()).runId as string;

    const detailResponse = await page.request.get(`/api/test-runs/${runId}`);
    await expectStatus(detailResponse, 200);
    const detailBody = await detailResponse.json();
    const checkId = detailBody.checks[0].id as string;

    const runs = new TestRunsPage(page);
    await runs.goto();
    await runs.selectProduct(`Playwright Test Runs ${code}`);
    await expect(runs.runRow(runId)).toContainText("e2e/test-runs");
    await expect(runs.runRow(runId)).toContainText("1 fail / 1");
    await runs.openRun(runId);

    const detail = new TestRunDetailPage(page);
    await expect(detail.heading).toContainText(runId.split("-")[0]);
    const check = detail.check(checkId);
    await expect(check.root).toContainText("Playwright smoke unit check");
    await expect(check.root).toContainText("Не пройдено");
    await check.openTestCases();
    await expect(check.text("rejects invalid booking")).toBeVisible();
    await check.openLogs();
    await expect(check.rawOutput("FAIL rejects invalid booking")).toBeVisible();
  } finally {
    if (productId) {
      await page.request.post("/api/auth/login", { data: ADMIN });
      const cleanup = await page.request.delete(`/api/products/${productId}`);
      if (![200, 204].includes(cleanup.status())) {
        await testInfo.attach("cleanup-error", {
          body: await cleanup.text(),
          contentType: "application/json",
        });
      }
      expect([200, 204]).toContain(cleanup.status());
    }
  }
});
