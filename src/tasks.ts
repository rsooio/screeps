/**
 * 任务系统核心：需求声明、任务调度与执行者分配的纯函数层。
 * 不依赖 Game 全局，可直接单元测试。
 *
 * 控制架构（见 docs/architecture.md）：
 * 房间状态 → 需求声明（Demand，每 tick 无状态重算）→ 调度（reconcile，差分增删）
 * → 任务黑板（Memory.tasks）→ 分配（allocate，边际效用贪心）→ 执行（EXECUTORS）
 *
 * 动作（Action）是唯一语义源：能力要求、基础优先级、拥挤惩罚全部由动作派生，
 * 无角色概念、无硬编码容量——执行者数量由边际效用递减自然饱和。
 */

/** 高层语义动作（非 API 方法）：对目标做什么 */
export type Action = "deliver" | "build" | "upgrade";

/** 需求声明：设施声明"需要对目标执行什么动作"，无状态，每 tick 重新生成 */
export interface Demand {
  action: Action;
  targetId: string;
  roomName: string;
  /** 能量消耗速率（energy/tick）：deliver 需求强度的量化依据，不持久化 */
  rate?: number;
}

/** 任务（黑板，持久化）：需求经调度后的产物 */
export interface Task {
  id: string;
  action: Action;
  /** deliver: 能量目的地；build: 工地；upgrade: 控制器 */
  targetId: string;
  roomName: string;
}

/** 动作 → 基础优先级（需求紧急度） */
export const BASE_PRIORITY: Record<Action, number> = {
  deliver: 100,
  build: 60,
  upgrade: 30,
};

/** 距离成本权重（每格） */
export const DISTANCE_WEIGHT = 2;

/** 消耗速率权重：rate × RATE_WEIGHT 计入 deliver 价值 */
export const RATE_WEIGHT = 2;

/**
 * 结构能量消耗速率（energy/tick）：
 * - 生产中：按生产总消耗均摊（bodyCost / spawnTime）
 * - 空闲未满：备产速率（随时可能被生产抽用，需预存）
 * - 满：0（无需求）
 */
export function structureRate(params: {
  spawning: boolean;
  energy: number;
  capacity: number;
  bodyCost: number;
  spawnTime: number;
  prepRate: number;
}): number {
  const { spawning, energy, capacity, bodyCost, spawnTime, prepRate } = params;
  if (energy >= capacity) return 0;
  if (spawning) return bodyCost / spawnTime;
  return prepRate;
}

/** 动作 → 拥挤惩罚曲线（每增加一个执行者的边际代价） */
export function crowdingCost(action: Action, holders: number): number {
  switch (action) {
    // 陡峭：source 再生有限，多执行者边际收益骤降
    case "deliver":
      return holders * 25;
    case "build":
      return holders * 15;
    // 平缓：多人升级持续有效，吸收剩余产能（兜底任务）
    case "upgrade":
      return holders * 3;
  }
}

/**
 * 任务价值（无距离项）：基础优先级 + 消耗速率加权 - 拥挤惩罚。
 * 决定"值不值得加执行者"：价值 < 0 = 拥挤饱和，不再分配。
 * rate 只影响 deliver（其他动作传 0）。
 * upgrade 拥挤曲线平缓，价值恒正 —— 兜底任务吸收剩余产能，无人空闲。
 */
export function taskValue(action: Action, holders: number, rate = 0): number {
  const rateTerm = action === "deliver" ? rate * RATE_WEIGHT : 0;
  return BASE_PRIORITY[action] + rateTerm - crowdingCost(action, holders);
}

/**
 * 完整效用：价值 - 距离成本。
 * 用于任务间排序（就近偏好），不用于可行性判断（可行性看 taskValue）。
 */
export function taskUtility(
  action: Action,
  distance: number,
  holders: number,
  rate = 0,
): number {
  return taskValue(action, holders, rate) - distance * DISTANCE_WEIGHT;
}

/** 动作 → 能力要求映射（唯一事实源，查 docs.screeps.com/api 确认） */
export const ACTION_REQUIREMENTS: Record<
  Action,
  { capability: readonly BodyPartConstant[] }
> = {
  // 采集+运输需要 WORK（harvest）与 CARRY（承载）
  deliver: { capability: [WORK, CARRY] },
  // 文档：build Requires WORK and CARRY
  build: { capability: [WORK, CARRY] },
  // 文档：upgradeController Requires WORK and CARRY
  upgrade: { capability: [WORK, CARRY] },
};

export function capabilityOf(action: Action): readonly BodyPartConstant[] {
  return ACTION_REQUIREMENTS[action].capability;
}

/**
 * 滞回控制：能量状态两态机（采集中 / 工作中）的转移函数。
 * 双阈值切换：满载才转工作，耗尽才转采集；中间区间保持当前状态。
 * 避免单次动作消耗（upgrade/build 每 tick 耗 1-2 能量）导致的往返振荡。
 */
