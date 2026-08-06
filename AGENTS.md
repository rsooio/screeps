# AGENTS.md

Screeps AI 项目（TypeScript）。本文指导代码编写与信息获取。

## 信息获取（写代码前）

1. **架构设计**：完整控制架构（黑板/需求驱动/边际效用/滞回）先读 [docs/architecture.md](docs/architecture.md)
2. **游戏阶段与行为**：涉及殖民地发展/结构/防御/经济行为的改动，先读 [docs/game-phases.md](docs/game-phases.md)（阶段摘要）确认上下文，再查 [ROADMAP.md](ROADMAP.md) 确认方向；**机制细节以官方行为文档网页为准**（非 API 页）：https://docs.screeps.com/control.html（RCL/结构解锁）、invaders.html（入侵者行为）、resources.html（矿物/化合物）、market.html、power.html，不要凭二手总结做机制决策
3. **游戏 API**：动作的能力要求（Requires）查 https://docs.screeps.com/api/，不要凭记忆写 body part 要求
4. **类型定义**：Screeps 全局类型在 `node_modules/@types/screeps/index.d.ts`；不确定的 API 签名先查这里，不要猜
5. **引擎行为**：服务器端机制（如模块 require 语义、Memory 序列化）查 `@screeps/engine` / `@screeps/driver` 源码或官方文档，不靠推测

## 代码编写

### 架构不变量（改动前必须确认不破坏）

1. **需求无状态**：Demand 每 tick 重算，不持久化；rate（消耗速率）分配时实时注入
2. **任务无所有权**：执行者数每 tick 从 `Game.creeps` 反查；禁止恢复 claimedBy/容量字段
3. **无硬编码容量**：执行者数量由边际效用递减自然饱和
4. **动作是唯一语义源**：能力要求/执行器由 `Action` 派生；禁止按任务类型写分支逻辑
5. **价值与效用分离**：`taskValue`（可行性）与 `taskUtility`（排序）不可合并
6. **执行层滞回统一**：能量状态用 `isWorking` 两态机；动作不分类
7. **upgrade 兜底**：价值恒正，吸收剩余产能，保证无人空闲

### 分层纪律

| 层             | 位置           | 约束                                                           |
| -------------- | -------------- | -------------------------------------------------------------- |
| 需求声明       | `declare.ts`   | Game 薄壳，只做状态→Demand 映射                                |
| 调度/分配/效用 | `tasks.ts`     | **纯函数**：禁 Game 引用，依赖（距离/持有者/rate）由调用方注入 |
| 生产决策       | `spawn.ts`     | 纯函数，同上                                                   |
| 执行           | `executors.ts` | Game 层薄壳                                                    |
| 主循环         | `index.ts`     | 装配：声明→调度→分配→执行→清理                                 |

### 新增动作（标准流程）

1. `Action` 联合类型加成员
2. `ACTION_REQUIREMENTS` 加能力映射（查 API 文档 Requires）
3. `executors.ts` 加执行器并注册
4. `declare.ts` 加需求声明（若适用）
5. 单元 + 集成测试

### 测试纪律

- 控制律（效用曲线、饱和点、滞回转移）必须有单元测试
- 改了声明/分配/执行逻辑必须跑 mockup 集成测试验证端到端行为
- 修改测试后运行迭代到通过

## 约定

- 注释中文；prettier 格式；只用可擦除 TS 语法（禁 enum/namespace）
- Memory 只存持久化状态（任务、creep 任务引用与工作状态）；tick 内临时数据（需求、rate）不落 Memory
- 效用参数是控制律，调整需同步更新测试中的饱和点断言
