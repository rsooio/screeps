import { vi } from "vitest";

/**
 * 单元测试运行在 Node 环境，stub 掉 src/ 模块引用的 Screeps 全局常量。
 * 集成测试在 mockup 引擎内运行，不受影响。
 */
vi.stubGlobal("WORK", "work");
vi.stubGlobal("CARRY", "carry");
vi.stubGlobal("MOVE", "move");
vi.stubGlobal("BODYPART_COST", {
  work: 100,
  carry: 50,
  move: 50,
} as Partial<Record<BodyPartConstant, number>>);
