import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

function runPnpm(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(`pnpm ${args.join(" ")}`, [], {
      cwd: rootDir,
      env: { ...process.env, ...env },
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
  });
}

test("an isolated empty product exits successfully and emits zero-test JUnit", async () => {
  const productCode = `EMPTY-PROBE-${process.pid}`;
  const productDir = join(rootDir, "projects", productCode);
  const artifactDir = join(rootDir, "artifacts", productCode);
  try {
    await mkdir(productDir, { recursive: true });
    const result = await runPnpm(["run", "test:e2e"], {
      PRODUCT_CODE: productCode,
      E2E_BASE_URL: "http://127.0.0.1:4173",
    });

    assert.equal(result.code, 0, result.output);
    const junit = await readFile(join(artifactDir, "junit.xml"), "utf8");
    assert.match(junit, /<testsuites[^>]* tests="0"[^>]* failures="0"/);
  } finally {
    await rm(productDir, { recursive: true, force: true });
    await rm(artifactDir, { recursive: true, force: true });
  }
});
