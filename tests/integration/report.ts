/**
 * 测试报告生成器：采样数据 → 自包含 HTML 报告（Chart.js 走 CDN，
 * 曲线 hover 显示数值，用于跟踪系统行为）。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Sample } from "./recorder";

export interface ReportMeta {
  title: string;
  durationMs: number;
}

const CHART_JS_CDN =
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.9/dist/chart.umd.min.js";

function lineChart(
  id: string,
  label: string,
  samples: readonly Sample[],
  keys: readonly (keyof Sample)[],
  yLabel: string,
): string {
  return `
  <div class="card">
    <h3>${label}</h3>
    <canvas id="${id}"></canvas>
  </div>
  <script>
    new Chart(document.getElementById("${id}"), {
      type: "line",
      data: {
        labels: DATA.map(s => s.tick),
        datasets: ${JSON.stringify(
          keys.map((k, i) => ({
            label: String(k),
            data: samples.map((s) => s[k]),
            borderColor: COLORS[i % COLORS.length],
            tension: 0.2,
            pointRadius: 1.5,
          })),
        )}
      },
      options: {
        plugins: { title: { display: false } },
        scales: { x: { title: { display: true, text: "tick" } }, y: { title: { display: true, text: "${yLabel}" } } }
      }
    });
  </script>`;
}

const COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
];

/** 生成报告 HTML（Chart.js 走 CDN，需联网打开） */
export function renderReport(
  samples: readonly Sample[],
  meta: ReportMeta,
): string {
  const last = samples[samples.length - 1];
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>${meta.title}</title>
<script src="${CHART_JS_CDN}"></script>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; color: #1f2937; }
  h1 { font-size: 20px; }
  .meta { color: #6b7280; font-size: 13px; margin-bottom: 16px; }
  .summary { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 24px; }
  .stat { background: #f3f4f6; border-radius: 8px; padding: 10px 16px; }
  .stat b { font-size: 18px; display: block; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 16px; }
  .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
  .card h3 { margin: 0 0 8px; font-size: 14px; }
  canvas { max-height: 260px; }
</style>
</head>
<body>
<h1>${meta.title}</h1>
<div class="meta">生成时间 ${new Date().toLocaleString("zh-CN")} · 采样 ${samples.length} 点 · 每 ${samples.length > 1 ? Math.round(samples[1].tick - samples[0].tick) : "-"} tick · 测试耗时 ${(meta.durationMs / 1000).toFixed(1)}s</div>
<div class="summary">
  <div class="stat"><b>${last?.creeps ?? "-"}</b>creeps（终态）</div>
  <div class="stat"><b>${last?.controllerProgress ?? "-"}</b>controller progress</div>
  <div class="stat"><b>${last?.controllerLevel ?? "-"}</b>controller level</div>
  <div class="stat"><b>${last?.spawnEnergy ?? "-"}</b>spawn 能量</div>
  <div class="stat"><b>${last?.sourceEnergy ?? "-"}</b>source 平均能量</div>
</div>
<script>const COLORS = ${JSON.stringify(COLORS)};</script>
<script>const DATA = ${JSON.stringify(samples)};</script>
<div class="grid">
  ${lineChart("chart-workforce", "劳动力分布（执行者数）", samples, ["creeps", "deliver", "upgrade", "build", "idle"], "执行者数")}
  ${lineChart("chart-energy", "能量曲线（spawn / source）", samples, ["spawnEnergy", "sourceEnergy"], "能量")}
  ${lineChart("chart-controller", "控制器升级进度", samples, ["controllerProgress"], "progress")}
  ${lineChart("chart-tasks", "任务队列（各动作任务数）", samples, ["deliverTasks", "upgradeTasks", "buildTasks"], "任务数")}
</div>
</body>
</html>`;
}

/** 本地时间戳：YYYYMMDD-HHmmss（报告留档目录名） */
function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * 写入报告（HTML + JSON 数据）到 <baseDir>/<时间戳>/，返回 HTML 路径。
 * 时间戳目录留档：每次集成测试的历史报告可回溯对比。
 */
export function writeReport(
  samples: readonly Sample[],
  meta: ReportMeta,
  baseDir: string,
): string {
  const outDir = join(baseDir, timestamp());
  mkdirSync(outDir, { recursive: true });
  const base = join(outDir, "integration");
  writeFileSync(`${base}.html`, renderReport(samples, meta), "utf8");
  writeFileSync(
    `${base}.json`,
    JSON.stringify({ meta, samples }, null, 2),
    "utf8",
  );
  return `${base}.html`;
}
