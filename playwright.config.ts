import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { resolveE2eEnvironment, resolveProductLifecycle } from "./src/environment.mjs";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const environment = resolveE2eEnvironment({ rootDir });
const lifecycle = resolveProductLifecycle(environment.testDir);
const artifactRoot = `artifacts/${environment.productCode}`;

export default defineConfig({
  ...lifecycle,
  testDir: environment.testDir,
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["line"],
    ["html", { outputFolder: `${artifactRoot}/html`, open: "never" }],
    ["junit", { outputFile: `${artifactRoot}/junit.xml` }],
  ],
  outputDir: `${artifactRoot}/test-results`,
  use: {
    baseURL: environment.baseUrl,
    locale: "ru-RU",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: process.platform === "linux" ? { args: ["--no-sandbox"] } : {},
      },
    },
  ],
});
