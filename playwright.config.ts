import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { resolveE2eEnvironment } from "./src/environment.mjs";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const environment = resolveE2eEnvironment({ rootDir });
const artifactRoot = `artifacts/${environment.productCode}`;

export default defineConfig({
  testDir: environment.testDir,
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["line"],
    ["html", { outputFolder: `${artifactRoot}/html`, open: "never" }],
    ["junit", { outputFile: `${artifactRoot}/junit.xml` }],
  ],
  outputDir: `${artifactRoot}/test-results`,
  use: {
    baseURL: environment.baseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
