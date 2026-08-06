import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ScreepsServer } from "screeps-server-mockup";
import { sampleState, SAMPLE_EVERY } from "./recorder";
import type { Sample } from "./recorder";
import { writeReport } from "./report";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ROOM = "W0N1";

interface RoomObject {
  type: string;
  store?: { energy?: number };
  progress?: number;
  user?: string;
  [key: string]: unknown;
}

describe("集成测试：任务系统在真实引擎中运行", () => {
  let server: ScreepsServer;
  let bot: Awaited<ReturnType<ScreepsServer["world"]["addBot"]>>;
  const consoleLogs: string[] = [];
  const samples: Sample[] = [];
  let testStart = 0;

  beforeAll(async () => {
    const mainPath = join(root, "dist/main.js");
    if (!existsSync(mainPath)) {
      throw new Error("dist/main.js 不存在，请先执行 npm run build");
    }
    const mainJs = readFileSync(mainPath, "utf8");

    server = new ScreepsServer();
    await server.world.reset();
    await server.world.stubWorld();
    bot = await server.world.addBot({
      username: "bot",
      room: ROOM,
      x: 25,
      y: 25,
      modules: { main: mainJs },
    });
    bot.on("console", (logs: string[]) => {
      for (const line of logs) consoleLogs.push(line);
    });
    await server.start();
    testStart = Date.now();

    // 自动采样：包装 tick，每 SAMPLE_EVERY tick 记录一次状态（供报告曲线）
    const origTick = server.tick.bind(server);
    let ticks = 0;
    server.tick = async () => {
      await origTick();
      ticks++;
      if (ticks % SAMPLE_EVERY === 0) {
        samples.push(await sampleState(server, bot, ROOM));
      }
    };
  });

  afterAll(() => {
    // 无论成败都生成报告（失败时用于诊断）
    const html = writeReport(
      samples,
      { title: "Screeps 集成测试报告", durationMs: Date.now() - testStart },
      join(root, "reports"),
    );
    console.log(`[report] ${html}`);
    server.stop();
  });

  it("房间控制器归属 bot（否则无法升级）", async () => {
    const objects = (await server.world.roomObjects(ROOM)) as RoomObject[];
    const controller = objects.find((o) => o.type === "controller");
    expect(controller).toBeDefined();
    // addBot 放置 spawn 后控制器应自动归属该用户
    expect(controller?.user).toBeDefined();
  });

  it("60 tick 内：发布任务、生产 creep、采集能量回填", async () => {
    for (let i = 0; i < 60; i++) {
      await server.tick();
    }

    // Memory 类型已全局声明（interface Memory 含 tasks），直接标注类型
    const memory: Memory = JSON.parse(await bot.memory);
    expect(Object.keys(memory.creeps).length).toBeGreaterThan(0);
    expect(memory.tasks.length).toBeGreaterThan(0);
    expect(
      Object.values(memory.creeps).some(
        (m) => (m as { taskId?: string }).taskId,
      ),
    ).toBe(true);

    const objects = (await server.world.roomObjects(ROOM)) as RoomObject[];
    const spawn = objects.find((o) => o.type === "spawn");
    expect(spawn?.store?.energy ?? 0).toBeGreaterThan(0);
  });

  it("700 tick 内：控制器升级进度增长（升级 creep 完成首个工作周期）", async () => {
    for (let i = 0; i < 700; i++) {
      await server.tick();
    }
    const objects = (await server.world.roomObjects(ROOM)) as RoomObject[];
    const controller = objects.find((o) => o.type === "controller");
    expect(controller?.progress ?? 0).toBeGreaterThan(0);
  });

  it("无脚本错误", () => {
    const errors = consoleLogs.filter(
      (l) =>
        l.includes("[error]") ||
        l.includes("Error") ||
        l.includes("Unknown module"),
    );
    expect(errors).toEqual([]);
  });
});
