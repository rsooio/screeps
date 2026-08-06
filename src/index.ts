/**
 * 主循环：服务器每个 tick 调用一次。
 * 控制回路（docs/architecture.md）：感知 → 声明 → 调度 → 分配 → 执行 → 反馈。
 */
import { allocate, taskValue, reconcile, shouldResignTask } from "./tasks";
import type { IdleCreepInput, Task } from "./tasks";
import { declareDemands, rateOfSpawn, PREP_RATE } from "./declare";
import { EXECUTORS, runMiner } from "./executors";
import { decideSpawn, minerDeployable, MINER_BODY } from "./spawn";

function ensureMemory(): void {
  if (!Memory.tasks) Memory.tasks = [];
}

/** 统计各任务的当前执行者数（从存活 creep 实时统计，死亡自动不计） */
function holderCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const name in Game.creeps) {
    const taskId = Game.creeps[name].memory.taskId;
    if (taskId) counts.set(taskId, (counts.get(taskId) ?? 0) + 1);
  }
  return counts;
}

/** 组合距离（方案 B）：creep → 最近 source + creep → 任务目标 */
function combinedDistance(
  creep: Creep,
  task: Task,
  sourcesByRoom: Map<string, Source[]>,
): number {
  if (task.action === "deliver") {
    // 源侧动态：以最近 source 的距离代表采集路程
    const sources = sourcesByRoom.get(task.roomName) ?? [];
    let toSource = Infinity;
    for (const s of sources) {
      const d = creep.pos.getRangeTo(s.pos);
      if (d < toSource) toSource = d;
    }
    if (toSource === Infinity) return Infinity;
    const target = Game.getObjectById<RoomObject & _HasId>(task.targetId);
    return target ? toSource + creep.pos.getRangeTo(target.pos) : Infinity;
  }
  const target = Game.getObjectById<RoomObject & _HasId>(task.targetId);
  return target ? creep.pos.getRangeTo(target.pos) : Infinity;
}

/** spawn：按"边际效用仍为正的任务数"决定是否生产 */
/** 各 deliver 任务当前的消耗速率（需求强度，实时注入效用计算） */
function rateByTaskId(): Map<string, number> {
  const rates = new Map<string, number>();
  for (const t of Memory.tasks) {
    if (t.action !== "deliver") continue;
    const obj = Game.getObjectById(t.targetId as Id<Structure>);
    if (!obj) continue;
    if (obj.structureType === STRUCTURE_SPAWN) {
      const rate = rateOfSpawn(obj as StructureSpawn);
      if (rate > 0) rates.set(t.id, rate);
    } else if (obj.structureType === STRUCTURE_EXTENSION) {
      rates.set(t.id, PREP_RATE);
    }
  }
  return rates;
}

/** 矿工基础设施维护（投资决策）：满足硬编码门槛时部署，否则不干预普通生产 */
function maintainMiners(spawn: StructureSpawn, room: Room): boolean {
  const minerCount = Object.values(Game.creeps).filter(
    (c) => c.memory.isMiner && c.room.name === room.name,
  ).length;
  const workerCount = Object.values(Game.creeps).filter(
    (c) => !c.memory.isMiner && c.room.name === room.name,
  ).length;
  const sourceCount = room.find(FIND_SOURCES).length;
  if (
    minerDeployable({
      energy: spawn.store.getUsedCapacity(RESOURCE_ENERGY),
      workerCount,
      minerCount,
      sourceCount,
      busy: spawn.spawning !== null,
    })
  ) {
    spawn.spawnCreep(MINER_BODY, `miner-${Game.time}`, {
      memory: { isMiner: true },
    });
    return true;
  }
  return false;
}

function runSpawns(holders: ReadonlyMap<string, number>): void {
  const rates = rateByTaskId();
  const values = new Map<string, number>();
  const taskMix = { carry: 0, work: 0 };
  for (const t of Memory.tasks) {
    const v = taskValue(t.action, holders.get(t.id) ?? 0, rates.get(t.id) ?? 0);
    values.set(t.id, v);
    if (v > 0) {
      if (t.action === "deliver") taskMix.carry++;
      else taskMix.work++;
    }
  }
  const openTaskCount = [...values.values()].filter((v) => v > 0).length;
  for (const name in Game.spawns) {
    const spawn = Game.spawns[name];
    const room = spawn.room;
    // 基础设施优先：先补矿工（部署或攒钱让路），再产普通 creep
    if (!spawn.spawning) {
      if (maintainMiners(spawn, room)) continue;
    }
    const body = decideSpawn({
      energy: spawn.store.getUsedCapacity(RESOURCE_ENERGY),
      creepCount: Object.keys(Game.creeps).length,
      openTaskCount,
      busy: spawn.spawning !== null,
      taskMix,
    });
    if (body) {
      spawn.spawnCreep(body, `worker-${Game.time}`);
    }
  }
}

