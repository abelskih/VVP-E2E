# VVP-E2E

Central QA-owned Playwright suites for GitHub-connected VVP products. Product
repositories keep ownership of installation, build, startup, port, and health
checks; this repository owns only browser-test code and its artifacts.

## Run a product suite

The product GitHub Action starts the product first, then checks out this
repository into a temporary directory and runs:

```powershell
$env:PRODUCT_CODE = "PRODUCT-CODE"
$env:E2E_BASE_URL = "http://127.0.0.1:4173"
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm run test:e2e
```

`PRODUCT_CODE` must match an existing directory below `projects/`.
`E2E_BASE_URL` must use HTTP or HTTPS. Path traversal and unknown products are
rejected before Playwright starts. A registered project may contain no specs;
in that case the command succeeds and produces a JUnit report with 0 tests.

## Register Tower products

The `Register Tower products` GitHub Actions workflow creates a product
directory when Tower dispatches `vvp-e2e-product-created`. An hourly run
reconciles all products through Tower's authenticated registry feed, and
`workflow_dispatch` provides manual recovery. Registration only creates a
missing `projects/<PRODUCT_CODE>/.gitkeep`: it does not run Playwright, alter an
existing suite, or select tests belonging to another product.

Configure repository variable `TOWER_URL` and Actions secret
`VVP_E2E_RECONCILIATION_TOKEN`. The secret must equal Tower's dedicated token;
rotate both copies together. To test locally without contacting Tower:

```powershell
pnpm run registry:reconcile -- --product-code PRODUCT-CODE
```

## Artifacts

Each run writes product-scoped output below `artifacts/<PRODUCT_CODE>/`:

- `junit.xml` — structured result for VVP Test Tower;
- `html/` — Playwright HTML report;
- `test-results/` — traces, screenshots, and videos retained on failure.

GitHub Actions should upload the complete product artifact directory even when
Playwright fails. The workflow must also record the product commit SHA and the
resolved commit SHA of this repository.

## Add a product

1. Register `projects/<PRODUCT_CODE>` through Tower or the reconciliation command.
2. Keep page objects and fixtures inside the same product directory.
3. Add focused specs ending in `.spec.ts`.
4. Run `pnpm run validate` before the first browser run.

The first connected suite is `projects/VVP-TEST-TOWER`, migrated from the VVP
Test Tower repository. Its smoke scenarios still require
`E2E_ALLOW_GLOBAL_GATE_MUTATION=1` and must only run against an isolated local
database.

Tower staged reporting, Task_AI, Docker Compose, and VM/preview orchestration are
outside this repository's initial scope.
