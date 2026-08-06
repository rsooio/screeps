/**
 * 任务执行层：把任务翻译成 creep 的每 tick 动作。
 * 依赖 Game 全局（薄层），决策逻辑在 tasks.ts / spawn.ts（纯函数）。
 */
import type { TargetedTask } from "./tasks";

/** 找最近的有能量的 source（harvest 无固定目标，动态选择；升级/建造 creep 自给自足） */
function findNearestSource(pos: RoomPosition): Source | null {
  return pos.findClosestByPath(FIND_SOURCES);
}

/** 找最近的还有空间收能量的 spawn/extension */
function findEnergyDropTarget(
  pos: RoomPosition,
): StructureSpawn | StructureExtension | null {
  return pos.findClosestByPath(FIND_MY_STRUCTURES, {
    filter: (s) =>
      (s.structureType === STRUCTURE_SPAWN ||
        s.structureType === STRUCTURE_EXTENSION) &&
      s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
  });
}

/**
 * harvest 任务（无固定目标）：空载时动态选最近的 source 采集，
 * 满载后送回最近的 spawn/extension（无处可送时原地等待）。
 */
export function runHarvest(creep: Creep): void {
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    const source = findNearestSource(creep.pos);
    if (source) {
      const result = creep.harvest(source);
      if (result === ERR_NOT_IN_RANGE) creep.moveTo(source);
    }
  } else {
    const target = findEnergyDropTarget(creep.pos);
    if (target) {
      const result = creep.transfer(target, RESOURCE_ENERGY);
      if (result === ERR_NOT_IN_RANGE) creep.moveTo(target);
    }
  }
}

/** upgrade 任务：能量采满后去控制器升级，耗尽后再采 */
export function runUpgrade(creep: Creep, task: TargetedTask): void {
  const controller = Game.getObjectById(
    task.targetId as Id<StructureController>,
  );
  if (!controller) return;
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
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

/** build 任务：能量采满后去工地建造，耗尽后再采 */
export function runBuild(creep: Creep, task: TargetedTask): void {
  const site = Game.getObjectById(task.targetId as Id<ConstructionSite>);
  if (!site) return;
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
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
