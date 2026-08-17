import {
  expect,
  test as base,
  type Page,
  type TestInfoError,
} from "@playwright/test";

import { DashboardPage } from "./pages/dashboard.page";
import { LoginPage } from "./pages/login.page";
import { ReleaseGatesPage } from "./pages/release-gates.page";
import { TestRunDetailPage } from "./pages/test-run-detail.page";
import { TestRunsPage } from "./pages/test-runs.page";
import {
  acquireGateMutationLock,
  assertGateMutationIsAllowed,
  assertSmokeFixtureBudget,
  cleanupSmokeResources,
  combineSmokeFailures,
  safelyAttachCleanupErrors,
  SMOKE_TIMEOUT_BUDGETS,
  withTimeout,
  type ApiRequestLike,
  type ReleaseGate,
  type SmokeCleanupState,
} from "./support/release-gate-smoke";

const credentials = {
  email: process.env.E2E_EMAIL ?? "admin@vvp.ru",
  password: process.env.E2E_PASSWORD ?? "admin1234",
};
const gateName = "Standard Product Gate";
const lowerCoverageThreshold = 50;
const upperCoverageThreshold = 60;
const reportedCoverage = 55;

assertSmokeFixtureBudget();

type SmokeFixtureState = SmokeCleanupState & {
  productName: string;
};

type DashboardAttention = {
  blockedProducts: Array<{
    productId: string;
    name: string;
  }>;
};

function testInfoErrorAsError(error: TestInfoError): Error {
  const restored = new Error(error.message ?? error.value ?? "Test failed");
  if (error.stack) {
    restored.stack = error.stack;
  }
  return restored;
}

const test = base.extend<{ releaseGateSmoke: SmokeFixtureState }>({
  releaseGateSmoke: [
    async ({ playwright, baseURL }, use, testInfo) => {
      // Skip gracefully when the guard flag is absent — throwing here would
      // fail the whole E2E run. The flag must only be set in an isolated env.
      if (!process.env.E2E_ALLOW_GLOBAL_GATE_MUTATION) {
        testInfo.skip(
          true,
          "Set E2E_ALLOW_GLOBAL_GATE_MUTATION=1 only in an isolated test environment.",
        );
        await use(undefined as unknown as SmokeFixtureState);
        return;
      }
      const effectiveBaseUrl =
        baseURL ?? process.env.E2E_BASE_URL ?? "http://localhost:80";
      assertGateMutationIsAllowed({
        optIn: process.env.E2E_ALLOW_GLOBAL_GATE_MUTATION,
        baseUrl: effectiveBaseUrl,
      });

      const lock = await acquireGateMutationLock({
        acquireTimeoutMs: SMOKE_TIMEOUT_BUDGETS.lockAcquireMs,
      });
      const uniqueSuffix = [
        Date.now().toString(36).toUpperCase(),
        testInfo.workerIndex,
        Math.random().toString(36).slice(2, 8).toUpperCase(),
      ].join("-");
      const state: SmokeFixtureState = {
        credentials,
        gateWasMutated: false,
        productCode: `E2E-GATE-${uniqueSuffix}`,
        productName: `Playwright Release Gate ${uniqueSuffix}`,
        tokenName: `release-gate-readiness-smoke-${uniqueSuffix}`,
      };
      let fixtureError: unknown;
      const cleanupErrors: Error[] = [];
      let cleanupRequest:
        | Awaited<ReturnType<typeof playwright.request.newContext>>
        | undefined;

      try {
        cleanupRequest = await playwright.request.newContext({
          baseURL: effectiveBaseUrl,
          timeout: SMOKE_TIMEOUT_BUDGETS.requestMs,
        });
        await use(state);
      } catch (error) {
        fixtureError = error;
      } finally {
        if (cleanupRequest) {
          const cleanupPromise = cleanupSmokeResources(
            cleanupRequest as unknown as ApiRequestLike,
            state,
          );
          try {
            cleanupErrors.push(
              ...(await withTimeout(
                cleanupPromise,
                SMOKE_TIMEOUT_BUDGETS.cleanupMs,
                "release-gate smoke cleanup",
              )),
            );
          } catch (error) {
            cleanupErrors.push(
              error instanceof Error ? error : new Error(String(error)),
            );
            void cleanupPromise.catch(() => undefined);
            try {
              await withTimeout(
                cleanupRequest.dispose(),
                SMOKE_TIMEOUT_BUDGETS.disposalMs,
                "cleanup request disposal",
              );
            } catch (disposeError) {
              cleanupErrors.push(
                new Error(
                  `cleanup request disposal: ${String(disposeError)}`,
                ),
              );
            }
            cleanupRequest = undefined;
          }
          if (cleanupRequest) {
            try {
              await withTimeout(
                cleanupRequest.dispose(),
                SMOKE_TIMEOUT_BUDGETS.disposalMs,
                "cleanup request disposal",
              );
            } catch (error) {
              cleanupErrors.push(
                new Error(`cleanup request disposal: ${String(error)}`),
              );
            }
          }
        }

        try {
          await lock.release({ cleanupErrors: [...cleanupErrors] });
        } catch (error) {
          cleanupErrors.push(
            new Error(`gate mutation lock release: ${String(error)}`),
          );
        }

        try {
          await withTimeout(
            safelyAttachCleanupErrors(testInfo, cleanupErrors),
            SMOKE_TIMEOUT_BUDGETS.attachmentsMs,
            "cleanup error attachments",
          );
        } catch {
          // Attachments are diagnostic and cannot consume the teardown reserve.
        }
      }

      if (fixtureError !== undefined || cleanupErrors.length > 0) {
        const primaryError =
          fixtureError ??
          (cleanupErrors.length > 0 && testInfo.error
            ? testInfoErrorAsError(testInfo.error)
            : undefined);
        throw combineSmokeFailures(primaryError, cleanupErrors);
      }
    },
    { auto: true, timeout: SMOKE_TIMEOUT_BUDGETS.fixtureMs },
  ],
});

