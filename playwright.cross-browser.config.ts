import { defineConfig } from "@playwright/test";
import base, { testServer } from "./playwright.config";

// These two engines are verified locally. Firefox is opt-in because its bundled
// Windows executable can fail to start before it loads the application.
const browsers = ["chromium", "webkit"];
if (process.env.HEALTHY_LIFE_TEST_FIREFOX === "1") browsers.push("firefox");

// Each browser needs its own temporary data, including the active session.
const servers = browsers.map((_, index) => testServer(3107 + index * 10));

export default defineConfig({
  ...base,
  webServer: servers.map(server => server.webServer),
  projects: browsers.map((browserName, index) => ({
    name: browserName,
    use: { browserName: browserName as "chromium" | "firefox" | "webkit", baseURL: servers[index].baseURL },
  })),
});
