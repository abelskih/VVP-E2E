import { expect, type Locator, type Page } from "@playwright/test";

export class TestRunsPage {
  readonly heading: Locator;
  readonly productFilter: Locator;
  readonly statusFilter: Locator;
  readonly branchFilter: Locator;
  readonly nextButton: Locator;
  readonly previousButton: Locator;
  readonly emptyState: Locator;
  readonly errorState: Locator;
  readonly paginationSummary: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { name: "Test Runs" });
    this.productFilter = page.getByRole("combobox", { name: "Продукт" });
    this.statusFilter = page.getByRole("combobox", { name: "Статус" });
    this.branchFilter = page.getByRole("textbox", { name: "Ветка" });
    this.nextButton = page.getByRole("button", { name: "Вперед" });
    this.previousButton = page.getByRole("button", { name: "Назад" });
    this.emptyState = page.getByRole("heading", {
      name: "Запуски не найдены",
    });
    this.errorState = page.getByRole("alert");
    this.paginationSummary = page.getByText(/Показано \d+ - \d+ из \d+/);
  }

  runRow(id: string) {
    return this.page.getByTestId(`test-run-row-${id}`);
  }

  async goto() {
    await this.page.goto("/test-runs");
    await expect(this.heading).toBeVisible();
  }

  async selectProduct(name: string) {
    await this.productFilter.click();
    await this.page.getByRole("option", { name }).click();
  }

  async selectStatus(name: string) {
    await this.statusFilter.click();
    await this.page.getByRole("option", { name }).click();
  }

  async fillBranch(branch: string) {
    await this.branchFilter.fill(branch);
  }

  async goNext() {
    await this.nextButton.click();
  }

  async goPrevious() {
    await this.previousButton.click();
  }

  async openRun(id: string) {
    await this.runRow(id).click();
  }

  async openRunByPrefix(prefix: string, productName: string) {
    const row = this.page.getByRole("row").filter({ hasText: `${prefix}...` }).filter({ hasText: productName });
    await expect(row).toBeVisible();
    await row.click();
  }
}
