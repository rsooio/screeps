/**
 * 主循环：服务器每个 tick 调用一次。
 * 控制回路（docs/architecture.md）：感知 → 声明 → 调度 → 分配 → 执行 → 反馈。
 */
import { allocate, taskValue, reconcile, shouldSwitchToDeliver } from "./tasks";
import type { IdleCreepInput, Task } from "./tasks";
import { declareDemands, rateOfSpawn, PREP_RATE } from "./declare";
import { EXECUTORS } from "./executors";
import { decideSpawn } from "./spawn";

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

function runSpawns(holders: ReadonlyMap<string, number>): void {
  const rates = rateByTaskId();
  const openTaskCount = Memory.tasks.filter(
    (t) =>
      taskValue(t.action, holders.get(t.id) ?? 0, rates.get(t.id) ?? 0) > 0,
  ).length;
  for (const name in Game.spawns) {
    const spawn = Game.spawns[name];
    const body = decideSpawn({
      energy: spawn.store.getUsedCapacity(RESOURCE_ENERGY),
      creepCount: Object.keys(Game.creeps).length,
      openTaskCount,
      busy: spawn.spawning !== null,
    });
    if (body) {
      // 同一 tick 只生产一个（spawning 占用 spawn）
      spawn.spawnCreep(body, `worker-${Game.time}`);
    }
  }
}

/** creep：执行任务；idle 或应转岗者进入分配池，一次分配 */
function runCreeps(
  holders: ReadonlyMap<string, number>,
  rates: ReadonlyMap<string, number>,
): void {
  const sourcesByRoom = new Map<string, Source[]>();
  for (const roomName in Game.rooms) {
    sourcesByRoom.set(roomName, Game.rooms[roomName].find(FIND_SOURCES));
  }

  const idle: IdleCreepInput[] = [];
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    let task: Task | undefined = creep.memory.taskId
      ? Memory.tasks.find((t) => t.id === creep.memory.taskId)
      : undefined;

    if (task && task.action !== "deliver") {
      // 转岗判断：能量耗尽且 deliver 边际效用高于当前任务（去除自己后）
      const deliverTask = Memory.tasks.find((t) => t.action === "deliver");
      const deliverMarginal = deliverTask
        ? taskValue(
            "deliver",
            holders.get(deliverTask.id) ?? 0,
            rates.get(deliverTask.id) ?? 0,
          )
        : -Infinity;
      const currentMarginal = taskValue(
        task.action,
        (holders.get(task.id) ?? 0) - 1,
      );
      if (
        shouldSwitchToDeliver(
          task,
          creep.store.getUsedCapacity(RESOURCE_ENERGY),
          deliverMarginal,
          currentMarginal,
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
