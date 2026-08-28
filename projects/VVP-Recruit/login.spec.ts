import { test, expect } from "@playwright/test";
import { E2E_USER, E2E_PASS } from "./global-setup";

test.describe("Login flow", () => {
  test("unauthenticated user sees the login form at root @scenario:RECRUIT-AUTH-LOGIN-FORM", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /вход в систему/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByLabel("Логин")).toBeVisible();
    await expect(page.getByLabel("Пароль")).toBeVisible();
  });

  test("navigating to a protected route while unauthenticated shows the login form @scenario:RECRUIT-AUTH-PROTECTED-ROUTE", async ({
    page,
  }) => {
    await page.goto("/candidates");
    await expect(
      page.getByRole("heading", { name: /вход в систему/i })
        .or(page.getByLabel("Логин"))
        .first()
    ).toBeVisible({ timeout: 10000 });
    expect(page.url()).not.toMatch(/\/candidates\/\d/);
  });

  test("wrong credentials show an error message @scenario:RECRUIT-AUTH-INVALID-CREDENTIALS", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Логин").fill("nobody_at_all");
    await page.getByLabel("Пароль").fill("wrongpassword");
    await page.getByRole("button", { name: /войти/i }).click();
    await expect(
      page.getByText(/неверный|ошибка|invalid|error|incorrect/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test("correct credentials redirect to candidates page @scenario:RECRUIT-AUTH-LOGIN", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Логин").fill(E2E_USER);
    await page.getByLabel("Пароль").fill(E2E_PASS);
    await page.getByRole("button", { name: /войти/i }).click();
    await expect(page).toHaveURL(/\/candidates/, { timeout: 15000 });
  });

  test("logout ends session and shows login form again @scenario:RECRUIT-AUTH-LOGOUT", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Логин").fill(E2E_USER);
    await page.getByLabel("Пароль").fill(E2E_PASS);
    await page.getByRole("button", { name: /войти/i }).click();
    await expect(page).toHaveURL(/\/candidates/, { timeout: 15000 });

    await page.getByRole("button", { name: /E2E Test Runner/i }).click();
    await page.getByRole("menuitem", { name: /выйти|logout|sign out/i }).click();
    await expect(page.getByRole("heading", { name: /вход в систему/i })).toBeVisible({
      timeout: 10000,
    });
  });
});

