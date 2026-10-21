import { defineConfig, devices } from "@playwright/test";

// E2E against a running app (npm run dev) backed by the *dev* Convex deployment.
// Auth specs need AUTH_DEV_OTP_CODE set on that deployment and E2E_OTP_CODE locally.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    ...(process.env.CI ? {} : { channel: "chrome" }),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], ...(process.env.CI ? {} : { channel: "chrome" }) } },
    { name: "mobile", use: { ...devices["Pixel 7"], ...(process.env.CI ? {} : { channel: "chrome" }) }, testMatch: /public\.spec\.ts/ },
  ],
});
