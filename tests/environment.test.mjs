import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveE2eEnvironment } from "../src/environment.mjs";

async function withRepository(run) {
  const rootDir = await mkdtemp(join(tmpdir(), "vvp-e2e-"));
  try {
    await mkdir(join(rootDir, "projects", "PRODUCT-A"), { recursive: true });
    await mkdir(join(rootDir, "projects", "VVP-Recruit"), { recursive: true });
    await run(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test("selects the requested product suite and normalized HTTP base URL", async () => {
  await withRepository(async (rootDir) => {
    await mkdir(join(rootDir, "projects", "OTHER-PRODUCT"), { recursive: true });
    const result = resolveE2eEnvironment({
      rootDir,
      env: {
        PRODUCT_CODE: "PRODUCT-A",
        E2E_BASE_URL: "http://127.0.0.1:4173/",
      },
    });

    assert.equal(result.productCode, "PRODUCT-A");
    assert.equal(result.testDir, join(rootDir, "projects", "PRODUCT-A"));
    assert.notEqual(result.testDir, join(rootDir, "projects", "OTHER-PRODUCT"));
    assert.equal(result.baseUrl, "http://127.0.0.1:4173/");
  });
});

test("preserves mixed-case product codes when selecting a suite", async () => {
  await withRepository(async (rootDir) => {
    const result = resolveE2eEnvironment({
      rootDir,
      env: {
        PRODUCT_CODE: "VVP-Recruit",
        E2E_BASE_URL: "http://127.0.0.1:4173",
      },
    });

    assert.equal(result.productCode, "VVP-Recruit");
    assert.equal(result.testDir, join(rootDir, "projects", "VVP-Recruit"));
  });
});

test("rejects path traversal in PRODUCT_CODE", async () => {
  await withRepository(async (rootDir) => {
    assert.throws(() => resolveE2eEnvironment({
      rootDir,
      env: { PRODUCT_CODE: "../other", E2E_BASE_URL: "http://127.0.0.1:4173" },
    }), /PRODUCT_CODE/);
    assert.throws(() => resolveE2eEnvironment({
      rootDir,
      env: { PRODUCT_CODE: "VVP/Recruit", E2E_BASE_URL: "http://127.0.0.1:4173" },
    }), /PRODUCT_CODE/);
    assert.throws(() => resolveE2eEnvironment({
      rootDir,
      env: { PRODUCT_CODE: "VVP Recruit", E2E_BASE_URL: "http://127.0.0.1:4173" },
    }), /PRODUCT_CODE/);
  });
});

test("rejects a product without a suite directory", async () => {
  await withRepository(async (rootDir) => {
    assert.throws(() => resolveE2eEnvironment({
      rootDir,
      env: { PRODUCT_CODE: "UNKNOWN", E2E_BASE_URL: "http://127.0.0.1:4173" },
    }), /No E2E suite/);
  });
});

test("rejects missing or non-HTTP base URLs", async () => {
  await withRepository(async (rootDir) => {
    assert.throws(() => resolveE2eEnvironment({
      rootDir,
      env: { PRODUCT_CODE: "PRODUCT-A" },
    }), /E2E_BASE_URL/);
    assert.throws(() => resolveE2eEnvironment({
      rootDir,
      env: { PRODUCT_CODE: "PRODUCT-A", E2E_BASE_URL: "file:///tmp/product" },
    }), /HTTP or HTTPS/);
  });
});
