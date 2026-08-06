/**
 * 任务系统核心：全局任务队列的纯函数操作。
 * 不依赖 Game 全局，可直接单元测试。
 *
 * 容量模型：每个任务带 capacity（最大执行者数），持有者数由调用方每 tick
 * 从 Game.creeps 实时统计（无 claimedBy 状态，死亡 creep 自动不计）。
 * - harvest：无固定目标（执行时动态选最近 source），capacity = 房间 source 数
 *   （每 source 约 1 个采集者：2 WORK 采 4/tick < source 再生 10/tick，不抽干能量源）
 * - upgrade：capacity = MAX_CREEPS（多 creep 升级同一控制器无冲突）
 * - build：capacity = 1（同一工地一人建造）
 */
export type TaskType = "harvest" | "build" | "upgrade";

interface BaseTask {
  id: string;
  type: TaskType;
  roomName: string;
  /** 最大执行者数 */
  capacity: number;
}

export interface HarvestTask extends BaseTask {
  type: "harvest";
  /** 无固定目标：执行时由 creep 动态选择最近的 source */
}

export interface TargetedTask extends BaseTask {
  type: "build" | "upgrade";
  targetId: string;
}

export type Task = HarvestTask | TargetedTask;

/** 任务 id 由 类型+关键标识 决定，天然幂等去重 */
export function makeTaskId(type: TaskType, key: string): string {
  return `${type}:${key}`;
}

export function createTask(
  type: "harvest",
  roomName: string,
  capacity: number,
): HarvestTask;
export function createTask(
  type: "build" | "upgrade",
  roomName: string,
  targetId: string,
  capacity: number,
): TargetedTask;
export function createTask(
  type: TaskType,
  roomName: string,
  keyOrCapacity: string | number,
  capacity = 1,
): Task {
  const targetId =
    typeof keyOrCapacity === "string" ? keyOrCapacity : undefined;
  const base: BaseTask = {
    id: makeTaskId(type, targetId ?? roomName),
    type,
    roomName,
    capacity,
  };
  if (type === "harvest") {
    return { ...base, capacity: keyOrCapacity as number } as HarvestTask;
  }
  return { ...base, targetId: keyOrCapacity as string } as TargetedTask;
}

/** 领取优先级：harvest > build > upgrade（upgrade 是兜底任务，永保无人空闲） */
export const TASK_PRIORITY: readonly TaskType[] = [
  "harvest",
  "build",
  "upgrade",
];

export function removeTask(tasks: readonly Task[], taskId: string): Task[] {
  return tasks.filter((t) => t.id !== taskId);
}

/**
 * 任务是否可领取：持有者数未达容量。
 * holderCount: taskId -> 当前持有者数（调用方从 Game.creeps 实时统计）。
 */
export function isTaskClaimable(
  task: Task,
  holderCount: ReadonlyMap<string, number>,
): boolean {
  return (holderCount.get(task.id) ?? 0) < task.capacity;
}

/**
 * 按优先级选可领取任务；同一优先级内选距离最近的任务（距离由调用方注入）。
 * 调用方应传入已按 isTaskClaimable 过滤的任务列表。
 * 无距离信息的任务作为兜底候选，仅在无任何有距离任务时按数组顺序选中。
 */
export function findNearestOpenTask(
  tasks: readonly Task[],
  distByTaskId: ReadonlyMap<string, number> = new Map(),
  priority: readonly TaskType[] = TASK_PRIORITY,
): Task | undefined {
  for (const type of priority) {
    let best: Task | undefined;
    let bestDist = Infinity;
    let fallback: Task | undefined;
    for (const t of tasks) {
      if (t.type !== type) continue;
      const d = distByTaskId.get(t.id);
      if (d === undefined) {
        fallback ??= t;
        continue;
      }
      if (d < bestDist) {
        best = t;
        bestDist = d;
      }
    }
    if (best) return best;
    if (fallback) return fallback;
  }
  return undefined;
}

/**
 * 转岗判断：固定目标任务持有者能量耗尽且 harvest 任务可领（存在且未饱和）时，
 * 应转岗采集（解决出生时机导致的初始任务僵化）。饱和时不可领，转岗无意义。
 */
export function shouldTransferToHarvest(
  task: Task | undefined,
  usedEnergy: number,
  harvestClaimable: boolean,
): boolean {
  return (
    task !== undefined &&
    task.type !== "harvest" &&
    usedEnergy === 0 &&
    harvestClaimable
  );
}
