import { defineConfig } from "rolldown";

// 单文件打包：src/index.ts 作为唯一入口，所有依赖合并进 dist/main.js。
// Screeps 服务器每 tick 调用 main.loop()，入口文件名与产物名（main.js）解耦，
// 产物固定为 main.js 以满足服务器的模块名约定。
// 依赖包（如 lodash-es）默认打包进产物；rolldown 对 CJS 包默认 external。
export default defineConfig({
  input: "src/index.ts",
  output: {
    file: "dist/main.js",
    format: "cjs",
    sourcemap: true,
    exports: "named",
  },
  // Screeps 运行时内置模块，需要 external，不能打包进产物
  external: ["game", /^game\//, "arena", /^arena\//],
});
