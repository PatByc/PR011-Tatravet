import { defineConfig } from "@playwright/test";
if (!process.env.TEST_DATABASE_URL)
  throw new Error("Set TEST_DATABASE_URL to an isolated migrated database.");
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://localhost:3111", trace: "retain-on-failure" },
  webServer: {
    command: "npm start -- --port 3111",
    url: "http://localhost:3111/api/health",
    reuseExistingServer: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL || "",
      PUBLIC_URL: "http://localhost:3111",
      DEMO_MODE: "true",
      VAPI_ASSISTANT_IDS: "test-assistant",
      VAPI_WEBHOOK_SECRET: "test-webhook-secret-at-least-32-characters",
    },
    timeout: 60000,
  },
});
