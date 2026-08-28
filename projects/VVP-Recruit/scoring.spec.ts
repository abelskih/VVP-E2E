import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { E2E_USER, E2E_PASS } from "./global-setup";

async function loginAsE2E(page: Page) {
  await page.goto("/");
  await page.getByLabel("Логин").fill(E2E_USER);
  await page.getByLabel("Пароль").fill(E2E_PASS);
  await page.getByRole("button", { name: /войти/i }).click();
  await expect(page).toHaveURL(/\/candidates/, { timeout: 15000 });
}

async function createTestVacancyAndCandidate(
  request: APIRequestContext
): Promise<{ vacancyId: number; candidateId: string }> {
  const loginRes = await request.post("/api/auth/login", {
    data: { username: E2E_USER, password: E2E_PASS },
  });
  expect(loginRes.ok()).toBe(true);

  const vacancyRes = await request.post("/api/vacancies", {
    data: { name: "E2E Score Vacancy" },
  });
  expect(vacancyRes.ok()).toBe(true);
  const vacancy = await vacancyRes.json();

  const candidateRes = await request.post("/api/candidates", {
    data: {
      name: "E2E Score Candidate",
      vacancyId: vacancy.id,
    },
  });
  expect(candidateRes.ok()).toBe(true);
  const candidate = await candidateRes.json();

  return {
    vacancyId: vacancy.id,
    candidateId: String(candidate.id),
  };
}

test.describe("Candidate scoring flow", () => {
  test("candidates list page loads without console errors @scenario:RECRUIT-CANDIDATES-CONSOLE-CLEAN", async ({ page }) => {
    await page.route("https://fonts.googleapis.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/css", body: "" })
    );
    await page.route("https://fonts.gstatic.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "font/woff2", body: "" })
    );

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await loginAsE2E(page);
    await expect(page.getByRole("main")).toBeVisible({ timeout: 10000 });

    const meaningfulErrors = consoleErrors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("DevTools") &&
        !e.includes("401") &&
        !e.includes("Unauthorized")
    );
    expect(meaningfulErrors).toHaveLength(0);
  });

  test("career score is persisted and remains visible after reloading @scenario:RECRUIT-CAREER-SCORE-PERSISTENCE", async ({ page, request }) => {
    await loginAsE2E(page);

    const seeded = await createTestVacancyAndCandidate(request);

    const saveScoreRes = await request.put("/api/candidates/career-scores", {
      data: {
        scores: [{ id: seeded.candidateId, score: 73 }],
      },
    });
    expect(saveScoreRes.ok()).toBe(true);
    await expect(saveScoreRes.json()).resolves.toEqual({ updated: 1 });

    await page.goto(`/candidates/${seeded.vacancyId}`);
    await expect(page.getByRole("main")).toBeVisible({ timeout: 10000 });

    const candidateRow = page.getByTestId(`row-candidate-${seeded.candidateId}`);
    await expect(candidateRow).toContainText("E2E Score Candidate", { timeout: 10000 });
    await expect(candidateRow.getByText("73", { exact: true })).toBeVisible();

    await page.reload();
    await expect(candidateRow.getByText("73", { exact: true })).toBeVisible({ timeout: 10000 });
  });
});

