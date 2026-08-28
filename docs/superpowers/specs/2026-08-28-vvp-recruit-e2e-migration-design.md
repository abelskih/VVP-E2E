# VVP Recruit Central E2E Migration Design

**Date:** 2026-08-28  
**Status:** Approved for implementation planning

## Capability

Move VVP Recruit's eleven Playwright scenarios into the QA-owned `abelskih/VVP-E2E` repository as the isolated `VVP-Recruit` suite. Each test reports an exact Test Tower scenario tag in its full name, so Tower connects JUnit cases to critical scenarios without a separate mapping table.

## Fixed identities

- Test Tower product code: `VVP-Recruit`.
- Test Tower product name: `VVP Recruit`.
- Suite directory: `projects/VVP-Recruit/`.
- Suite selector: `PRODUCT_CODE=VVP-Recruit`.
- Application URL: supplied through `E2E_BASE_URL`.

These values remain byte-for-byte identical across Tower reports, workflow environment, artifact paths, and the suite directory.

## Architecture

### VVP-E2E ownership

VVP-E2E owns Playwright specs, product-specific fixtures, database seeding helpers, browser interactions, and browser artifacts. The suite stays below `projects/VVP-Recruit/` and does not import another product's files.

The environment parser expands from uppercase-only codes to safe case-sensitive codes matching `[A-Za-z0-9][A-Za-z0-9_-]{0,99}`. Path separators, traversal, whitespace, control characters, and other characters remain invalid. Resolution uses the exact supplied code without normalization.

### VVP-Recruit ownership

VVP-Recruit owns installation, build and startup, PostgreSQL lifecycle, schema application, and health checks. Its E2E workflow checks out VVP-E2E at a recorded revision, supplies `PRODUCT_CODE=VVP-Recruit`, `E2E_BASE_URL`, database settings, and test credentials, then uploads `artifacts/VVP-Recruit/` even when Playwright fails.

After the central suite passes, local `tests/e2e/`, root Playwright configuration, and Playwright-only dependencies/scripts are removed from VVP-Recruit. Unit, integration, typecheck, build, and existing Tower reporting remain unchanged.

### Test Tower ownership

Tower remains the canonical owner of the product and critical-scenario catalogue. Eleven scenarios are created under `VVP-Recruit`. Every Playwright title contains exactly one `@scenario:<EXACT_CODE>` tag. Tower extracts it from the JUnit test-case name and links the result to the existing scenario.

Scenarios are never created dynamically during ordinary test runs. Unknown codes are integration errors.

## Scenario catalogue

| Code | Tower scenario name |
|---|---|
| `RECRUIT-FEEDBACK-PUBLIC-ACCESS` | Public interview feedback form is accessible by token |
| `RECRUIT-FEEDBACK-SUBMIT` | Interview feedback can be submitted in the browser |
| `RECRUIT-FEEDBACK-UPSERT` | Repeated interview feedback updates the existing result |
| `RECRUIT-FEEDBACK-NOT-FOUND` | Missing interview feedback shows a safe fallback |
| `RECRUIT-AUTH-LOGIN-FORM` | Anonymous user sees the login form |
| `RECRUIT-AUTH-PROTECTED-ROUTE` | Protected routes require authentication |
| `RECRUIT-AUTH-INVALID-CREDENTIALS` | Invalid credentials are rejected |
| `RECRUIT-AUTH-LOGIN` | Valid credentials open the candidates area |
| `RECRUIT-AUTH-LOGOUT` | Logout terminates the authenticated session |
| `RECRUIT-CANDIDATES-CONSOLE-CLEAN` | Candidate list loads without application console errors |
| `RECRUIT-CAREER-SCORE-PERSISTENCE` | Career score remains visible after reload |

Codes are stable identifiers. Tower display names may change without changing Playwright tags.

## Execution flow

1. The VVP-Recruit workflow starts isolated PostgreSQL, applies the schema, and creates the session table.
2. It builds and starts API and frontend services and waits for health checks.
3. It checks out VVP-E2E and installs its locked dependencies and Chromium.
4. VVP-E2E selects only `projects/VVP-Recruit/` and runs eleven tests.
5. Playwright writes JUnit, HTML, trace, screenshot, and video outputs under `artifacts/VVP-Recruit/`.
6. The product workflow submits results through the established Tower contract, including VVP-Recruit and VVP-E2E commit SHAs.
7. Tower links cases to critical scenarios by `@scenario:` tags.

## Isolation and failure handling

- Tests use a disposable database and dedicated E2E user.
- Setup and teardown remain inside `projects/VVP-Recruit/`.
- External Google Fonts are fulfilled locally in the console-clean scenario.
- Tests keep one worker until fixtures are parallel-safe.
- Invalid or missing `PRODUCT_CODE`, `E2E_BASE_URL`, or `DATABASE_URL` fails early.
- Startup failures preserve service logs; Playwright failures preserve all artifacts.
- Tower provisioning is idempotent by product and scenario code and never overwrites unrelated scenarios.
- The old suite is removed only after the central copy passes.

## Security

- Credentials are not committed.
- Product and Tower tokens enter through GitHub Actions secrets or an authenticated operator session.
- Fork pull requests receive no secrets; workflows do not use `pull_request_target`.
- Tower catalogue mutations happen during one-time provisioning, not ordinary Playwright runs.

## Migration sequence

1. Extend VVP-E2E product-code validation and test exact mixed-case selection.
2. Add `projects/VVP-Recruit/` with eleven migrated and tagged scenarios.
3. Run the central suite against a locally started VVP Recruit environment.
4. Create or confirm Tower product `VVP-Recruit` and idempotently create eleven scenarios.
5. Add the VVP-Recruit workflow for the central suite and preserve both repository SHAs.
6. Confirm a successful run and all eleven Tower links.
7. Remove duplicate local E2E sources and Playwright-only configuration from VVP-Recruit.

## Non-goals

- Rewriting scenario behavior beyond migration needs.
- Sharing fixtures between unrelated products.
- Generating Tower scenarios from arbitrary titles.
- Running against production.
- Changing Tower's linking algorithm or report contract.
- Changing VVP Recruit application behavior.

## Acceptance criteria

1. `PRODUCT_CODE=VVP-Recruit` selects only `projects/VVP-Recruit/`.
2. VVP-E2E validation and typecheck pass; existing `VVP-TEST-TOWER` discovery is unchanged.
3. All eleven central tests pass against an isolated VVP Recruit environment.
4. Every test title contains exactly one valid catalogue tag.
5. Tower contains product `VVP-Recruit` and all eleven scenarios.
6. A submitted result shows all eleven cases linked correctly.
7. VVP-Recruit contains no duplicate Playwright sources after central verification.

## Operational prerequisites

- Authenticated administration access to the target Test Tower.
- VVP Recruit workflow secrets and Tower reporting token.
- A reviewed VVP-E2E revision policy: pinned SHA or controlled branch.

