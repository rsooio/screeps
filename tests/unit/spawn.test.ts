import { describe, it, expect } from "vitest";
import {
  decideSpawn,
  bodyForEnergy,
  bodyCost,
  MAX_CREEPS,
} from "../../src/spawn";

const base = { energy: 300, creepCount: 2, openTaskCount: 2, busy: false };

describe("decideSpawn", () => {
  it("spawn 忙碌时不生产", () => {
    expect(decideSpawn({ ...base, busy: true })).toBeUndefined();
  });

  it("达到 creep 上限不生产", () => {
    expect(decideSpawn({ ...base, creepCount: MAX_CREEPS })).toBeUndefined();
  });

  it("房间无 creep 时即使无任务也生产（保底开工）", () => {
    const body = decideSpawn({ ...base, creepCount: 0, openTaskCount: 0 });
    expect(body).toBeDefined();
  });

  it("有 open 任务时生产", () => {
    expect(decideSpawn(base)).toBeDefined();
  });

  it("有 creep 且无 open 任务时不生产", () => {
    expect(decideSpawn({ ...base, openTaskCount: 0 })).toBeUndefined();
  });

  it("能量不足最小 body 时不生产", () => {
    expect(
      decideSpawn({ ...base, energy: 100, creepCount: 0 }),
    ).toBeUndefined();
  });
});

describe("bodyForEnergy", () => {
  it("200 能量给最小 body", () => {
    const body = bodyForEnergy(200);
    expect(body).toEqual([WORK, CARRY, MOVE]);
    expect(bodyCost(body!)).toBe(200);
  });

  it("300 能量给第二档", () => {
    const body = bodyForEnergy(300);
    expect(bodyCost(body!)).toBe(300);
  });

  it("500 能量给最高档", () => {
    const body = bodyForEnergy(500);
    expect(bodyCost(body!)).toBe(500);
  });

  it("不足 200 返回 undefined", () => {
    expect(bodyForEnergy(150)).toBeUndefined();
  });
});
