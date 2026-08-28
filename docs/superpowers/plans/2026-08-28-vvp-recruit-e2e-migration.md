# VVP Recruit Central E2E Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Move all eleven VVP Recruit Playwright scenarios into the central VVP-E2E repository, execute them from the VVP Recruit CI workflow, and link every JUnit test case to an identically coded scenario in VVP Test Tower.

**Architecture:** VVP-Recruit continues to own product build, database provisioning, application startup, and Test Tower report orchestration. VVP-E2E owns all Playwright test code and resolves the exact product suite from `PRODUCT_CODE=VVP-Recruit`. The VVP Recruit workflow invokes the pinned central E2E action after core checks and submits the resulting JUnit as a separate E2E phase containing both product and E2E repository commit identities.

**Tech Stack:** TypeScript 5.9, Playwright, pnpm 9, Node.js 24, PostgreSQL, GitHub Actions, VVP Test Tower report contract.

**Spec:** `docs/superpowers/specs/2026-08-28-vvp-recruit-e2e-migration-design.md`

## Global Constraints

- Work in two repositories: `C:\Main\git\VVP-E2E` and `C:\Main\git\VVP-Recruit`.
- Read each repository's current status before every commit and never include unrelated user changes.
- Preserve VVP Recruit route paths, API response shapes, auth guards, and database schema.
- Do not edit generated API client or generated Zod files.
- Do not delete the original VVP Recruit tests until the central suite has discovered and passed all eleven tests.
- Use the exact case-sensitive product code `VVP-Recruit` and exact `@scenario:<CODE>` tags listed below.
- Treat all migrated regression scenarios as `P1`, `Automated`, and `Active`; priority can later be promoted in Test Tower without changing test linkage.
- Run `pnpm run typecheck` in VVP-Recruit after every product-repository change, as required by `AGENTS.md`.
- Commit independently in each repository; never combine repository state in one commit.

## Scenario Catalogue

| Code | Exact Test Tower name | Source test |
|---|---|---|
| `RECRUIT-FEEDBACK-PUBLIC-ACCESS` | Public interview feedback form is accessible by token | `interview-feedback.spec.ts` |
| `RECRUIT-FEEDBACK-SUBMIT` | Interview feedback can be submitted in the browser | `interview-feedback.spec.ts` |
| `RECRUIT-FEEDBACK-UPSERT` | Repeated interview feedback updates the existing result | `interview-feedback.spec.ts` |
| `RECRUIT-FEEDBACK-NOT-FOUND` | Missing interview feedback shows a safe fallback | `interview-feedback.spec.ts` |
| `RECRUIT-AUTH-LOGIN-FORM` | Anonymous user sees the login form | `login.spec.ts` |
| `RECRUIT-AUTH-PROTECTED-ROUTE` | Protected routes require authentication | `login.spec.ts` |
| `RECRUIT-AUTH-INVALID-CREDENTIALS` | Invalid credentials are rejected | `login.spec.ts` |
| `RECRUIT-AUTH-LOGIN` | Valid credentials open the candidates area | `login.spec.ts` |
| `RECRUIT-AUTH-LOGOUT` | Logout terminates the authenticated session | `login.spec.ts` |
| `RECRUIT-CANDIDATES-CONSOLE-CLEAN` | Candidate list loads without application console errors | `scoring.spec.ts` |
| `RECRUIT-CAREER-SCORE-PERSISTENCE` | Career score remains visible after reload | `scoring.spec.ts` |

### Task 1: Accept the exact mixed-case product code in VVP-E2E

**Repository:** `C:\Main\git\VVP-E2E`

**Files:**
- Modify: `tests/environment.test.mjs`
- Modify: `src/environment.mjs`

**Step 1: Write the failing environment tests**

Update the temporary repository fixture to create `projects/VVP-Recruit`. Add an assertion that `PRODUCT_CODE=VVP-Recruit` resolves exactly to that directory without uppercasing or normalizing its case. Retain traversal, missing-suite, and non-HTTP URL rejection tests; add rejection coverage for whitespace and path separators if not already covered.

**Step 2: Run the focused test and confirm RED**

Run:

```powershell
pnpm exec node --test tests/environment.test.mjs
```

