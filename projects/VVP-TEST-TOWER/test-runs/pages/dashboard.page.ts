import { expect, type Locator, type Page } from "@playwright/test";

export class DashboardPage {
  readonly heading: Locator;
  readonly attention: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { name: "Dashboard" });
    this.attention = page
      .getByRole("heading", { name: "Требует внимания" })
      .locator("xpath=ancestor::section[1]");
  }

  async goto() {
    await this.page.goto("/dashboard");
    await expect(this.heading).toBeVisible();
  }

  product(name: string) {
    return this.attention.getByRole("link", { name, exact: true });
  }
}
