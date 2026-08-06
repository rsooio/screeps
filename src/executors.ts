/**
 * 执行层：把任务动作翻译成 creep 的每 tick 操作。
 * 依赖 Game 全局（薄层），决策逻辑在 tasks.ts（纯函数）。
 * 源侧动态：能量来源（source）由执行者自行就近选择，任务只声明目的地/目标。
 *
 * 能量状态采用滞回控制（两态机：采集中/工作中）：
 * 满载才转工作，耗尽才转采集，中间区间保持当前状态——
 * 避免单次动作消耗导致的往返振荡（无论一次清空还是逐 tick 消耗，
 * 都落在同一状态机内，动作无需分类）。
 */
import { nextWorkingState } from "./tasks";
import type { Task } from "./tasks";

/** 找最近的有能量的 source（源侧动态，无固定目标） */
function findNearestSource(pos: RoomPosition): Source | null {
  return pos.findClosestByPath(FIND_SOURCES);
}

/**
 * 矿工基础设施行为（非任务）：固定在最近 source 旁连续采集，
 * 无 CARRY → 能量自动掉落，由 deliver 执行者拾取。
 * 不参与任务经济，由 spawn 决策按 source 缺位补充。
 */
export function runMiner(creep: Creep): void {
  const source = findNearestSource(creep.pos);
  if (!source) return;
  const result = creep.harvest(source);
  if (result === ERR_NOT_IN_RANGE) creep.moveTo(source);
}

/** 读取并推进 creep 的工作状态（滞回） */
function isWorking(creep: Creep): boolean {
  creep.memory.working = nextWorkingState(
    creep.memory.working,
    creep.store.getUsedCapacity(RESOURCE_ENERGY),
    creep.store.getFreeCapacity(RESOURCE_ENERGY),
  );
  return creep.memory.working ?? false;
}

/** deliver：按滞回状态采集（优先拾取掉落能量，否则自采）或送往任务声明的目的地 */
export function runDeliver(creep: Creep, task: Task): void {
  if (!isWorking(creep)) {
    // 源侧动态：优先拾取最近的掉落能量（如基础设施产出），否则自行采集
    const dropped = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
      filter: (r) => r.resourceType === RESOURCE_ENERGY,
    });
    if (dropped) {
      const result = creep.pickup(dropped);
      if (result === ERR_NOT_IN_RANGE) creep.moveTo(dropped);
    } else {
      const source = findNearestSource(creep.pos);
      if (source) {
        const result = creep.harvest(source);
        if (result === ERR_NOT_IN_RANGE) creep.moveTo(source);
      }
    }
  } else {
    const target = Game.getObjectById(task.targetId as Id<AnyStoreStructure>);
    if (target && target.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      const result = creep.transfer(target, RESOURCE_ENERGY);
      if (result === ERR_NOT_IN_RANGE) creep.moveTo(target);
    }
  }
}

/** upgrade：滞回控制，满载后连续升级，耗尽才回采 */
export function runUpgrade(creep: Creep, task: Task): void {
  const controller = Game.getObjectById(
    task.targetId as Id<StructureController>,
  );
  if (!controller) return;
  if (!isWorking(creep)) {
    const source = findNearestSource(creep.pos);
    if (source) {
      const result = creep.harvest(source);
      if (result === ERR_NOT_IN_RANGE) creep.moveTo(source);
    }
  } else {
    const result = creep.upgradeController(controller);
    if (result === ERR_NOT_IN_RANGE) creep.moveTo(controller);
  }
}

/** build：滞回控制，满载后连续建造，耗尽才回采 */
export function runBuild(creep: Creep, task: Task): void {
  const site = Game.getObjectById(task.targetId as Id<ConstructionSite>);
  if (!site) return;
  if (!isWorking(creep)) {
    const source = findNearestSource(creep.pos);
    if (source) {
      const result = creep.harvest(source);
      if (result === ERR_NOT_IN_RANGE) creep.moveTo(source);
    }
  } else {
    const result = creep.build(site);
    if (result === ERR_NOT_IN_RANGE) creep.moveTo(site);
  }
}

/** 动作 → 执行器（动作是唯一语义源，新增动作在此加一行） */
export const EXECUTORS: Record<
  Task["action"],
  (creep: Creep, task: Task) => void
> = {
  deliver: runDeliver,
  build: runBuild,
  upgrade: runUpgrade,
};
