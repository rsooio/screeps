import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // 集成测试需要跑大量真实引擎 tick，放宽超时
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
