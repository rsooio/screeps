/**
 * 任务执行层：把任务翻译成 creep 的每 tick 动作。
 * 依赖 Game 全局（薄层），决策逻辑在 tasks.ts / spawn.ts（纯函数）。
 */
import type { Task } from "./tasks";

/** 找最近的有能量的 source（升级/建造 creep 自给自足用） */
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

/** harvest 任务：从 source 采能量，送回 spawn/extension（满载且无处可送时原地等待） */
export function runHarvest(creep: Creep, task: Task): void {
  const source = Game.getObjectById(task.targetId as Id<Source>);
  if (!source) return;
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    const result = creep.harvest(source);
    if (result === ERR_NOT_IN_RANGE) creep.moveTo(source);
  } else {
    const target = findEnergyDropTarget(creep.pos);
    if (target) {
      const result = creep.transfer(target, RESOURCE_ENERGY);
      if (result === ERR_NOT_IN_RANGE) creep.moveTo(target);
    }
  }
}

/** upgrade 任务：能量空时自采，然后去控制器升级 */
export function runUpgrade(creep: Creep, task: Task): void {
  const controller = Game.getObjectById(
    task.targetId as Id<StructureController>,
  );
  if (!controller) return;
  if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
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

/** build 任务：能量空时自采，然后去工地建造 */
export function runBuild(creep: Creep, task: Task): void {
  const site = Game.getObjectById(task.targetId as Id<ConstructionSite>);
  if (!site) return;
  if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
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

export const EXECUTORS: Record<
  Task["type"],
  (creep: Creep, task: Task) => void
> = {
  harvest: runHarvest,
  upgrade: runUpgrade,
  build: runBuild,
};
