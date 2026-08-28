import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../.github/workflows/register-products.yml", import.meta.url);

test("registry workflow supports immediate, hourly, and manual isolated synchronization", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /repository_dispatch:\s*\r?\n\s+types: \[vvp-e2e-product-created\]/);
  assert.match(workflow, /schedule:\s*\r?\n\s+- cron: '[^']+'/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /group: vvp-e2e-product-registry/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /--product-code "\$\{\{ github\.event\.client_payload\.productCode \}\}"/);
  assert.match(workflow, /--from-tower/);
  assert.match(workflow, /VVP_E2E_RECONCILIATION_TOKEN: \$\{\{ secrets\.VVP_E2E_RECONCILIATION_TOKEN \}\}/);
  assert.match(workflow, /git add -- 'projects\/\*\/\.gitkeep'/);
  assert.match(workflow, /git status --porcelain -- projects/);

  assert.doesNotMatch(workflow, /playwright|test:e2e|git reset|push --force|echo.*VVP_E2E_RECONCILIATION_TOKEN/i);
});
