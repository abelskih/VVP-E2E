import type { Page, Route } from "@playwright/test";

export const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
export const RUN_ID = "22222222-2222-4222-8222-222222222222";
export const CHECK_ID = "33333333-3333-4333-8333-333333333333";

export const adminUser = {
  id: "44444444-4444-4444-8444-444444444444",
  email: "admin@vvp.ru",
  name: "E2E Admin",
  role: "System Admin",
  isActive: true,
};

export const products = [
  { id: PRODUCT_ID, code: "TOWER", name: "VVP Test Tower" },
];

export function runSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    productId: PRODUCT_ID,
    productCode: "TOWER",
    productName: "VVP Test Tower",
    externalRunId: null,
    source: "SDK",
    triggerType: "CI",
    branch: "main",
    commitSha: "deadbeefcafe",
    version: null,
    environment: "ci",
    startedAt: "2026-07-20T10:00:00.000Z",
    completedAt: "2026-07-20T10:00:01.234Z",
    durationMs: 1234,
    overallStatus: "Failed",
    releaseGateStatus: "Blocked",
    sdkVersion: "1.3.0",
    runnerVersion: null,
    initiatedBy: null,
    checksTotal: 5,
    checksFailed: 1,
    createdAt: "2026-07-20T10:00:01.234Z",
    ...overrides,
  };
}

export function runDetail(overrides: Record<string, unknown> = {}) {
  return {
    run: runSummary(),
    checks: [
      {
        id: CHECK_ID,
        checkType: "Unit",
        name: "Unit tests",
        command: "pnpm test",
        status: "Failed",
        mandatory: true,
        blocking: true,
        passedCount: 11,
        failedCount: 1,
        skippedCount: 0,
        totalCount: 12,
        durationMs: 900,
        coveragePercent: 64.2,
        summary: "One test failed",
        errorMessage: "booking flow failed",
        outputTruncated: true,
        hasRawOutput: true,
        testCasesCount: 2,
        linkedScenarios: [],
      },
    ],
    gateEvaluation: {
      status: "Blocked",
      gateCode: "STANDARD_GATE",
      gateName: "Standard Gate",
      evaluatedAt: "2026-07-20T10:00:02.000Z",
      testRunId: RUN_ID,
      rules: [],
      explanation: "Blocking check failed",
    },
    ...overrides,
  };
}

export async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

export async function installAuthenticatedRoutes(
  page: Page,
  role = "System Admin",
) {
  await page.route("**/api/auth/me", (route) =>
    json(route, { ...adminUser, role }),
  );
  await page.route("**/api/products*", (route) => json(route, products));
}

export async function installListRoute(
  page: Page,
  resolver: (url: URL) => { status?: number; body: unknown },
) {
  await page.route("**/api/test-runs?**", async (route) => {
    const result = resolver(new URL(route.request().url()));
    await json(route, result.body, result.status ?? 200);
  });
}
