# Screeps TypeScript Bot

Screeps（MMO 编程游戏）AI 项目。代码用 TypeScript 编写，由 rolldown 打包后自动上传到官方服务器。

## 技术栈

- **TypeScript 7**：类型安全（`strict` + `@types/screeps` 官方类型定义，tsconfig 启用 `erasableSyntaxOnly` 等强约束）
- **rolldown 1.x**：Rust 打包器，原生转译 TS（oxc），零编译插件，构建约 20ms
- **es-toolkit**：原生 TS 工具库（自带完整类型，无需 @types 包），按需摇树打包。集合操作优先用原生方法/可选链（库的设计哲学），`sum`、`groupBy` 等增强函数从 `es-toolkit/*` 子路径导入；lodash 风格迁移可用 `es-toolkit/compat`
- **零依赖上传脚本**：Node 内置 fetch，直接调用官方 REST API（`POST /api/user/code`）

## 快速开始

```bash
npm install
cp .env.example .env   # 填写 SCREEPS_TOKEN（账号设置里生成的 auth token）
```

常用命令：

```bash
npm run build     # 打包 src/ -> dist/
npm run check     # 类型检查（tsc --noEmit）
npm run format    # 格式化（Prettier：行宽 80、双引号、分号、全尾逗号 all、箭头参数括号）
npm run format:check  # 检查格式是否合规
npm run watch     # 监听模式构建
npm run dry-run   # 构建 + 预览将上传的模块清单（不实际上传）
npm run push      # 构建并上传到服务器
```

## 目录结构

```
src/
  index.ts        # 入口：服务器每个 tick 调用一次 main.loop()
  global.d.ts     # 补充全局类型声明（console 等）
scripts/
  upload.ts        # 上传脚本（Node 原生运行 TS，读取 .env，POST 到 /api/user/code）
rolldown.config.ts
  tsconfig.json        # solution 入口（references 指向下面两个项目）
  tsconfig.base.json   # 公共编译选项
  tsconfig.app.json    # 源码类型检查（src，types: screeps）
  tsconfig.tools.json  # 工具链类型检查（构建配置 + 上传脚本，types: node）
.env.example
```

## 工作原理

Screeps 的模块系统是 CommonJS 风格：每个模块是独立文件，用 `require('xxx')` 加载。本项目采用**单文件打包**：`src/index.ts` 作为唯一入口，所有依赖由 rolldown 合并进 `dist/main.js`，服务器每 tick 调用其中的 `loop()`。npm 依赖（如 es-toolkit）会被摇树后打包进产物；Screeps 内置模块（`game/*`、`arena/*`）标记为 external。

`main.ts` 导出 `loop()` 函数，服务器每 tick 执行一次。tick 期间发出的命令（`move`、`harvest`、`attack` 等）统一在 tick 结束时生效。

## 配置项（.env）

| 变量             | 说明                                                                  |
| ---------------- | --------------------------------------------------------------------- |
| `SCREEPS_TOKEN`  | auth token（screeps.com 账号设置中生成，鉴权走官方 `X-Token` header） |
| `SCREEPS_BRANCH` | 上传分支，默认 `default`                                              |
| `SCREEPS_HOST`   | API 地址，默认 `https://screeps.com`（私服可改）                      |

`.env` 已被 gitignore，不会提交。

## 类型安全约定

- 代码只使用可擦除的 TypeScript 语法（禁用 `enum`、`namespace`、参数属性），由 `erasableSyntaxOnly` 强制
- 类型导入必须显式写 `import type`（`verbatimModuleSyntax`）
- 严格空值检查、未使用变量报错等全部开启
