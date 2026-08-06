# 游戏阶段与行为（开发依据）

来源：docs.screeps.com（control / creeps / invaders / resources / power / market）。本文总结殖民地发展阶段、各阶段行为特征与威胁模型，作为控制架构演进的依据。

## 1. 控制等级体系

### Room Controller Level（RCL）

| RCL | 升级所需能量 | 解锁结构                                                                                           | 阶段 |
| --- | ------------ | -------------------------------------------------------------------------------------------------- | ---- |
| 0   | —            | Roads、5 Containers                                                                                | A    |
| 1   | 200          | +1 Spawn                                                                                           | A    |
| 2   | 45,000       | +5 Extensions(50)、Ramparts(300K)、Walls                                                           | A→B  |
| 3   | 135,000      | +10 Ext、1 Tower                                                                                   | B    |
| 4   | 405,000      | +20 Ext、Storage                                                                                   | C    |
| 5   | 1,215,000    | +30 Ext、2 Towers、2 Links                                                                         | C    |
| 6   | 3,645,000    | +40 Ext、3 Links、Extractor、3 Labs、Terminal                                                      | D    |
| 7   | 10,935,000   | 2 Spawns、+50 Ext(100)、3 Towers、4 Links、6 Labs、Factory                                         | D    |
| 8   | —            | 3 Spawns、60 Ext(200)、6 Towers、6 Links、10 Labs、Terminal、Factory、Observer、Power Spawn、Nuker | E    |

### Global Control Level（GCL）与 CPU

- GCL 随控制器能量投入增长（与 RCL 并行，RCL8 满后继续投入仍涨 GCL）
- 初始 CPU 限额 20；"CPU Unlock"后每 GCL +10，至 300 封顶
- **CPU 是硬约束**：代码效率直接决定能控制的 creep 数量

### 控制器降级

- 不升级则降级计时器递减（RCL1 为 20,000 tick，RCL2-8 为 5,000~150,000 tick）
- 降到 0 → 控制器变中立，可被他人夺取
- **升级任务必须持续存在**（当前架构 upgrade 兜底任务与此吻合）

## 2. 阶段划分与行为特征

### 阶段 A：基础殖民地（RCL 1-2，当前代码所处）

- **结构**：1 Spawn（300 能量上限）、道路、容器
- **行为**：能量采集 → 生产 creep → 升级 RCL2（45,000 能量）
- **威胁**：light 入侵者（见 §3），出现频率低（开采量低）
- **控制需求**：deliver/build/upgrade 三动作（已实现）；升级效率（当前瓶颈：body 1 MOVE）
- **本阶段目标**：稳定自持 + 尽快 RCL2

### 阶段 B：扩展殖民地（RCL 2-3）

- **结构**：5-10 Extensions（能量上限 500-800）、Ramparts、Walls、Tower（RCL3）
- **行为**：
  - 能量缺口从"1 spawn"变为"spawn + N extensions 池"——**多目的地需求竞争**（消耗速率模型正好适用：生产抽空 extensions，各目的地 rate 声明需求）
  - Tower 自动防御：light 入侵者开始成为真实威胁（每 ~100k 开采量触发）
  - Ramparts/Walls 建造与**维修**（repair 动作，新需求类型）
- **控制需求**：多目的地声明（声明层扩展列表即可）、repair 动作、tower 防御（紧急度注入/优先级覆盖）、升级效率改善（RCL2→3 需 135,000，是 45k 的三倍）

### 阶段 C：仓储与物流（RCL 4-5）

- **结构**：Storage（RCL4）、Links（RCL5）、2 Towers
- **行为**：
  - 能量两级物流：source → 采集者 → storage → 消费者（spawn/extensions）
  - Storage 作为缓冲池（容量 1M）：deliver 需求从"结构自身"变为"结构 ← storage ← source"的供应链
  - Links 远程输电（RCL5 后跨图传输）
- **控制需求**：storage 声明支持（同接口零改动）、运输任务（source 侧固定产出 → 需要"供给型"需求：source 声明产能）、链路层级（storage 与 extensions 的优先级）

### 阶段 D：工业与矿物（RCL 6+）

- **结构**：Extractor、Labs（合成/boost）、Terminal、Factory、2nd Spawn
- **行为**：
  - 矿物开采（每房间一种矿物，RCL6 Extractor）：mine 动作（**产出型**——不消耗能量，working 状态机不适用，需新语义）
  - Lab 合成与 boost（30 化合物 + 20 能量/部件）
  - Terminal 跨房间/市场交易
- **控制需求**：mine 动作建模、矿物物流、合成反应调度、市场（买卖决策）

### 阶段 E：扩张与终局

- **行为**：多房间（GCL 驱动）、Power（Power Bank 争夺、GPL、Power Creep）、战争（入侵玩家房间）
- **控制需求**：多房间声明/分配、战斗单元、power 采集

## 3. 威胁模型：NPC 入侵者

- **触发**：房间累计开采约 100,000 能量（+随机变量）→ 房间出口出现入侵者
- **行为**：猎杀 creep；挡路结构会被摧毁（attack/rangedAttack/dismantle）；不能跨房间
- **类型**：light（RCL<4 的房间）；heavy（RCL4+）
- **Raid**：10% 概率 2-5 只，分工（近战/远程/治疗），可能带 boost
- **出现条件**：只能出现在通往**中立/未保留**房间的出口；全出口受控则不会出现
- **对架构的影响**：阶段 B 起 tower 防御是刚需；战斗是"紧急度注入"（basePriority 覆盖）的天然用例

## 4. 资源与工业

- **能量**：唯一的基础资源；source 再生 10/tick（3000/300 tick）
- **矿物**：7 种基础矿物，每房间一种；base → 化合物（Lab，3 个 Lab 一组）→ boost（提升 2-4 倍部件效能）
- **Power**：终局机制，Power Bank（中立空房间）+ 市场购买
- **市场**：NPC 交易者 + 玩家间交易（资源/化合物/creep 图纸）

## 5. 对当前控制架构的映射

| 阶段 | 新需求/动作                    | 架构改动                                  | 复杂度 |
| ---- | ------------------------------ | ----------------------------------------- | ------ |
| B    | repair、tower 防御、多目的地   | 声明层扩展 + 新动作（零成本）+ 紧急度机制 | 低     |
| C    | storage 声明、供给型需求       | 声明层（supply 需求类型）                 | 中     |
| D    | mine（产出型）、矿物物流、市场 | 动作新语义（非消耗型）+ 交易决策层        | 高     |
| E    | 多房间、战斗、power            | 跨房间分配、战斗单元                      | 高     |

当前代码处于**阶段 A**：三动作（deliver/build/upgrade）+ 需求驱动 + 边际效用分配已覆盖阶段 A 核心；阶段 B 的入口是 **repair 动作与 tower 防御**，而多目的地扩展（extensions）只需声明层加结构类型。
