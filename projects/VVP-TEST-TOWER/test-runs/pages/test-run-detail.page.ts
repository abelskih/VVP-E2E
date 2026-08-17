import { expect, type Locator, type Page } from "@playwright/test";

import { CheckCardComponent } from "../components/check-card.component";

export class TestRunDetailPage {
  readonly heading: Locator;
  readonly backLink: Locator;
  readonly accessDenied: Locator;
  readonly loadError: Locator;
  readonly notFound: Locator;
  readonly findingTitle: Locator;
  readonly findingDescription: Locator;
  readonly findingType: Locator;
  readonly findingSeverity: Locator;
  readonly createFindingButton: Locator;
  readonly successToast: Locator;
  readonly branchCommit: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { name: /^Run / });
    this.backLink = page.getByRole("link", { name: "Назад к списку" });
    this.accessDenied = page.getByText(
      "Нет доступа к этому тестовому прогону.",
      { exact: true },
    );
    this.loadError = page.getByText("Не удалось загрузить тестовый прогон.", {
      exact: true,
    });
    this.notFound = page.getByText("Запуск не найден", { exact: true });
    this.findingTitle = page.getByRole("textbox", { name: "Заголовок" });
    this.findingDescription = page.getByRole("textbox", { name: "Описание" });
    this.findingType = page.getByRole("combobox", { name: "Тип" });
    this.findingSeverity = page.getByRole("combobox", {
      name: "Серьезность",
    });
    this.createFindingButton = page
      .getByRole("dialog")
      .getByRole("button", { name: "Создать", exact: true });
    this.successToast = page.getByText("Finding успешно создан", {
      exact: true,
    });
    this.branchCommit = page.getByText(/main\s*\/\s*deadbee/);
  }

  check(id: string) {
    return new CheckCardComponent(this.page, id);
  }

  text(value: string) {
    return this.page.getByText(value, { exact: true });
  }

  async goto(id: string) {
    await this.page.goto(`/test-runs/${id}`);
  }

  async goBack() {
    await this.backLink.click();
  }

  async expectCoverageGate(threshold: number, result: "Успех" | "Провал") {
    const rule = this.page.getByText(`Покрытие Unit-тестов ≥ ${threshold}%`, { exact: true }).locator("..");
    await expect(rule).toContainText("Блокирует");
    await expect(rule).toContainText(result);
  }

  async submitFinding(input: {
    title: string;
    description: string;
    type: string;
    severity: string;
  }) {
    await this.findingTitle.fill(input.title);
    await this.findingDescription.fill(input.description);
    await this.findingType.click();
    await this.page
      .getByRole("option", { name: input.type, exact: true })
      .click();
    await this.findingSeverity.click();
    await this.page
      .getByRole("option", { name: input.severity, exact: true })
      .click();
    await this.createFindingButton.click();
    await expect(this.successToast).toBeVisible();
  }
}