/** 各任务当前价值（带消耗速率） */
function taskValues(
  holders: ReadonlyMap<string, number>,
  rates: ReadonlyMap<string, number>,
): Map<string, number> {
  const values = new Map<string, number>();
  for (const t of Memory.tasks) {
    values.set(
      t.id,
      taskValue(t.action, holders.get(t.id) ?? 0, rates.get(t.id) ?? 0),
    );
  }
  return values;
}

/** creep：执行任务；idle 或周期边界再评估者进入分配池，一次分配 */
function runCreeps(
  holders: ReadonlyMap<string, number>,
  rates: ReadonlyMap<string, number>,
): void {
  const sourcesByRoom = new Map<string, Source[]>();
  for (const roomName in Game.rooms) {
    sourcesByRoom.set(roomName, Game.rooms[roomName].find(FIND_SOURCES));
  }
  const values = taskValues(holders, rates);

  const idle: IdleCreepInput[] = [];
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];

    // 矿工基础设施：固定行为，不参与任务分配
    if (creep.memory.isMiner) {
      runMiner(creep);
      continue;
    }

    let task: Task | undefined = creep.memory.taskId
      ? Memory.tasks.find((t) => t.id === creep.memory.taskId)
      : undefined;

    if (task) {
      // 周期边界再评估（分配惰性修复）：能量耗尽时，当前任务价值（去除自己）
      // 低于其他任务最高价值 → 释放重新分配
      const currentValue = taskValue(
        task.action,
        (holders.get(task.id) ?? 0) - 1,
        rates.get(task.id) ?? 0,
      );
      let bestOtherValue = -Infinity;
      for (const [taskId, v] of values) {
        if (taskId !== task.id && v > bestOtherValue) bestOtherValue = v;
      }
      if (
        shouldResignTask(
          task,
          creep.store.getUsedCapacity(RESOURCE_ENERGY),
          currentValue,
          bestOtherValue,
        )
      ) {
        delete creep.memory.taskId;
        task = undefined;
      }
    }

    if (!task) {
      // 进入分配池（距离只对未分配者计算）
      const distByTaskId = new Map<string, number>();
      for (const t of Memory.tasks) {
        const d = combinedDistance(creep, t, sourcesByRoom);
        if (Number.isFinite(d)) distByTaskId.set(t.id, d);
      }
      idle.push({
        name,
        body: creep.body.map((p) => p.type),
        distByTaskId,
      });
      continue;
    }

    // 固定目标任务失效（工地建成等）→ 回收任务
    const target = Game.getObjectById<RoomObject & _HasId>(task.targetId);
    if (!target) {
      Memory.tasks = Memory.tasks.filter((t) => t.id !== task.id);
      delete creep.memory.taskId;
      idle.push({
        name,
        body: creep.body.map((p) => p.type),
        distByTaskId: new Map(),
      });
      continue;
    }

    EXECUTORS[task.action](creep, task);
  }

  // 分配：边际效用贪心（无硬编码容量）
  const allocation = allocate(idle, Memory.tasks, holders, rates);
  for (const [creepName, taskId] of allocation) {
    const creep = Game.creeps[creepName];
    creep.memory.taskId = taskId;
    // 本 tick 已分配：立即执行一轮（避免多等一 tick）
    const task = Memory.tasks.find((t) => t.id === taskId);
    if (task) EXECUTORS[task.action](creep, task);
  }
}

/** 清理已死亡 creep 的 memory 残留 */
function cleanMemory(): void {
  for (const name in Memory.creeps) {
    if (!Game.creeps[name]) delete Memory.creeps[name];
  }
}

export function loop(): void {
  ensureMemory();
  // 声明 → 调度：需求黑板转化为任务黑板
  Memory.tasks = reconcile(Memory.tasks, declareDemands());
  const holders = holderCounts();
  const rates = rateByTaskId();
  runSpawns(holders);
  runCreeps(holders, rates);
  cleanMemory();
}
