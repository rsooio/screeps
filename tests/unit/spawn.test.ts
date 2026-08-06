import { describe, it, expect } from "vitest";
import {
  decideSpawn,
  bodyForDemand,
  bodyCost,
  minerDeployable,
  MINER_BODY,
  MAX_CREEPS,
} from "../../src/spawn";

const base = {
  energy: 300,
  creepCount: 2,
  openTaskCount: 2,
  busy: false,
  taskMix: { carry: 2, work: 0 },
};

describe("decideSpawn", () => {
  it("spawn 忙碌时不生产", () => {
    expect(decideSpawn({ ...base, busy: true })).toBeUndefined();
  });

  it("达到 creep 上限不生产", () => {
    expect(decideSpawn({ ...base, creepCount: MAX_CREEPS })).toBeUndefined();
  });

  it("房间无 creep 时即使无任务也生产（保底开工）", () => {
    const body = decideSpawn({
      ...base,
      creepCount: 0,
      openTaskCount: 0,
      taskMix: { carry: 0, work: 0 },
    });
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
      decideSpawn({
        ...base,
        energy: 100,
        creepCount: 0,
        taskMix: { carry: 0, work: 0 },
      }),
    ).toBeUndefined();
  });
});

describe("bodyForDemand（能力定制）", () => {
  it("运输需求多时用 CARRY 档（CARRY 数量多于工作档）", () => {
    const body = bodyForDemand(300, { carry: 2, work: 0 });
    expect(body).toBeDefined();
    const carryCount = body!.filter((p) => p === CARRY).length;
    const workCount = body!.filter((p) => p === WORK).length;
    expect(carryCount).toBeGreaterThan(workCount);
  });

  it("工作需求多时用 WORK 档（WORK 数量多）", () => {
    const body = bodyForDemand(300, { carry: 0, work: 2 });
    expect(body).toBeDefined();
    const carryCount = body!.filter((p) => p === CARRY).length;
    const workCount = body!.filter((p) => p === WORK).length;
    expect(workCount).toBeGreaterThanOrEqual(carryCount);
  });

  it("200 能量给最低档", () => {
    const body = bodyForDemand(200, { carry: 0, work: 1 });
    expect(bodyCost(body!)).toBe(200);
  });

  it("500 能量给最高档", () => {
    const body = bodyForDemand(500, { carry: 0, work: 5 });
    expect(bodyCost(body!)).toBe(500);
  });

  it("不足最低档返回 undefined", () => {
    expect(bodyForDemand(150, { carry: 0, work: 1 })).toBeUndefined();
    expect(bodyForDemand(200, { carry: 1, work: 0 })).toBeUndefined(); // 运输档最低 250
  });
});

describe("minerDeployable（矿工投资门槛）", () => {
  const base = {
    energy: 300,
    workerCount: 1,
    minerCount: 0,
    sourceCount: 2,
    busy: false,
  };

  it("默认参数（w1/t300）：能量满、有基础劳动力且矿工缺位时部署", () => {
    expect(minerDeployable(base)).toBe(true);
  });

  it("无基础劳动力（workerCount < minWorkers）不部署（保底不被挤）", () => {
    expect(minerDeployable({ ...base, workerCount: 0 })).toBe(false);
  });

  it("能量储备不足（<300）不部署", () => {
    expect(minerDeployable({ ...base, energy: 250 })).toBe(false);
  });

  it("矿工已满编（每 source 一个）不部署", () => {
    expect(minerDeployable({ ...base, minerCount: 2 })).toBe(false);
  });

  it("spawn 忙碌不部署", () => {
    expect(minerDeployable({ ...base, busy: true })).toBe(false);
  });

  it("注入参数可覆盖默认门槛", () => {
    globalThis.__MINER_PARAMS = { minWorkers: 3, energyThreshold: 300 };
    try {
      expect(minerDeployable({ ...base, workerCount: 2 })).toBe(false);
      expect(minerDeployable({ ...base, workerCount: 3 })).toBe(true);
    } finally {
      delete globalThis.__MINER_PARAMS;
    }
  });

  it("矿工 body 无 CARRY（能量自动掉落）", () => {
    expect(MINER_BODY.includes(CARRY)).toBe(false);
    expect(MINER_BODY.includes(WORK)).toBe(true);
  });
});