Expected: the mixed-case resolution test fails with the current uppercase-only validation error.

**Step 3: Implement the minimum validator change**

Change the product-code expression in `src/environment.mjs` to accept ASCII upper- and lowercase letters while continuing to allow only letters, digits, `_`, and `-`, with the existing 100-character limit. Update the validation message accordingly. Do not lowercase, uppercase, decode, or otherwise normalize the supplied code.

**Step 4: Verify GREEN**

Run:

```powershell
pnpm run test:unit
pnpm run typecheck
pnpm run validate
```

Expected: all commands exit 0.

**Step 5: Commit**

```powershell
git add src/environment.mjs tests/environment.test.mjs
git commit -m "feat: support mixed-case product codes"
```

### Task 2: Add product-owned Playwright lifecycle hooks to the central runner

**Repository:** `C:\Main\git\VVP-E2E`

**Files:**
- Modify: `playwright.config.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `tests/playwright-config.test.mjs`

**Step 1: Write a failing configuration test**

Extract or expose a small configuration helper only if necessary for deterministic testing. The test must prove that a selected product directory containing `global-setup.ts` and `global-teardown.ts` contributes those exact files to Playwright configuration, while an existing suite without those files leaves both options undefined.

**Step 2: Run the focused test and confirm RED**

```powershell
pnpm exec node --test tests/playwright-config.test.mjs
```

Expected: failure because the current configuration never resolves suite lifecycle hooks.

**Step 3: Implement conditional lifecycle resolution**

In `playwright.config.ts`, resolve `global-setup.ts` and `global-teardown.ts` relative to `environment.testDir` and set `globalSetup`/`globalTeardown` only when the respective file exists. Keep the existing reporters, single worker, browser configuration, base URL, and artifact paths unchanged.

**Step 4: Add only the runtime dependencies required by the migrated setup**

Add `bcryptjs` and `pg` plus their TypeScript declarations to VVP-E2E using pnpm, preserving the existing package-manager version and lockfile format.

```powershell
pnpm add -D bcryptjs pg @types/pg
```

**Step 5: Verify and commit**

```powershell
pnpm run validate
git add playwright.config.ts package.json pnpm-lock.yaml tests/playwright-config.test.mjs
git commit -m "feat: support product E2E lifecycle hooks"
```

### Task 3: Copy and tag all eleven VVP Recruit tests

**Repository:** `C:\Main\git\VVP-E2E`

**Files:**
- Create: `projects/VVP-Recruit/global-setup.ts`
- Create: `projects/VVP-Recruit/global-teardown.ts`
- Create: `projects/VVP-Recruit/interview-feedback.spec.ts`
- Create: `projects/VVP-Recruit/login.spec.ts`
- Create: `projects/VVP-Recruit/scoring.spec.ts`

**Step 1: Perform a mechanical copy**

Copy the five source files from `C:\Main\git\VVP-Recruit\tests\e2e\` into `projects/VVP-Recruit/` without changing behavior. Preserve database seeding, session-table preparation, cleanup, selectors, assertions, and test ordering.

**Step 2: Add the exact scenario tags**

Append one catalogue tag to each corresponding test title, for example:

```ts
test("valid credentials open the candidates area @scenario:RECRUIT-AUTH-LOGIN", async ({ page }) => {
```

Every catalogue code must occur exactly once across the eleven test declarations. Do not put tags in `describe` titles, comments, or helper names.

**Step 3: Prove isolated discovery**

```powershell
$env:PRODUCT_CODE='VVP-Recruit'
$env:E2E_BASE_URL='http://127.0.0.1:80'
pnpm run test:e2e:list
```

Expected: exactly eleven VVP Recruit tests are listed and no `VVP-TEST-TOWER` test is listed.

**Step 4: Add a static catalogue guard**

Create or extend a unit test that scans `projects/VVP-Recruit/*.spec.ts`, extracts `@scenario:` values, and asserts exact equality with the eleven catalogue codes. This prevents renamed or duplicated links from silently breaking Tower ingestion.

**Step 5: Verify and commit**

```powershell
pnpm run validate
pnpm run test:e2e:list
git add projects/VVP-Recruit tests
git commit -m "feat: add VVP Recruit E2E project"
```

### Task 4: Prove the central suite against a locally running VVP Recruit

**Repositories:** `C:\Main\git\VVP-Recruit`, then `C:\Main\git\VVP-E2E`

**Files:** none

**Step 1: Prepare the product exactly as CI will**

From VVP-Recruit, install frozen dependencies, run the full typecheck and build, start the configured PostgreSQL service, apply the existing schema/bootstrap commands, and start the API and frontend using the repository's existing production-like commands. Do not invent alternate migrations or seed paths.

**Step 2: Confirm product health**

Wait for the existing frontend and API health URLs with a bounded retry loop. Record the resolved frontend URL, API URL, and test database URL for the next step.

**Step 3: Run the central project**

From VVP-E2E:

```powershell
$env:PRODUCT_CODE='VVP-Recruit'
$env:E2E_BASE_URL='<frontend-url>'
$env:DATABASE_URL='<test-database-url>'
pnpm run test:e2e
```

Expected: 11 passed, 0 failed, JUnit written to `artifacts/VVP-Recruit/junit.xml`, and retained artifacts remain under `artifacts/VVP-Recruit/`.

**Step 4: Inspect JUnit linkage evidence**

Verify that the JUnit contains eleven executed test cases and all eleven exact scenario tags. Do not proceed to local-test deletion if any test is missing, skipped unexpectedly, or failed.

### Task 5: Provision VVP Recruit and its eleven scenarios in Test Tower

**System:** the configured VVP Test Tower environment

**Files:** none

**Step 1: Resolve the product idempotently**

Using an authenticated System Admin or Quality Lead session, query products and locate the exact code `VVP-Recruit`. If it exists, verify the display name is `VVP Recruit`; update only that name if needed. If it does not exist, create the product with code `VVP-Recruit` and name `VVP Recruit`, supplying the environment-required owner/quality-lead fields from the existing organization configuration.

**Step 2: Reconcile scenarios by code**

GET `/api/products/{productId}/critical-scenarios`. For each catalogue entry:

- create it when absent;
- patch it when present but its name, priority, automation status, current status, or test reference differs;
- never delete unrelated existing scenarios.

Use these common values:

```json
{
  "priority": "P1",
  "automationStatus": "Automated",
  "currentStatus": "Active"
}
```

Use a test reference of `VVP-E2E/projects/VVP-Recruit/<source test>` for each scenario. The title tag remains the actual linkage mechanism.

**Step 3: Verify reconciliation**

Re-read the product scenario endpoint and assert that all eleven codes exist exactly once, have the catalogue names, and are `P1`/`Automated`/`Active`.

### Task 6: Add the centralized E2E phase to VVP Recruit reporting

**Repository:** `C:\Main\git\VVP-Recruit`

**Files:**
- Modify: `.github/workflows/vvp-tower-report.yml`
- Modify: `scripts/src/vvp-ci/main.ts`
- Modify: relevant existing report-builder/types/tests under `scripts/src/vvp-ci/`
- Modify: `scripts/package.json` only if an existing script entry must be exposed

**Step 1: Read all report construction and submission consumers**

Trace `vvp:report` from `scripts/src/vvp-ci/main.ts` through report types, JSON schema validation, tests, and HTTP submission. Identify the existing phase, repository, commit, JUnit, and artifact fields before editing. Preserve the current core-report identity and delivery behavior.

**Step 2: Write failing report tests**

Add tests proving that an E2E phase:

- uses product code `VVP-Recruit`;
- reports the product commit separately from `e2eRepository=abelskih/VVP-E2E` and `e2eCommitSha`;
- reads the central JUnit path;
- records at least one actually executed test case;
- retains the existing core phase unchanged.

Run the focused tests and confirm they fail before implementation.

**Step 3: Implement the minimum E2E phase support**

Extend the existing report builder using the current Tower schema rather than introducing a second reporting client. Consume explicit environment inputs for the central action's exit code, duration, JUnit path, artifact path, repository, and commit SHA. Ensure failure of the central E2E produces a completed `Failed` E2E phase and still submits its JUnit evidence.

**Step 4: Update the workflow**

After install and mandatory core checks, provision PostgreSQL using the same database contract proven in Task 4, build/start the VVP Recruit API and frontend, wait for bounded health checks, and invoke the pinned official VVP-E2E composite action with:

- `product-code: VVP-Recruit`;
- the running frontend base URL;
- the test `DATABASE_URL`;
- an immutable VVP-E2E commit SHA.

Pass the action outputs `exit-code`, `duration-ms`, `junit-path`, `artifact-path`, and `e2e-commit-sha` into the existing VVP report command. Keep `if: always()` on report generation/upload so a failed browser test is still ingested by Tower. Keep all secrets in GitHub secrets/environment variables.

**Step 5: Verify locally**

```powershell
pnpm --filter @workspace/scripts run test
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm test
```

Expected: every command exits 0. Validate the workflow syntax with the repository's existing workflow validator, if present.

**Step 6: Commit**

```powershell
git add .github/workflows/vvp-tower-report.yml scripts
git commit -m "ci: run centralized VVP Recruit E2E"
```

### Task 7: Remove product-owned Playwright code only after central success

**Repository:** `C:\Main\git\VVP-Recruit`

**Files:**
- Delete: `tests/e2e/global-setup.ts`
- Delete: `tests/e2e/global-teardown.ts`
- Delete: `tests/e2e/interview-feedback.spec.ts`
- Delete: `tests/e2e/login.spec.ts`
- Delete: `tests/e2e/scoring.spec.ts`
- Delete: `playwright.config.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Step 1: Prove dependency ownership before removal**

Search the full workspace for imports/usages of `@playwright/test`, `bcryptjs`, `pg`, and `@types/pg`. Remove a root dependency only when no non-E2E consumer relies on that root declaration. Preserve `pg` where it is still required by `@workspace/scripts` or another workspace package.

**Step 2: Delete the local browser suite**

Remove the six local Playwright files and the root `e2e` script. Update the lockfile with pnpm. Do not remove application startup, database setup, or CI workflow logic.

**Step 3: Verify no product-owned Playwright tests remain**

```powershell
rg -n "@playwright/test|playwright test|tests/e2e" . --glob '!node_modules/**' --glob '!.git/**'
```

Expected: only intentional centralized-workflow or documentation references remain; no test implementation remains in VVP-Recruit.

**Step 4: Run the complete product verification set**

```powershell
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm test
```

Expected: all commands exit 0. Fix any failure before committing.

**Step 5: Commit**

```powershell
git add package.json pnpm-lock.yaml playwright.config.ts tests/e2e
git commit -m "refactor: move E2E tests to VVP-E2E"
```

### Task 8: End-to-end CI and Test Tower acceptance

**Repositories:** `C:\Main\git\VVP-E2E` and `C:\Main\git\VVP-Recruit`

**Systems:** GitHub Actions and VVP Test Tower

**Step 1: Push VVP-E2E first**

Push the central repository commits and resolve the immutable commit SHA containing `projects/VVP-Recruit`. Update the VVP Recruit workflow pin if its planned SHA differs, rerun product verification, and amend with a new commit rather than rewriting already shared history.

**Step 2: Push VVP Recruit**

Push the product commits only after the central commit is reachable from GitHub.

**Step 3: Run the reporting workflow**

Dispatch `VVP Tower Report` with valid product version/tag inputs and configured Tower/product secrets. Observe core checks, product startup, central E2E, report generation, and artifact upload through completion.

**Step 4: Verify GitHub evidence**

Confirm the central action lists exactly eleven VVP Recruit tests, executes all eleven, and uploads JUnit/HTML/test artifacts. Confirm the workflow records the exact product commit and exact VVP-E2E commit.

**Step 5: Verify Test Tower linkage**

Open the resulting VVP Recruit Test Run and verify:

- an accepted `e2e` phase exists;
- `e2eRepository` is `abelskih/VVP-E2E`;
- `e2eCommitSha` equals the pinned central commit;
- the product commit equals the workflow commit;
- all eleven test cases were executed;
- every catalogue scenario has a run result derived from its matching title tag;
- no unknown-tag or duplicate-scenario warning is present.

**Step 6: Final repository checks**

```powershell
git -C C:\Main\git\VVP-E2E status --short
git -C C:\Main\git\VVP-Recruit status --short
```

Expected: both worktrees are clean and both local branches match their pushed origins.

