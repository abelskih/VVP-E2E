import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const PRODUCT_CODE = /^[A-Z0-9][A-Z0-9_-]{0,99}$/;

export function validateProductCode(code) {
  if (typeof code !== "string" || !PRODUCT_CODE.test(code)) {
    throw new Error("INVALID_PRODUCT_CODE");
  }
  return code;
}

export async function registerProduct({ rootDir, productCode }) {
  const code = validateProductCode(productCode);
  const productDir = resolve(rootDir, "projects", code);
  if (existsSync(productDir)) return { code, created: false };

  await mkdir(productDir, { recursive: true });
  try {
    await writeFile(resolve(productDir, ".gitkeep"), "", { flag: "wx" });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  return { code, created: true };
}

export async function reconcileProducts({ rootDir, productCodes }) {
  const created = [];
  const existing = [];
  const rejected = [];

  for (const candidate of [...new Set(productCodes)].sort()) {
    try {
      const result = await registerProduct({ rootDir, productCode: candidate });
      (result.created ? created : existing).push(result.code);
    } catch (error) {
      rejected.push({
        code: typeof candidate === "string" ? candidate : String(candidate),
        error: error instanceof Error && error.message === "INVALID_PRODUCT_CODE"
          ? "INVALID_PRODUCT_CODE"
          : "REGISTRATION_FAILED",
      });
    }
  }

  return { created, existing, rejected };
}
