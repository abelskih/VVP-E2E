import { expect, type Locator, type Page } from "@playwright/test";

export class ReleaseGatesPage {
  readonly heading: Locator;
  readonly dialog: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { name: "Release Gates" });
    this.dialog = page.getByRole("dialog");
  }

  async goto() {
    await this.page.goto("/gates");
    await expect(this.heading).toBeVisible();
  }

  gate(name: string) {
    return this.page
      .getByRole("heading", { name: new RegExp(`^${name}`) })
      .locator("xpath=ancestor::div[contains(@class, 'border-b')][1]");
  }

  async setUnitCoverage(name: string, value: number) {
    const gate = this.gate(name);
    await gate.getByRole("button", { name: "Редактировать" }).click();

    const coverageOperator = this.dialog.locator("[role='combobox']").filter({ hasText: "Coverage ≥ N%" });
    const rule = coverageOperator.locator(
      "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' p-4 ')][1]",
    );
    await rule.getByText("Ожидаемое значение", { exact: true }).locator("..").getByRole("textbox").fill(String(value));

    const saveResponse = this.page.waitForResponse((response) =>
      response.url().includes("/api/release-gates/") &&
      response.request().method() === "PATCH" &&
      response.ok(),
    );
    await this.dialog.getByRole("button", { name: "Сохранить" }).click();
    await saveResponse;
    await expect(this.dialog).toBeHidden();
  }
}
