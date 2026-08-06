/**
 * 需求声明层：把房间状态映射为需求清单（每 tick 无状态重算，不持久化）。
 * 依赖 Game 全局（薄壳），映射逻辑简单，调度/分配在 tasks.ts（纯函数）。
 *
 * 需求强度 = 能量消耗速率（energy/tick），而非绝对缺口量：
 * - spawn 生产中：rate = 剩余生产消耗 / 生产总时长（生产瞬时消耗均摊）
 * - 结构空闲未满：rate = PREP_RATE（备产，随时可能被生产抽用）
 * - 满：rate = 0（无需求，不声明）
 */
import { structureRate } from "./tasks";
import type { Demand } from "./tasks";

/** 备产速率：结构空闲时的预期消耗（随时可能被生产抽用） */
export const PREP_RATE = 10;

/** spawn 的能量消耗速率（energy/tick） */
export function rateOfSpawn(spawn: StructureSpawn): number {
  const energy = spawn.store.getUsedCapacity(RESOURCE_ENERGY);
  const capacity = spawn.store.getCapacity(RESOURCE_ENERGY);
  if (spawn.spawning) {
    // 生产期间：剩余生产消耗均摊到生产时长（needTime = 总时长）
    return (capacity - energy) / spawn.spawning.needTime;
  }
  return structureRate({
    spawning: false,
    energy,
    capacity,
    bodyCost: 0,
    spawnTime: 0,
    prepRate: PREP_RATE,
  });
}

/** 本 tick 的需求清单 */
export function declareDemands(): Demand[] {
  const demands: Demand[] = [];
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];

    // spawn：消耗速率驱动（生产中最急迫，备产次之，满则无需求）
    for (const spawn of room.find(FIND_MY_SPAWNS)) {
      const rate = rateOfSpawn(spawn);
      if (rate > 0) {
        demands.push({ action: "deliver", targetId: spawn.id, roomName, rate });
      }
    }

    // extension：备产池角色（生产开始时被抽空）
    for (const ext of room.find(FIND_MY_STRUCTURES, {
      filter: (s) => s.structureType === STRUCTURE_EXTENSION,
    })) {
      const rate = structureRate({
        spawning: false,
        energy: ext.store.getUsedCapacity(RESOURCE_ENERGY),
        capacity: ext.store.getCapacity(RESOURCE_ENERGY),
        bodyCost: 0,
        spawnTime: 0,
        prepRate: PREP_RATE,
      });
      if (rate > 0) {
        demands.push({ action: "deliver", targetId: ext.id, roomName, rate });
      }
    }

    for (const site of room.find(FIND_CONSTRUCTION_SITES)) {
      demands.push({ action: "build", targetId: site.id, roomName });
    }

    if (room.controller?.my) {
      demands.push({
        action: "upgrade",
        targetId: room.controller.id,
        roomName,
      });
    }
  }
  return demands;
}
