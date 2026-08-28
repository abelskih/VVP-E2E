import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { reconcileProducts, registerProduct, validateProductCode } from "../src/product-registry.mjs";

async function withRepository(run) {
  const rootDir = await mkdtemp(join(tmpdir(), "vvp-e2e-registry-"));
  try {
    await mkdir(join(rootDir, "projects"), { recursive: true });
    await run(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test("registers one missing product without changing an existing suite", async () => {
  await withRepository(async (rootDir) => {
    const existingDir = join(rootDir, "projects", "EXISTING");
    await mkdir(existingDir, { recursive: true });
    const sentinel = join(existingDir, "sentinel.spec.ts");
    await writeFile(sentinel, "test sentinel\n", "utf8");

    assert.deepEqual(await registerProduct({ rootDir, productCode: "NEW-PRODUCT" }), {
      code: "NEW-PRODUCT",
      created: true,
    });
    assert.equal(await readFile(join(rootDir, "projects", "NEW-PRODUCT", ".gitkeep"), "utf8"), "");
    assert.deepEqual(await registerProduct({ rootDir, productCode: "EXISTING" }), {
      code: "EXISTING",
      created: false,
    });
    assert.equal(await readFile(sentinel, "utf8"), "test sentinel\n");
  });
});

test("reconciles valid products deterministically while isolating invalid values", async () => {
  await withRepository(async (rootDir) => {
    await mkdir(join(rootDir, "projects", "EXISTING"), { recursive: true });

    assert.deepEqual(await reconcileProducts({
      rootDir,
      productCodes: ["ZETA", "../ESCAPE", "ALPHA", "ZETA", "lower", "EXISTING"],
    }), {
      created: ["ALPHA", "ZETA"],
      existing: ["EXISTING"],
      rejected: [
        { code: "../ESCAPE", error: "INVALID_PRODUCT_CODE" },
        { code: "lower", error: "INVALID_PRODUCT_CODE" },
      ],
    });
  });
});

test("accepts only the shared Tower product-code grammar", () => {
  for (const code of ["A", "VVP-TEST-TOWER", "PRODUCT_123", "A".repeat(100)]) {
    assert.equal(validateProductCode(code), code);
  }
  for (const code of ["", "lower", "-PREFIX", "A/B", "A\\B", "A\nB", "A".repeat(101)]) {
    assert.throws(() => validateProductCode(code), /INVALID_PRODUCT_CODE/);
  }
});
