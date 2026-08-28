import { fileURLToPath, pathToFileURL } from "node:url";
import { reconcileProducts } from "../src/product-registry.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

function selectedMode(argv) {
  if (argv.length === 2 && argv[0] === "--product-code") {
    return { kind: "single", productCode: argv[1] };
  }
  if (argv.length === 1 && argv[0] === "--from-tower") return { kind: "feed" };
  throw new Error("USAGE: --product-code CODE | --from-tower");
}

async function loadTowerProductCodes(env, fetchImpl) {
  const towerUrl = env.TOWER_URL?.trim();
  const token = env.VVP_E2E_RECONCILIATION_TOKEN?.trim();
  if (!towerUrl || !token) throw new Error("TOWER_RECONCILIATION_NOT_CONFIGURED");

  let response;
  try {
    const baseUrl = towerUrl.endsWith("/") ? towerUrl : `${towerUrl}/`;
    response = await fetchImpl(new URL("api/internal/vvp-e2e/products", baseUrl).toString(), {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
  } catch {
    throw new Error("TOWER_RECONCILIATION_UNAVAILABLE");
  }
  if (!response.ok) throw new Error("TOWER_RECONCILIATION_UNAVAILABLE");

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("TOWER_RECONCILIATION_INVALID_RESPONSE");
  }
  if (
    !body || typeof body !== "object" || !Array.isArray(body.products) ||
    !body.products.every((product) => product && typeof product === "object" && typeof product.code === "string")
  ) {
    throw new Error("TOWER_RECONCILIATION_INVALID_RESPONSE");
  }
  return body.products.map((product) => product.code);
}

export async function run(argv, env = process.env, dependencies = {}) {
  const mode = selectedMode(argv);
  const rootDir = dependencies.rootDir ?? repositoryRoot;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const productCodes = mode.kind === "single"
    ? [mode.productCode]
    : await loadTowerProductCodes(env, fetchImpl);
  const summary = await reconcileProducts({ rootDir, productCodes });
  return { exitCode: summary.rejected.length === 0 ? 0 : 1, summary };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await run(process.argv.slice(2));
    console.log(JSON.stringify(result.summary));
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "REGISTRY_RECONCILIATION_FAILED");
    process.exitCode = 1;
  }
}
