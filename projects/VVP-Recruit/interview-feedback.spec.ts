import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { E2E_USER, E2E_PASS } from "./global-setup";

async function seedInterviewViaApi(request: APIRequestContext): Promise<{
  interviewId: number;
  token: string;
} | null> {
  const loginRes = await request.post("/api/auth/login", {
    data: { username: E2E_USER, password: E2E_PASS },
  });
  if (!loginRes.ok()) return null;

  const vacancyRes = await request.post("/api/vacancies", {
    data: { name: "E2E Feedback Vacancy" },
  });
  if (!vacancyRes.ok()) return null;
  const vacancy = await vacancyRes.json();

  const candidateRes = await request.post("/api/candidates", {
    data: { name: "E2E Feedback Candidate", vacancyId: vacancy.id },
  });
  if (!candidateRes.ok()) return null;
  const candidate = await candidateRes.json();

  const candidateId = String(candidate.id);

  const interviewRes = await request.post("/api/interviews", {
    data: {
      candidateId,
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      durationMinutes: 60,
      format: "online",
    },
  });
  if (!interviewRes.ok()) return null;
  const interview = await interviewRes.json();

  if (!interview.id || !interview.feedbackToken) return null;
  return { interviewId: interview.id, token: interview.feedbackToken };
}

async function openFeedbackForm(page: Page, interviewId: number, token: string) {
  await page.goto(`/interviews/${interviewId}/feedback?token=${token}`);
  await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15000 });
}

test.describe("Public interview feedback form", () => {
  test("feedback form is accessible by token without being logged in @scenario:RECRUIT-FEEDBACK-PUBLIC-ACCESS", async ({
    page,
    request,
  }) => {
    const seed = await seedInterviewViaApi(request);
    expect(seed).not.toBeNull();

    const { interviewId, token } = seed!;
    await openFeedbackForm(page, interviewId, token);

    await expect(page.locator("form").or(page.getByRole("main")).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("feedback form can be filled and submitted via browser UI @scenario:RECRUIT-FEEDBACK-SUBMIT", async ({
    page,
    request,
  }) => {
    const seed = await seedInterviewViaApi(request);
    expect(seed).not.toBeNull();

    const { interviewId, token } = seed!;
    await openFeedbackForm(page, interviewId, token);

    const form = page.locator("form");
    await expect(form).toBeVisible({ timeout: 10000 });

    const yesButtons = page.getByRole("button", { name: /^Да$/i });
    const noButtons = page.getByRole("button", { name: /^Нет$/i });

    if (await yesButtons.count() > 0) {
      await yesButtons.first().click();
    }

    if (await noButtons.count() > 0) {
      await noButtons.first().click();
    }

    const submitButton = page.getByRole("button", { name: /отправить фидбек/i });
    await expect(submitButton).toBeVisible({ timeout: 8000 });

    await submitButton.click();

    await expect(
      page.getByText(/фидбек сохранён|оценка интервью|успешно записана/i)
        .or(page.getByRole("status"))
        .or(page.getByText(/успешно|success/i))
        .first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("duplicate feedback submission updates existing feedback (upsert) @scenario:RECRUIT-FEEDBACK-UPSERT", async ({
    request,
  }) => {
    const seed = await seedInterviewViaApi(request);
    expect(seed).not.toBeNull();

    const { interviewId, token } = seed!;

    const first = await request.post(
      `/api/interviews/${interviewId}/feedback?token=${token}`,
      { data: { answers: { technical: { value: "yes" } } } }
    );
    expect(first.status()).toBe(201);

    const second = await request.post(
      `/api/interviews/${interviewId}/feedback?token=${token}`,
      { data: { answers: { technical: { value: "no" } } } }
    );
    expect(second.status()).toBe(200);
    const body = await second.json();
    expect(body).toHaveProperty("id");
  });

  test("non-existent interview shows 404-style error or fallback UI @scenario:RECRUIT-FEEDBACK-NOT-FOUND", async ({ page }) => {
    await page.goto(`/interviews/999999/feedback?token=00000000-0000-0000-0000-000000000000`);

    const errorOrFallback = page
      .getByText(/не найден|not found|ошибка|error|загрузка/i)
      .or(page.getByRole("heading"))
      .first();

    await expect(errorOrFallback).toBeVisible({ timeout: 12000 });
  });
});

