/**
 * 任务系统核心：全局任务队列的纯函数操作。
 * 不依赖 Game 全局，可直接单元测试。
 * 任务模型：{ type, targetId }，claimedBy 标记领取者；队列存于 Memory.tasks。
 */
export type TaskType = "harvest" | "build" | "upgrade";

export interface Task {
  id: string;
  type: TaskType;
  targetId: string;
  claimedBy?: string;
}

/** 任务 id 由 类型+目标 决定，天然幂等去重（同类型同目标只有一个任务） */
export function makeTaskId(type: TaskType, targetId: string): string {
  return `${type}:${targetId}`;
}

export function createTask(type: TaskType, targetId: string): Task {
  return { id: makeTaskId(type, targetId), type, targetId };
}

/** 领取优先级：harvest > build > upgrade（upgrade 是兜底任务，永保无人空闲） */
export const TASK_PRIORITY: readonly TaskType[] = [
  "harvest",
  "build",
  "upgrade",
];

/** 领取任务：仅 open（无 claimedBy）可领，返回新数组（不可变） */
export function claimTask(
  tasks: readonly Task[],
  taskId: string,
  creepName: string,
): Task[] {
  return tasks.map((t) =>
    t.id === taskId && !t.claimedBy ? { ...t, claimedBy: creepName } : t,
  );
}

/** 释放任务：仅领取者本人可释放 */
export function releaseTask(
  tasks: readonly Task[],
  taskId: string,
  creepName: string,
): Task[] {
  return tasks.map((t) =>
    t.id === taskId && t.claimedBy === creepName
      ? { ...t, claimedBy: undefined }
      : t,
  );
}

export function removeTask(tasks: readonly Task[], taskId: string): Task[] {
  return tasks.filter((t) => t.id !== taskId);
}

/** 按优先级找第一个 open 任务 */
export function findOpenTask(
  tasks: readonly Task[],
  priority: readonly TaskType[] = TASK_PRIORITY,
): Task | undefined {
  for (const type of priority) {
    const task = tasks.find((t) => t.type === type && !t.claimedBy);
    if (task) return task;
  }
  return undefined;
}

/** 清理已死亡 creep 的任务占用；无变化时返回原数组引用（避免无谓的 Memory 写回） */
export function removeDeadClaims(
  tasks: readonly Task[],
  aliveCreepNames: ReadonlySet<string>,
): Task[] {
  if (!tasks.some((t) => t.claimedBy && !aliveCreepNames.has(t.claimedBy))) {
    return tasks as Task[];
  }
  return tasks.map((t) =>
    t.claimedBy && !aliveCreepNames.has(t.claimedBy)
      ? { ...t, claimedBy: undefined }
      : t,
  );
}

/** 任务目标是否仍然有效（用于失效清理） */
export function taskTargetAlive(
  task: Task,
  target: _HasId | null | undefined,
): boolean {
  return task.targetId === target?.id;
}
