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

  get showLogsButton() {
    return this.root.getByRole("button", { name: "Показать логи" });
  }

  get hideLogsButton() {
    return this.root.getByRole("button", { name: "Скрыть логи" });
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
    await this.testCasesButton.click();
  }

  async showFailedOnly() {
    await this.failedOnlyButton.click();
  }

  async showAll() {
    await this.showAllButton.click();
  }

  async openLogs() {
    await this.showLogsButton.click();
  }

  async hideLogs() {
    await this.hideLogsButton.click();
  }

  async openFinding() {
    await this.findingButton.click();
  }
}
