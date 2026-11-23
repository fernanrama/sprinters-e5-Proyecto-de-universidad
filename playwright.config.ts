import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function testServer(port: number) {
  const baseURL = `http://127.0.0.1:${port}`;
  return {
    baseURL,
    webServer: {
      command: "node --import tsx tests/serve.mts",
      url: `${baseURL}/api/health`,
      reuseExistingServer: false,
      env: { HEALTHY_LIFE_TEST_PORT: String(port) },
    },
  };
}

const { baseURL, webServer } = testServer(3107);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: join(tmpdir(), "healthy-life-p0-results"),
  use: {
    baseURL,
    browserName: "chromium",
    screenshot: "off",
    trace: "off",
  },
  webServer,
});
