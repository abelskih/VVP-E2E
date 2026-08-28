import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as environmentModule from "../src/environment.mjs";

test("uses lifecycle hooks that exist in the selected product suite", async () => {
  assert.equal(typeof environmentModule.resolveProductLifecycle, "function");

  const testDir = await mkdtemp(join(tmpdir(), "vvp-e2e-lifecycle-"));
  try {
    const setup = join(testDir, "global-setup.ts");
    const teardown = join(testDir, "global-teardown.ts");
    await writeFile(setup, "export default () => undefined;\n");
    await writeFile(teardown, "export default () => undefined;\n");

    assert.deepEqual(environmentModule.resolveProductLifecycle(testDir), {
      globalSetup: setup,
      globalTeardown: teardown,
    });
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test("omits lifecycle hooks that are absent from the selected suite", async () => {
  assert.equal(typeof environmentModule.resolveProductLifecycle, "function");

  const testDir = await mkdtemp(join(tmpdir(), "vvp-e2e-lifecycle-"));
  try {
    await mkdir(testDir, { recursive: true });
    assert.deepEqual(environmentModule.resolveProductLifecycle(testDir), {});
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});
