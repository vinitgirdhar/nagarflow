import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3002",
    // Functional journeys should not click moving controls. Motion specs opt
    // back into animation explicitly and verify that behavior separately.
    reducedMotion: "reduce",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || (process.env.CI || process.platform === "win32" ? undefined : "/usr/bin/chromium"),
      args: ["--no-sandbox"],
    },
  },
  webServer: [
    {
      command: `${process.platform === "win32" ? '"..\\venv\\Scripts\\python.exe"' : "../venv/bin/python"} ../scripts/auth_browser_server.py`,
      url: "http://127.0.0.1:5002/api/health",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --hostname 127.0.0.1 --port 3002",
      url: "http://127.0.0.1:3002/login",
      env: { NAGARFLOW_BACKEND_URL: "http://127.0.0.1:5002" },
      reuseExistingServer: false,
    },
  ],
  timeout: 45000,
});
