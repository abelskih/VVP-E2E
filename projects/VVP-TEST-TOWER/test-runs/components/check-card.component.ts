import type { Locator, Page } from "@playwright/test";

export class CheckCardComponent {
  readonly root: Locator;

  constructor(readonly page: Page, checkId: string) {
    this.root = page.getByTestId(`check-card-${checkId}`);
  }

  get testCasesButton() {
    return this.root.getByRole("button", { name: /Результаты тестов/ });
  }

  get failedOnlyButton() {
    return this.root.getByRole("button", { name: "Только упавшие" });
  }

  get showAllButton() {
    return this.root.getByRole("button", { name: "Показать все" });
  }

  get toggleButton() {
    return this.root.locator("button[aria-expanded]");
  }

  get rawOutputTab() {
    return this.root.getByRole("button", { name: "Raw output" });
  }

  get findingButton() {
    return this.root.getByRole("button", {
      name: "Создать Finding",
      exact: true,
    });
  }

  get truncatedMarker() {
    return this.root.getByText("--- Лог обрезан ---", { exact: true });
  }

  text(value: string) {
    return this.root.getByText(value, { exact: true });
  }

  rawOutput(value: string) {
    return this.root.getByText(value);
  }

  async openTestCases() {
    await this.expand();
    await this.testCasesButton.click();
  }

  async showFailedOnly() {
    await this.failedOnlyButton.click();
  }

  async showAll() {
    await this.showAllButton.click();
  }

  async openLogs() {
    await this.expand();
    await this.rawOutputTab.click();
  }

  async hideLogs() {
    await this.toggleButton.click();
  }

  async openFinding() {
    await this.expand();
    await this.findingButton.click();
  }

  async expand() {
    if (await this.toggleButton.getAttribute("aria-expanded") !== "true") {
      await this.toggleButton.click();
    }
  }
}
