import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 5"], defaultBrowserType: "chromium" }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: "npx next dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      APP_MODE: "sandbox",
      DATA_BACKEND: "sqlite",
      DATABASE_URL: "file:./data/buildstax-e2e-3101.db",
      AUTH_SECRET: "buildstax-e2e-session-secret-with-more-than-thirty-two-characters",
      ADMIN_EMAIL: "operator@buildstax.local",
      ADMIN_PASSWORD: "buildstax-local",
    },
  },
});
