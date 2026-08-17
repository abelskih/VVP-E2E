import { expect, type Locator, type Page } from "@playwright/test";

export class LoginPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;

  constructor(readonly page: Page) {
    this.email = page.getByRole("textbox", { name: "Email" });
    this.password = page.getByLabel("Пароль");
    this.submit = page.getByRole("button", { name: "Войти" });
  }

  async login(credentials: { email: string; password: string }) {
    await this.page.goto("/login");
    await this.email.fill(credentials.email);
    await this.password.fill(credentials.password);
    await this.submit.click();
    await expect(this.page).toHaveURL(/\/dashboard$/);
  }
}