async function expectDashboardAttention(
  page: Page,
  dashboard: DashboardPage,
  productId: string,
  shouldBeBlocked: boolean,
): Promise<void> {
  const attentionResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/dashboard/attention" &&
      response.ok(),
  );
  await dashboard.goto();
  const attention = (await (await attentionResponse).json()) as DashboardAttention;
  const blockedProductIds = attention.blockedProducts.map(
    (product) => product.productId,
  );
  if (shouldBeBlocked) {
    expect(blockedProductIds).toContain(productId);
  } else {
    expect(blockedProductIds).not.toContain(productId);
  }

  await expect(
    page
      .getByText("\u0417\u0430\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u043d\u043e", {
        exact: true,
      })
      .locator("xpath=following-sibling::div[1]"),
  ).toHaveText(String(attention.blockedProducts.length));

  const blockedProductsCard = page
    .getByText(
      "\u0417\u0430\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u043d\u043d\u044b\u0435 \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u044b",
      { exact: true },
    )
    .locator(
      "xpath=ancestor::div[contains(@class, 'border-amber-100')][1]",
    );
  const visibleBlockedProducts = attention.blockedProducts.slice(0, 3);
  const renderedProductLinks = blockedProductsCard.locator(
    'a[href^="/products/"]',
  );
  await expect(renderedProductLinks).toHaveCount(
    visibleBlockedProducts.length,
  );
  for (const product of visibleBlockedProducts) {
    const productLink = blockedProductsCard.locator(
      `a[href="/products/${product.productId}"]`,
    );
    await expect(productLink).toHaveCount(1);
    await expect(productLink).toHaveText(product.name);
    await expect(productLink).toBeVisible();
  }
  const expectedProductLinkCount = visibleBlockedProducts.filter(
    (product) => product.productId === productId,
  ).length;
  await expect(
    blockedProductsCard.locator(`a[href="/products/${productId}"]`),
  ).toHaveCount(expectedProductLinkCount);
}

test.describe.configure({ mode: "serial" });

