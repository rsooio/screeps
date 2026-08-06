/**
 * 矿工部署参数扫描实验（第二轮）：minWorkers × t300，多时间点指标。
 * 运行：node scripts/param-sweep.ts（需先 npm run build）
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ScreepsServer } from "screeps-server-mockup";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mainJs = readFileSync(join(root, "dist/main.js"), "utf8");

const TICKS = 600;
const MARKS = [200, 400, 600];

interface Params {
  minWorkers: number;
  energyThreshold: number;
}

interface CaseResult {
  creeps: number;
  miners: number;
  spawnE: number;
  ctrlPByTick: Map<number, number>;
}

async function runCase(params: Params | null): Promise<CaseResult> {
  const server = new ScreepsServer();
  await server.world.reset();
  await server.world.stubWorld();
  const inject = params
    ? `global.__MINER_PARAMS = ${JSON.stringify(params)};`
    : `global.__MINER_PARAMS = { minWorkers: 999, energyThreshold: 0 };`;
  const bot = await server.world.addBot({
    username: "bot",
    room: "W0N1",
    x: 25,
    y: 25,
    modules: { main: inject + mainJs },
  });
  await server.start();
  const ctrlPByTick = new Map<number, number>();
  for (let i = 0; i < TICKS; i++) {
    await server.tick();
    if (MARKS.includes(i + 1)) {
      const objs = (await server.world.roomObjects("W0N1")) as {
        type: string;
        progress?: number;
      }[];
      const ctrl = objs.find((o) => o.type === "controller");
      ctrlPByTick.set(i + 1, ctrl?.progress ?? 0);
    }
  }
  const memory = JSON.parse((await bot.memory) as unknown as string) as {
    creeps: Record<string, { isMiner?: boolean }>;
  };
  const objs = (await server.world.roomObjects("W0N1")) as {
    type: string;
    store?: { energy?: number };
  }[];
  const spawn = objs.find((o) => o.type === "spawn");
  const miners = Object.values(memory.creeps).filter((m) => m.isMiner).length;
  server.stop();
  return {
    creeps: Object.keys(memory.creeps).length,
    miners,
    spawnE: spawn?.store?.energy ?? 0,
    ctrlPByTick,
  };
}

const cases: { name: string; params: Params | null }[] = [
  { name: "基线(无矿工)", params: null },
  { name: "w0/t300", params: { minWorkers: 0, energyThreshold: 300 } },
  { name: "w1/t300", params: { minWorkers: 1, energyThreshold: 300 } },
  { name: "w2/t300", params: { minWorkers: 2, energyThreshold: 300 } },
  { name: "w3/t300", params: { minWorkers: 3, energyThreshold: 300 } },
];

console.log(
  `矿工部署参数扫描（${TICKS} tick/组）：ctrlP@200/@400/@600（升级速率曲线）`,
);
console.log(
  "case        | creeps | miners | spawnE | ctrlP@200 | ctrlP@400 | ctrlP@600",
);
console.log("-".repeat(78));
for (const c of cases) {
  const r = await runCase(c.params);
  console.log(
    `${c.name.padEnd(11)} | ${String(r.creeps).padStart(5)} | ${String(r.miners).padStart(5)} | ${String(r.spawnE).padStart(5)} | ${String(r.ctrlPByTick.get(200) ?? 0).padStart(8)} | ${String(r.ctrlPByTick.get(400) ?? 0).padStart(8)} | ${String(r.ctrlPByTick.get(600) ?? 0).padStart(8)}`,
  );
}
// mockup 的 storage 无法正常关闭，需显式退出
process.exit(0);
