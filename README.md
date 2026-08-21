# VVP-E2E

Central QA-owned Playwright suites for GitHub-connected VVP products. Product
repositories keep ownership of installation, build, startup, port, and health
checks; this repository owns only browser-test code and its artifacts.

## Run a product suite

The product GitHub Action starts the product first, then invokes the private
composite action on the same runner:

```yaml
- id: e2e
  uses: abelskih/VVP-E2E@<full-commit-sha>
  with:
    product-code: PRODUCT-CODE
    base-url: http://127.0.0.1:4173
```

Pin the action to a full commit SHA so `e2e-commit-sha` is immutable. Private
repositories owned by `abelskih` receive a short-lived GitHub installation
token when VVP-E2E Actions access is enabled; they do not need a separate PAT.
Repositories belonging to another owner must obtain read-only access before
using the fallback checkout flow.

For local development, run:

```powershell
$env:PRODUCT_CODE = "PRODUCT-CODE"
$env:E2E_BASE_URL = "http://127.0.0.1:4173"
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm run test:e2e
```

`PRODUCT_CODE` must match an existing directory below `projects/`.
`E2E_BASE_URL` must use HTTP or HTTPS. Path traversal and unknown products are
rejected before Playwright starts.

## Artifacts

Each run writes product-scoped output below `artifacts/<PRODUCT_CODE>/`:

- `junit.xml` — structured result for VVP Test Tower;
- `html/` — Playwright HTML report;
- `test-results/` — traces, screenshots, and videos retained on failure.

GitHub Actions should upload the complete product artifact directory even when
Playwright fails. The workflow must also record the product commit SHA and the
resolved commit SHA of this repository.

## Add a product

1. Create `projects/<PRODUCT_CODE>/tests`.
2. Keep page objects and fixtures inside the same product directory.
3. Add focused specs ending in `.spec.ts`.
4. Run `pnpm run validate` before the first browser run.

The first connected suite is `projects/VVP-TEST-TOWER`, migrated from the VVP
Test Tower repository. Its smoke scenarios still require
`E2E_ALLOW_GLOBAL_GATE_MUTATION=1` and must only run against an isolated local
database.

Tower staged reporting, Task_AI, Docker Compose, and VM/preview orchestration are
outside this repository's initial scope.
