/**
 * 集成测试数据记录器：每 SAMPLE_EVERY tick 采样一次房间状态，
 * 生成时间序列数据，供报告生成器绘制曲线（用于跟踪系统行为）。
 */
import type { ScreepsServer, Bot } from "screeps-server-mockup";

export const SAMPLE_EVERY = 20;

export interface Sample {
  tick: number;
  creeps: number;
  deliver: number;
  upgrade: number;
  build: number;
  idle: number;
  spawnEnergy: number;
  spawning: boolean;
  controllerProgress: number;
  controllerLevel: number;
  sourceEnergy: number;
  deliverTasks: number;
  upgradeTasks: number;
  buildTasks: number;
}

interface RoomObject {
  type: string;
  store?: { energy?: number };
  progress?: number;
  level?: number;
  energy?: number;
  [key: string]: unknown;
}

/** 采样一次房间状态（tick 结束后调用，memory 与房间对象状态一致） */
export async function sampleState(
  server: ScreepsServer,
  bot: Bot,
  roomName: string,
): Promise<Sample> {
  const memory = JSON.parse((await bot.memory) as unknown as string) as {
    creeps: Record<string, { taskId?: string }>;
    tasks: { action: string }[];
  };
  const objects = (await server.world.roomObjects(roomName)) as RoomObject[];

  const counts = { deliver: 0, upgrade: 0, build: 0, idle: 0 };
  for (const m of Object.values(memory.creeps)) {
    const action = m.taskId?.split(":")[0];
    if (action === "deliver" || action === "upgrade" || action === "build") {
      counts[action]++;
    } else {
      counts.idle++;
    }
  }

  const spawn = objects.find((o) => o.type === "spawn");
  const controller = objects.find((o) => o.type === "controller");
  const sources = objects.filter((o) => o.type === "source");
  const sourceEnergy =
    sources.length > 0
      ? sources.reduce((sum, s) => sum + (s.energy ?? 0), 0) / sources.length
      : 0;

  return {
    tick: await server.world.gameTime,
    creeps: Object.keys(memory.creeps).length,
    ...counts,
    spawnEnergy: spawn?.store?.energy ?? 0,
    spawning: !!spawn?.spawning,
    controllerProgress: controller?.progress ?? 0,
    controllerLevel: controller?.level ?? 1,
    sourceEnergy,
    deliverTasks: memory.tasks.filter((t) => t.action === "deliver").length,
    upgradeTasks: memory.tasks.filter((t) => t.action === "upgrade").length,
    buildTasks: memory.tasks.filter((t) => t.action === "build").length,
  };
}
