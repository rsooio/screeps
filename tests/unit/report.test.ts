import { describe, it, expect } from "vitest";
import { renderReport, writeReport } from "../integration/report";
import type { Sample } from "../integration/recorder";

const mkSample = (tick: number): Sample => ({
  tick,
  creeps: 3,
  deliver: 2,
  upgrade: 1,
  build: 0,
  idle: 0,
  spawnEnergy: 150,
  spawning: false,
  controllerProgress: tick * 2,
  controllerLevel: 1,
  sourceEnergy: 2000,
  deliverTasks: 1,
  upgradeTasks: 1,
  buildTasks: 0,
});

describe("report 生成器", () => {
  it("输出含 Chart.js CDN、canvas 与采样数据", () => {
    const samples = [mkSample(20), mkSample(40), mkSample(60)];
    const html = renderReport(samples, { title: "测试报告", durationMs: 1000 });
    expect(html).toContain("cdn.jsdelivr.net/npm/chart.js");
    expect(html).toContain("chart-workforce");
    expect(html).toContain("chart-controller");
    expect(html).toContain("const DATA =");
    expect(html).toContain('"tick":20');
    expect(html).toContain("creeps（终态）");
  });

  it("每个采样点都进入曲线数据", () => {
    const samples = Array.from({ length: 10 }, (_, i) =>
      mkSample((i + 1) * 20),
    );
    const html = renderReport(samples, { title: "t", durationMs: 0 });
    for (const s of samples) {
      expect(html).toContain(`"tick":${s.tick}`);
    }
  });

  it("空采样也能生成（无数据报告）", () => {
    const html = renderReport([], { title: "空", durationMs: 0 });
    expect(html).toContain("canvas");
  });
});

describe("writeReport（时间戳目录留档）", () => {
  it("输出到时间戳子目录，HTML 与 JSON 并存", () => {
    const { mkdtempSync, rmSync } = require("node:fs") as typeof import("node:fs");
    const { tmpdir } = require("node:os") as typeof import("node:os");
    const { join } = require("node:path") as typeof import("node:path");
    const base = mkdtempSync(join(tmpdir(), "screeps-report-"));
    try {
      const html = writeReport([mkSample(20)], { title: "t", durationMs: 1 }, base);
      // 时间戳子目录：YYYYMMDD-HHmmss
      expect(html).toMatch(/\d{8}-\d{6}\/integration\.html$/);
      const { existsSync } = require("node:fs") as typeof import("node:fs");
      expect(existsSync(html)).toBe(true);
      expect(existsSync(html.replace(/\.html$/, ".json"))).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
