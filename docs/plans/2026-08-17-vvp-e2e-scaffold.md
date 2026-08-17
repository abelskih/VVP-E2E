# VVP-E2E Scaffold Implementation Plan

**Goal:** Create an independent QA-owned Playwright runner that selects one product suite by `PRODUCT_CODE` and targets the product-provided `E2E_BASE_URL`.

**Architecture:** Product suites live under `projects/<PRODUCT_CODE>`. A small environment parser validates the product code, suite directory, and HTTP(S) base URL before Playwright loads; Playwright owns JUnit, trace, screenshot, and video output conventions.

## Constraints

- Do not add concrete product tests.
- Do not add Tower API or Task_AI integration.
- Do not add Docker or VM orchestration.
- Reject path traversal and unknown product codes.
- Keep generated reports and credentials out of Git.

## Tasks

1. Write Node unit tests for valid suite selection, missing suites, invalid product codes, and invalid base URLs; verify RED.
2. Implement the minimal environment parser; verify GREEN.
3. Add Playwright/TypeScript configuration and artifact paths.
4. Add usage documentation and a GitHub Actions validation workflow.
5. Install with a frozen lockfile, run unit tests, config smoke, and typecheck, then commit and push `main`.