test("@smoke recalculates run and Dashboard when the Unit coverage gate changes @scenario:RELEASE-GATE-READINESS-SMOKE", async ({
  page,
  releaseGateSmoke,
}) => {
  test.setTimeout(180_000);
  const login = new LoginPage(page);
  const runs = new TestRunsPage(page);
  const detail = new TestRunDetailPage(page);
  const gates = new ReleaseGatesPage(page);
  const dashboard = new DashboardPage(page);

  await login.login(credentials);

  const listedGates = await page.request.get("/api/release-gates");
  expect(
    listedGates.status(),
    `${listedGates.url()}: ${await listedGates.text()}`,
  ).toBe(200);
  releaseGateSmoke.gateSnapshot = (
    (await listedGates.json()) as ReleaseGate[]
  ).find((gate) => gate.name === gateName);
  expect(releaseGateSmoke.gateSnapshot, `${gateName} must exist`).toBeTruthy();

  const lowerThresholdRules = releaseGateSmoke.gateSnapshot!.rules
    .filter(
      (rule) =>
        !(rule.checkType === "Unit" && rule.operator === "coverage_gte"),
    )
    .concat({
      checkType: "Unit",
      operator: "coverage_gte",
      expectedValue: String(lowerCoverageThreshold),
      severity: "High",
      blocking: true,
      message: "Unit coverage",
    });
  releaseGateSmoke.gateWasMutated = true;
  const lowerGate = await page.request.patch(
    `/api/release-gates/${releaseGateSmoke.gateSnapshot!.id}`,
    { data: { rules: lowerThresholdRules } },
  );
  expect(
    lowerGate.status(),
    `${lowerGate.url()}: ${await lowerGate.text()}`,
  ).toBe(200);

  const createdProduct = await page.request.post("/api/products", {
    data: {
      code: releaseGateSmoke.productCode,
      name: releaseGateSmoke.productName,
      productType: "Internal Product",
      criticality: "Medium",
      status: "Active",
    },
  });
  expect(
    createdProduct.status(),
    `${createdProduct.url()}: ${await createdProduct.text()}`,
  ).toBe(201);
  releaseGateSmoke.productId = (
    (await createdProduct.json()) as { id: string }
  ).id;

  const createdScenario = await page.request.post(
    `/api/products/${releaseGateSmoke.productId}/critical-scenarios`,
    {
      data: {
        code: "RELEASE-GATE-READINESS-SMOKE",
        name: "Release Gate readiness smoke",
        description:
          "Automated smoke for release-gate recalculation and Dashboard readiness.",
        businessImpact:
          "A regression can show stale product readiness after a gate changes.",
        priority: "P0",
        automationStatus: "Automated",
        testReference: "e2e/test-runs/release-gate-readiness.smoke.spec.ts",
      },
    },
  );
  expect(
    createdScenario.status(),
    `${createdScenario.url()}: ${await createdScenario.text()}`,
  ).toBe(201);

  const createdToken = await page.request.post(
    `/api/products/${releaseGateSmoke.productId}/tokens`,
    { data: { name: releaseGateSmoke.tokenName } },
  );
  expect(
    createdToken.status(),
    `${createdToken.url()}: ${await createdToken.text()}`,
  ).toBe(201);
  const tokenBody = (await createdToken.json()) as {
    id: string;
    token: string;
  };
  releaseGateSmoke.tokenId = tokenBody.id;
  expect(tokenBody.token).toMatch(/^vvp_/);

  const completedAt = new Date();
  const startedAt = new Date(completedAt.getTime() - 5_000);
  const reportResponse = await page.request.post("/api/v1/reports", {
    headers: { Authorization: `Bearer ${tokenBody.token}` },
    data: {
      schemaVersion: "1.0",
      externalRunId: `${releaseGateSmoke.productCode}-RUN`,
      productId: releaseGateSmoke.productCode,
      source: "SDK",
      sdkVersion: "1.0.1",
      contractVersion: "1.0.1",
      triggerType: "Manual",
      version: "0.0.1",
      branch: "e2e/release-gate-readiness",
      commitSha: "0123456789abcdef0123456789abcdef01234567",
      environment: "playwright",
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      checks: [
        {
          type: "Typecheck",
          name: "Typecheck",
          status: "Passed",
          mandatory: true,
          blocking: true,
        },
        {
          type: "Lint",
          name: "Lint",
          status: "Passed",
          mandatory: true,
          blocking: true,
        },
        {
          type: "Build",
          name: "Build",
          status: "Passed",
          mandatory: true,
          blocking: true,
        },
        {
          type: "Unit",
          name: "Unit tests",
          status: "Passed",
          mandatory: true,
          blocking: true,
          passedCount: 10,
          failedCount: 0,
          totalCount: 10,
          coveragePercent: reportedCoverage,
        },
        {
          type: "E2E",
          name: "Playwright E2E",
          status: "Passed",
          mandatory: true,
          blocking: true,
          passedCount: 1,
          failedCount: 0,
          totalCount: 1,
          testCases: [
            {
              name: "recalculates run and Dashboard when the Unit coverage gate changes @scenario:RELEASE-GATE-READINESS-SMOKE",
              suite: "release-gate-readiness.smoke.spec.ts",
              status: "Passed",
              durationMs: 5_000,
            },
          ],
        },
      ],
    },
  });
  expect(
    reportResponse.status(),
    `${reportResponse.url()}: ${await reportResponse.text()}`,
  ).toBe(201);
  const runId = ((await reportResponse.json()) as { runId: string }).runId;

  await gates.goto();

  await runs.goto();
  await runs.selectProduct(releaseGateSmoke.productName);
  await expect(runs.runRow(runId)).toContainText("e2e/release-gate-readiness");
  await runs.openRun(runId);
  await detail.expectCoverageGate(
    lowerCoverageThreshold,
    "\u0423\u0441\u043f\u0435\u0445",
  );

  await expectDashboardAttention(
    page,
    dashboard,
    releaseGateSmoke.productId,
    false,
  );

  await gates.goto();
  await gates.setUnitCoverage(gateName, upperCoverageThreshold);

  await runs.goto();
  await runs.selectProduct(releaseGateSmoke.productName);
  await runs.openRun(runId);
  await detail.expectCoverageGate(
    upperCoverageThreshold,
    "\u041f\u0440\u043e\u0432\u0430\u043b",
  );

  await expectDashboardAttention(
    page,
    dashboard,
    releaseGateSmoke.productId,
    true,
  );
});
