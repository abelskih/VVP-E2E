import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("private composite action runs a product suite on the caller runner and exposes evidence", async () => {
  const action = await readFile(new URL("action.yml", root), "utf8");

  assert.match(action, /using:\s*["']?composite/);
  assert.match(action, /product-code:/);
  assert.match(action, /base-url:/);
  assert.match(action, /allow-global-gate-mutation:/);
  assert.match(action, /working-directory: \$\{\{ github\.action_path \}\}/);
  assert.match(action, /pnpm install --frozen-lockfile/);
  assert.match(action, /playwright install --with-deps chromium/);
  assert.match(action, /pnpm run test:e2e/);
  assert.match(action, /set \+e/);
  assert.match(action, /exit-code=/);
  assert.match(action, /duration-ms=/);
  assert.match(action, /artifact-path=/);
  assert.match(action, /junit-path=/);
  assert.match(action, /e2e-commit-sha=/);
  assert.match(action, /github\.action_ref/);
  assert.match(action, /exit 0/);
  assert.doesNotMatch(action, /actions\/checkout/);
});
