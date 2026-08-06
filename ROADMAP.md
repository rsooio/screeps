# 开发路线图（Roadmap）

阶段模型依据：[docs/game-phases.md](docs/game-phases.md)（RCL 驱动的五阶段）
架构演进依据：[docs/architecture.md](docs/architecture.md)（演进路径 1-7，编号对应）

## 里程碑总览

| 里程碑 | 阶段   | 主题         | 关键产出                       |
| ------ | ------ | ------------ | ------------------------------ |
| M1     | A 巩固 | 效率与稳定性 | 分配惰性修复、能力定制 body    |
| M2     | B 扩展 | 殖民地扩展   | extensions、repair、tower 防御 |
| M3     | C 物流 | 仓储与供应链 | storage、供给型需求            |
| M4     | D 工业 | 矿物与市场   | mine 动作、Lab、交易           |
| M5     | E 扩张 | 多房间与终局 | 跨房间分配、最优分配、战斗     |

每个里程碑验收标准统一为：**单元测试覆盖控制律 + mockup 集成测试端到端 + 报告曲线验证行为 + 文档同步**。

---

## M1：阶段 A 巩固（效率与稳定性）

**动机**：当前系统能自持，但有两个已确认的缺陷——分配惰性（生产窗口后多余采集者滞留）与升级效率瓶颈（body 1 MOVE，RCL2 需 45,000 能量，RCL3 三倍于此）。

### 1.1 分配惰性修复（架构演进路径 7）

- deliver 执行者在工作周期边界（能量耗尽）做**双向价值评估**：当前任务价值 vs 其他任务，低则释放重新分配
- 与现有 upgrade→deliver 转岗对称，零抖振（仍是周期边界决策）
- 预期效果：生产窗口结束后多余采集者自动撤离转 upgrade，消除 ~100 tick 产能浪费窗口
- 验收：集成报告曲线中"deliver 执行者数"在生产结束后回落（而非等能量满）

### 1.2 能力定制 body

- spawn 决策读取任务队列的 capability 需求（架构已预留：`ACTION_REQUIREMENTS`）
- 升级/建造任务多时产 WORK 多的 body；deliver 多时产 CARRY 多的 body；移动效率优先（MOVE 比例）
- 预期效果：升级速率提升（当前 1 MOVE 瓶颈是 RCL2 主障碍）
- 验收：RCL2（45,000 progress）达成 tick 数对比基线下降（报告 progress 曲线斜率）

### 1.3 生产策略硬化

- 升级能量预算：RCL 目标分配（阶段 A 前期优先 upgrade，保证 RCL2 尽早）
- 可选：按 RCL 切换 body 档位

---

## M2：阶段 B 扩展殖民地（RCL 2-3）

**动机**：RCL2 解锁 extensions（能量上限 500→800）与 ramparts；RCL3 解锁 tower。威胁模型出现（light 入侵者，每 ~100k 开采量触发）。

### 2.1 建设计划（战略层首个"规划"决策）

- 新动作/需求之外：**建造决策**——RCL 解锁后自动建 extensions/ramparts/walls（build 任务已有，缺"建什么、建多少"的规划）
- 位置策略：spawn 附近扩展（能量路径最短）
- 验收：集成测试中 RCL2 后自动出现 extension 工地并建成

### 2.2 多目的地需求（声明层扩展）

- `declare.ts` 的 `ENERGY_TARGETS` 加入 extension（当前只处理 spawn）——消耗速率模型天然竞争
- 验收：多个 extension 缺能量时，采集者按 rate+距离分布（报告劳动力曲线）

### 2.3 repair 动作（新增动作，标准 5 步流程）

- 维修 ramparts/walls/roads（`repair`：Requires WORK+CARRY，与 build 同型，滞回状态机直接复用）
- 需求声明：结构 `hits < hitsMax` 时声明 repair 需求；repair 消耗能量 → 同 deliver 的"能量来源"语义
- 验收：rampart 受损后自动维修闭环

### 2.4 tower 防御（紧急度注入，架构演进路径 4）

