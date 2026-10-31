import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:5173', launchOptions: { args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-features=Vulkan'] } },
  webServer: { command: 'npm run dev -- --strictPort', url: 'http://localhost:5173/dinosaur/', reuseExistingServer: true, timeout: 60_000 },
});
