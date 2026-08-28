import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { run } from "../scripts/reconcile-products.mjs";

async function withRepository(runTest) {
  const rootDir = await mkdtemp(join(tmpdir(), "vvp-e2e-cli-"));
  try {
    await mkdir(join(rootDir, "projects"), { recursive: true });
    await runTest(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test("single-product mode never contacts Tower", async () => {
  await withRepository(async (rootDir) => {
    let fetched = false;
    const result = await run(["--product-code", "BILLING"], {}, {
      rootDir,
      fetchImpl: async () => { fetched = true; throw new Error("unexpected fetch"); },
    });

    assert.equal(fetched, false);
    assert.deepEqual(result, {
      exitCode: 0,
      summary: { created: ["BILLING"], existing: [], rejected: [] },
    });
  });
});

test("feed mode authenticates once and isolates an invalid product", async () => {
  await withRepository(async (rootDir) => {
    const requests = [];
    const result = await run(["--from-tower"], {
      TOWER_URL: "https://tower.example/base/",
      VVP_E2E_RECONCILIATION_TOKEN: "read-secret",
    }, {
      rootDir,
      fetchImpl: async (url, init) => {
        requests.push([url, init]);
        return new Response(JSON.stringify({
          products: [{ code: "VALID-A" }, { code: "bad/code" }, { code: "VALID-B" }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0][0], "https://tower.example/base/api/internal/vvp-e2e/products");
    assert.equal(requests[0][1].headers.Authorization, "Bearer read-secret");
    assert.equal(requests[0][1].redirect, "error");
    assert.deepEqual(result, {
      exitCode: 1,
      summary: {
        created: ["VALID-A", "VALID-B"],
        existing: [],
        rejected: [{ code: "bad/code", error: "INVALID_PRODUCT_CODE" }],
      },
    });
  });
});

test("feed mode rejects missing credentials, non-success, and malformed bodies without response leakage", async () => {
  await withRepository(async (rootDir) => {
    await assert.rejects(
      run(["--from-tower"], { TOWER_URL: "https://tower.example" }, { rootDir, fetchImpl: fetch }),
      /TOWER_RECONCILIATION_NOT_CONFIGURED/,
    );
    await assert.rejects(
      run(["--from-tower"], {
        TOWER_URL: "https://tower.example",
        VVP_E2E_RECONCILIATION_TOKEN: "secret",
      }, { rootDir, fetchImpl: async () => new Response("Bearer leaked-body", { status: 500 }) }),
      (error) => error.message === "TOWER_RECONCILIATION_UNAVAILABLE",
    );
    await assert.rejects(
      run(["--from-tower"], {
        TOWER_URL: "https://tower.example",
        VVP_E2E_RECONCILIATION_TOKEN: "secret",
      }, { rootDir, fetchImpl: async () => new Response(JSON.stringify({ products: [{ name: "missing code" }] }), { status: 200 }) }),
      /TOWER_RECONCILIATION_INVALID_RESPONSE/,
    );
  });
});