export function nextWorkingState(
  current: boolean | undefined,
  used: number,
  free: number,
): boolean {
  if (current && used === 0) return false; // 工作中耗尽 → 采集
  if (!current && free === 0) return true; // 采集中满载 → 工作
  return current === true; // 初始（undefined）或区间内保持
}

/** 执行者 body 是否满足任务能力要求 */
export function hasCapability(
  body: readonly BodyPartConstant[],
  capability: readonly BodyPartConstant[],
): boolean {
  return capability.every((part) => body.includes(part));
}

/** 任务 id 由 动作+目标 决定，天然幂等去重 */
export function makeTaskId(action: Action, targetId: string): string {
  return `${action}:${targetId}`;
}

export function taskFromDemand(demand: Demand): Task {
  return {
    id: makeTaskId(demand.action, demand.targetId),
    action: demand.action,
    targetId: demand.targetId,
    roomName: demand.roomName,
  };
}

/**
 * 调度：需求与任务黑板差分。
 * - 需求存在而任务缺失 → 发布
 * - 需求消失（结构满/工地完成）→ 回收
 * 幂等：同动作同目标任务不重复发布。
 */
export function reconcile(
  tasks: readonly Task[],
  demands: readonly Demand[],
): Task[] {
  const kept: Task[] = [];
  const keptIds = new Set<string>();
  for (const task of tasks) {
    const stillNeeded = demands.some(
      (d) => d.action === task.action && d.targetId === task.targetId,
    );
    if (stillNeeded) {
      kept.push(task);
      keptIds.add(task.id);
    }
  }
  const added: Task[] = [];
  for (const demand of demands) {
    const id = makeTaskId(demand.action, demand.targetId);
    if (!keptIds.has(id)) {
      keptIds.add(id);
      added.push(taskFromDemand(demand));
    }
  }
  return [...kept, ...added];
}

/** 分配输入：待分配 idle creep 的快照（位置由调用方折算为距离） */
export interface IdleCreepInput {
  name: string;
  /** body 部件列表（能力检查） */
  body: readonly BodyPartConstant[];
  /** taskId -> 组合距离（creep→最近source + creep→目标） */
  distByTaskId: ReadonlyMap<string, number>;
}

/** 分配输入：taskId -> 当前消耗速率（deliver 需求强度，由调用方实时注入） */
export type RateByTaskId = ReadonlyMap<string, number>;

/**
 * 分配：迭代贪心（边际效用最大化）。
 * 每轮选取效用最高的 (creep, task) 配对，分配后拥挤惩罚上升，
 * 使后续执行者自然流向其他任务（无硬编码容量）。
 * 停止条件：所有任务拥挤饱和（价值 < 0）—— 距离只影响选择排序，不影响可行性；
 * 兜底任务（upgrade）价值恒正，剩余产能永远被吸收，不会出现无人空闲。
 * 返回 creepName -> taskId。
 */
export function allocate(
  idleCreeps: readonly IdleCreepInput[],
  tasks: readonly Task[],
  holders: ReadonlyMap<string, number>,
  rateByTaskId: RateByTaskId = new Map(),
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  const holderCount = new Map(holders);
  const pool = [...idleCreeps];

  while (pool.length > 0) {
    // 停止条件：所有任务拥挤饱和（价值 < 0）
    let maxValue = -Infinity;
    for (const task of tasks) {
      const v = taskValue(
        task.action,
        holderCount.get(task.id) ?? 0,
        rateByTaskId.get(task.id) ?? 0,
      );
      if (v > maxValue) maxValue = v;
    }
    if (maxValue < 0) break;

    let best:
      { creep: IdleCreepInput; task: Task; utility: number } | undefined;
    for (const creep of pool) {
      for (const task of tasks) {
        if (!hasCapability(creep.body, capabilityOf(task.action))) continue;
        const dist = creep.distByTaskId.get(task.id);
        if (dist === undefined) continue;
        const u = taskUtility(
          task.action,
          dist,
          holderCount.get(task.id) ?? 0,
          rateByTaskId.get(task.id) ?? 0,
        );
        if (best === undefined || u > best.utility) {
          best = { creep, task, utility: u };
        }
      }
    }
    if (best === undefined) break;
    result.set(best.creep.name, best.task.id);
    holderCount.set(best.task.id, (holderCount.get(best.task.id) ?? 0) + 1);
    pool.splice(pool.indexOf(best.creep), 1);
  }
  return result;
}

/**
 * 周期边界再评估（分配惰性修复）：
 * 执行者在能量耗尽（工作周期边界）时，比较当前任务（去除自己后）的价值
 * 与其他可执行任务（不含当前任务）的最高价值——其他更高则释放重新分配。
 * 耗尽时才评估，不会每 tick 抖振；释放后由分配器重新就近分配（可能领回原任务）。
 */
export function shouldResignTask(
  task: Task | undefined,
  usedEnergy: number,
  currentValue: number,
  bestOtherValue: number,
): boolean {
  return (
    task !== undefined && usedEnergy === 0 && bestOtherValue > currentValue
  );
}
