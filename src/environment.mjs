import { existsSync } from "node:fs";
import { resolve } from "node:path";

const PRODUCT_CODE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;

export function resolveE2eEnvironment({ rootDir, env = process.env }) {
  const productCode = env.PRODUCT_CODE?.trim();
  if (!productCode || !PRODUCT_CODE.test(productCode)) {
    throw new Error("PRODUCT_CODE must contain only letters, digits, underscores, or hyphens");
  }

  const rawBaseUrl = env.E2E_BASE_URL?.trim();
  if (!rawBaseUrl) {
    throw new Error("E2E_BASE_URL is required");
  }
  const parsedBaseUrl = new URL(rawBaseUrl);
  if (parsedBaseUrl.protocol !== "http:" && parsedBaseUrl.protocol !== "https:") {
    throw new Error("E2E_BASE_URL must use HTTP or HTTPS");
  }

  const testDir = resolve(rootDir, "projects", productCode);
  if (!existsSync(testDir)) {
    throw new Error(`No E2E suite exists for PRODUCT_CODE ${productCode}`);
  }

  return {
    productCode,
    testDir,
    baseUrl: parsedBaseUrl.toString(),
  };
}
