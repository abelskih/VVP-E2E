import {
  expect,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";

type ScenarioDefinition = {
  code: string;
  name: string;
  testReference: string;
};

async function expectOk(response: APIResponse) {
  expect(
    response.ok(),
    `${response.status()} ${response.url()}: ${await response.text()}`,
  ).toBe(true);
}

export async function ensureCriticalScenarios(
  request: APIRequestContext,
  productId: string,
  definitions: ScenarioDefinition[],
) {
  const listed = await request.get(
    `/api/products/${productId}/critical-scenarios`,
  );
  await expectOk(listed);
  const existing = (await listed.json()).items as Array<{
    id: string;
    code: string;
  }>;

  for (const definition of definitions) {
    const found = existing.find(
      (scenario) => scenario.code === definition.code,
    );
    const body = {
      ...definition,
      description: "Автоматизированный критический UI-сценарий Test Runs.",
      businessImpact:
        "Регрессия блокирует достоверную оценку готовности продукта к релизу.",
      priority: "P0",
      automationStatus: "Automated",
      testReference: definition.testReference,
    };
    const saved = found
      ? await request.patch(`/api/critical-scenarios/${found.id}`, {
          data: body,
        })
      : await request.post(`/api/products/${productId}/critical-scenarios`, {
          data: body,
        });
    await expectOk(saved);
  }
}
