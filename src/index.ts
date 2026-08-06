/**
 * 主循环：服务器每个 tick 调用一次。
 * 流程：发布任务 -> spawn 生产决策 -> creep 领取/执行任务 -> 清理。
 */
import {
  createTask,
  makeTaskId,
  findNearestOpenTask,
  isTaskClaimable,
  removeTask,
  shouldTransferToHarvest,
} from "./tasks";
import type { Task } from "./tasks";
import { runHarvest, runUpgrade, runBuild } from "./executors";
import { decideSpawn, MAX_CREEPS } from "./spawn";

function ensureMemory(): void {
  if (!Memory.tasks) Memory.tasks = [];
}

/** 统计各任务的当前持有者数（从存活 creep 实时统计，死亡自动不计） */
function holderCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const name in Game.creeps) {
    const taskId = Game.creeps[name].memory.taskId;
    if (taskId) counts.set(taskId, (counts.get(taskId) ?? 0) + 1);
  }
  return counts;
}

/** 可领取的任务列表（持有者数未达容量的任务） */
function claimableTasks(): Task[] {
  const holders = holderCounts();
  return Memory.tasks.filter((t) => isTaskClaimable(t, holders));
}

/** 指定房间是否存在可领取的 harvest 任务 */
function harvestClaimableIn(roomName: string): boolean {
  return claimableTasks().some(
    (t) => t.type === "harvest" && t.roomName === roomName,
  );
}

/**
 * 发布/回收任务（幂等）：
 * - harvest 无固定目标，存在性由房间能量缺口驱动（不足发布、满则回收）；
 *   容量 = source 数（每 source 约 1 个采集者，产能低于再生速率）
 * - upgrade 容量 = MAX_CREEPS（多 creep 升级无冲突，兜底任务）
 * - build 每工地一个任务，容量 1
 */
function publishTasks(): void {
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];

    const harvestId = makeTaskId("harvest", roomName);
    const harvestTask = Memory.tasks.find((t) => t.id === harvestId);
    if (room.energyAvailable < room.energyCapacityAvailable) {
      if (!harvestTask) {
        Memory.tasks.push(
          createTask("harvest", roomName, room.find(FIND_SOURCES).length),
        );
      }
    } else if (harvestTask) {
      // 能量已满：回收采集任务，采集者自动转 upgrade/build
      Memory.tasks = removeTask(Memory.tasks, harvestId);
    }

    for (const site of room.find(FIND_CONSTRUCTION_SITES)) {
      const id = makeTaskId("build", site.id);
      if (!Memory.tasks.some((t) => t.id === id)) {
        Memory.tasks.push(createTask("build", roomName, site.id, 1));
      }
    }

    // upgrade 兜底任务：保证无人空闲
    if (room.controller?.my) {
      const id = makeTaskId("upgrade", room.controller.id);
      if (!Memory.tasks.some((t) => t.id === id)) {
        Memory.tasks.push(
          createTask("upgrade", roomName, room.controller.id, MAX_CREEPS),
        );
      }
    }
  }
}

/** spawn：按任务量与房间状态决定是否生产 */
function runSpawns(): void {
  const openTaskCount = claimableTasks().length;
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

/** creep：领取任务并执行；任务失效则移除 */
function runCreeps(): void {
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    let task: Task | undefined = creep.memory.taskId
      ? Memory.tasks.find((t) => t.id === creep.memory.taskId)
      : undefined;

    // 转岗：固定目标任务持有者能量耗尽且 harvest 可领时，转岗采集
    if (
      task &&
      shouldTransferToHarvest(
        task,
        creep.store.getUsedCapacity(RESOURCE_ENERGY),
        harvestClaimableIn(creep.room.name),
      )
    ) {
      delete creep.memory.taskId;
      task = undefined;
    }

    if (!task) {
      // 就近领取：可领取任务里选目标最近的（同一优先级内）
      const distByTaskId = new Map<string, number>();
      for (const t of claimableTasks()) {
        if (t.type === "harvest") {
          // 无固定目标：以该房间最近 source 的距离作为任务距离
          const sources = Game.rooms[t.roomName]?.find(FIND_SOURCES);
          if (sources && sources.length > 0) {
            distByTaskId.set(t.id, creep.pos.getRangeTo(sources[0].pos));
          }
        } else {
          const obj = Game.getObjectById<RoomObject & _HasId>(t.targetId);
          if (obj) distByTaskId.set(t.id, creep.pos.getRangeTo(obj.pos));
        }
      }
      const next = findNearestOpenTask(claimableTasks(), distByTaskId);
      if (next) {
        creep.memory.taskId = next.id;
        task = next;
      }
    }

    if (!task) continue;

    // 固定目标任务失效（site 建成等）→ 移除任务重新领取
    if (task.type !== "harvest") {
      const target = Game.getObjectById<RoomObject & _HasId>(task.targetId);
      if (!target) {
        Memory.tasks = removeTask(Memory.tasks, task.id);
        delete creep.memory.taskId;
        continue;
      }
    }

    switch (task.type) {
      case "harvest":
        runHarvest(creep);
        break;
      case "build":
        runBuild(creep, task);
        break;
      case "upgrade":
        runUpgrade(creep, task);
        break;
    }
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
