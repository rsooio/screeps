import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");

const token = process.env.SCREEPS_TOKEN;
const branch = process.env.SCREEPS_BRANCH ?? "default";
const host = (process.env.SCREEPS_HOST ?? "https://screeps.com").replace(
  /\/+$/,
  "",
);
const dryRun = process.argv.includes("--dry-run");

if (!token) {
  console.error(
    "缺少 SCREEPS_TOKEN。请复制 .env.example 为 .env 并填写后重试。",
  );
  process.exit(1);
}

// 递归收集 dist/ 下的产物，模块名保持目录结构（sub/x.js -> "sub/x"）
async function collect(
  dir: string,
  prefix = "",
): Promise<Record<string, string>> {
  const modules: Record<string, string> = {};
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(modules, await collect(full, `${prefix}${entry.name}/`));
    } else if (entry.name.endsWith(".js")) {
      modules[`${prefix}${entry.name.replace(/\.js$/, "")}`] = await readFile(
        full,
        "utf8",
      );
    }
  }
  return modules;
}

const modules = await collect(distDir);
console.log(`分支 "${branch}"，共 ${Object.keys(modules).length} 个模块：`);
for (const [name, code] of Object.entries(modules)) {
  console.log(`  ${name}.js  (${code.length} bytes)`);
}

if (dryRun) {
  console.log("dry-run 模式：未执行上传");
  process.exit(0);
}

// 官方鉴权方式：X-Token header（docs.screeps.com/auth-tokens.html）
const res = await fetch(`${host}/api/user/code`, {
  method: "POST",
  headers: {
    "X-Token": token,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ branch, modules }),
});
const data = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`上传失败 (HTTP ${res.status})：`, data);
  process.exit(1);
}
console.log("上传成功：", data);
