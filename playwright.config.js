import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 180000,
  expect: { timeout: 20000 },
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    ignoreHTTPSErrors: !!process.env.HTTPS_PROXY,
    proxy: process.env.HTTPS_PROXY
      ? { server: process.env.HTTPS_PROXY, bypass: "127.0.0.1,localhost" }
      : undefined,
    launchOptions: process.env.CHROMIUM_PATH
      ? {
          executablePath: process.env.CHROMIUM_PATH,
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
        }
      : {},
  },
  webServer: {
    command: "npm run dev -- --port 5173 --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
});
