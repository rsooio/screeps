/**
 * 主循环：服务器每个 tick 调用一次。
 * 流程：发布任务 -> spawn 生产决策 -> creep 领取/执行任务 -> 清理。
 */
import {
  createTask,
  makeTaskId,
  claimTask,
  findOpenTask,
  removeTask,
  removeDeadClaims,
} from "./tasks";
import type { Task } from "./tasks";
import { EXECUTORS } from "./executors";
import { decideSpawn } from "./spawn";

function ensureMemory(): void {
  if (!Memory.tasks) Memory.tasks = [];
}

/** 发布任务（幂等：同类型同目标不重复创建） */
function publishTasks(): void {
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    for (const source of room.find(FIND_SOURCES)) {
      const id = makeTaskId("harvest", source.id);
      if (!Memory.tasks.some((t) => t.id === id)) {
        Memory.tasks.push(createTask("harvest", source.id));
      }
    }
    for (const site of room.find(FIND_CONSTRUCTION_SITES)) {
      const id = makeTaskId("build", site.id);
      if (!Memory.tasks.some((t) => t.id === id)) {
        Memory.tasks.push(createTask("build", site.id));
      }
    }
    // upgrade 兜底任务：保证无人空闲
    if (room.controller?.my) {
      const id = makeTaskId("upgrade", room.controller.id);
      if (!Memory.tasks.some((t) => t.id === id)) {
        Memory.tasks.push(createTask("upgrade", room.controller.id));
      }
    }
  }
}

/** spawn：按任务量与房间状态决定是否生产 */
function runSpawns(): void {
  for (const name in Game.spawns) {
    const spawn = Game.spawns[name];
    const openTaskCount = Memory.tasks.filter((t) => !t.claimedBy).length;
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

/** creep：领取任务并执行；任务失效则移除 */
function runCreeps(): void {
  const alive = new Set(Object.keys(Game.creeps));
  Memory.tasks = removeDeadClaims(Memory.tasks, alive);

  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    let task: Task | undefined = creep.memory.taskId
      ? Memory.tasks.find((t) => t.id === creep.memory.taskId)
      : undefined;
    // 任务被释放/转手后不再持有
    if (task && task.claimedBy !== name) task = undefined;

    if (!task) {
      const next = findOpenTask(Memory.tasks);
      if (next) {
        Memory.tasks = claimTask(Memory.tasks, next.id, name);
        creep.memory.taskId = next.id;
        task = next;
      } else {
        delete creep.memory.taskId;
      }
    }

    if (!task) continue;

    // 目标失效（source 消失、site 建成等）→ 移除任务重新领取
    const target = Game.getObjectById(task.targetId as Id<_HasId>);
    if (!target) {
      Memory.tasks = removeTask(Memory.tasks, task.id);
      delete creep.memory.taskId;
      continue;
    }

    EXECUTORS[task.type](creep, task);
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
  publishTasks();
  runSpawns();
  runCreeps();
  cleanMemory();
}