- tower 攻击逻辑：自动锁定入侵者（`FIND_HOSTILE_CREEPS`）
- 架构层面：紧急事件 = 优先级覆盖（防御需求 basePriority 覆盖正常任务）——首次引入"抢占式"机制，注意与黑板无所有权原则的兼容
- 验收：mockup 注入 hostile creep，tower 击杀、工人无损

---

## M3：阶段 C 仓储物流（RCL 4-5）

**动机**：RCL4 storage（1M 容量）改变能量流拓扑——从"结构直送"到"storage 缓冲 + 两级供应链"；RCL5 links 远程输电。

### 3.1 storage 声明支持

- 声明层加入 storage（已有接口，零代码改动验证）
- 供应链层级：source → 采集者 → storage；storage → spawn/extensions（消费者从 storage 取？或仍靠 deliver 送）——需要**两级任务模型**（供给型 + 需求型）
- 验收：能量经 storage 蓄能，消费高峰由 storage 平滑

### 3.2 供给型需求（新需求类型）

- source/container 声明"我有产能可供给"（supply 需求）——与需求型（demand）配对
- 运输任务：从 source 固定产出点 → storage（产出型动作建模的前置）
- 验收：供给-需求匹配闭环，无双向空跑

### 3.3 道路与容器

- 道路自动修建（采集路径上，移动成本 2→1）
- 容器中转（RCL0 已解锁 5 containers）：采集者不往返，由运输者搬运
- 验收：采集者单位 tick 产出提升（报告能量曲线）

---

## M4：阶段 D 工业矿物（RCL 6+）

**动机**：extractor/labs/terminal 解锁，经济从"能量"进入"矿物+化合物"维度。

### 4.1 mine 动作（产出型动作建模，架构演进路径 2）

- **关键分叉**：mine 不消耗能量 → 滞回 working 状态机不适用（产出型），需新状态语义
- 能力映射：`mine → [WORK]`（纯 WORK 矿工）
- 验收：矿工在 extractor 连续产出，与能量体系互不干扰

### 4.2 矿物物流与 Lab 调度

- 矿物运输（7 种基础矿物 → lab/terminal）
- Lab 反应调度（3 lab 一组）与 boost（30 化合物+20 能量/部件）
- 验收：化合物合成闭环，boost 生效（报告/线上验证）

### 4.3 市场交易（战略层决策）

- 买卖决策：稀缺资源买入、过剩卖出（Terminal）
- 验收：线上观察盈利曲线（mockup 无法测市场，需线上验证）

---

## M5：阶段 E 扩张与终局

**动机**：GCL 驱动多房间扩张；最优分配替代贪心；战争与 power。

### 5.1 多房间（架构演进路径 3）

- 声明按房间遍历（已支持）；跨房间分配（距离成本天然跨房间——需验证）
- 扩张决策（战略层）：新房间任务效用 vs 现有房间（GCL 门槛）
- 验收：双房间集成测试（两个 spawn 各自声明需求，劳动力跨房间合理分布）

### 5.2 最优分配（架构演进路径 5）

- 匈牙利算法后端替换贪心（分配器接口已抽象）；大规模时考虑 LP
- 验收：分配结果与贪心对比（总效用提升，报告/单测）

### 5.3 战斗与 power

- 战斗单元（attack/ranged/heal 能力匹配——动作映射表扩展）
- Power Bank 采集（终局，需 heal 团队）
- 验收：mockup 战斗场景 + 线上验证

---

## 横切事项（每个里程碑）

- **文档同步**：architecture.md 演进路径更新为已实现；game-phases.md 阶段标注
- **测试**：控制律单元测试、集成测试端到端、报告曲线验证（时间戳留档对比）
- **线上验证**：mockup 通过后 `npm run push` 上线观察（报告曲线与线上行为对照）
- **性能**：CPU 预算意识（GCL 解锁前 20 CPU 限制），分配/声明 O(n·m) 保持

## 当前状态（M1 起点）

- 阶段 A 核心已实现：deliver/build/upgrade 三动作、需求驱动、边际效用分配、滞回控制
- 已知缺陷：分配惰性（演进路径 7）、body 1 MOVE 效率、deliver 目标满等待
- 测试基建：50 单元 + 4 集成 + 报告系统（时间戳留档）
