import { describe, it, expect } from "vitest";
import {
  allocate,
  crowdingCost,
  hasCapability,
  nextWorkingState,
  structureRate,
  taskValue,
  reconcile,
  shouldSwitchToDeliver,
  taskUtility,
  ACTION_REQUIREMENTS,
} from "../../src/tasks";
import type { Action, Demand, Task } from "../../src/tasks";

const demand = (
  action: Action,
  targetId: string,
  roomName = "W0N1",
): Demand => ({
  action,
  targetId,
  roomName,
});

describe("动作 → 能力映射完整性", () => {
  it("每个动作都有能力要求（TS 编译期保证，此处验证语义）", () => {
    expect(ACTION_REQUIREMENTS.deliver.capability).toEqual([WORK, CARRY]);
    expect(ACTION_REQUIREMENTS.build.capability).toEqual([WORK, CARRY]);
    expect(ACTION_REQUIREMENTS.upgrade.capability).toEqual([WORK, CARRY]);
  });

  it("执行者 body 能力匹配", () => {
    expect(hasCapability([WORK, CARRY, MOVE], [WORK, CARRY])).toBe(true);
    expect(hasCapability([WORK, MOVE], [WORK, CARRY])).toBe(false);
    expect(hasCapability([], [WORK])).toBe(false);
  });
});

describe("reconcile（需求 ↔ 任务差分调度）", () => {
  it("新需求发布对应任务", () => {
    const tasks = reconcile([], [demand("deliver", "S1")]);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      action: "deliver",
      targetId: "S1",
      roomName: "W0N1",
    });
    expect(tasks[0].id).toBe("deliver:S1");
  });

  it("需求消失时回收任务", () => {
    const tasks: Task[] = [
      { id: "deliver:S1", action: "deliver", targetId: "S1", roomName: "W0N1" },
      { id: "upgrade:C1", action: "upgrade", targetId: "C1", roomName: "W0N1" },
    ];
    const next = reconcile(tasks, [demand("upgrade", "C1")]);
    expect(next.map((t) => t.id)).toEqual(["upgrade:C1"]);
  });

  it("幂等：重复声明不重复发布", () => {
    const tasks = reconcile([], [demand("deliver", "S1")]);
    const again = reconcile(tasks, [
      demand("deliver", "S1"),
      demand("upgrade", "C1"),
    ]);
    expect(again.filter((t) => t.id === "deliver:S1")).toHaveLength(1);
  });

  it("需求顺序不影响结果", () => {
    const a = reconcile([], [demand("upgrade", "C1"), demand("deliver", "S1")]);
    const b = reconcile([], [demand("deliver", "S1"), demand("upgrade", "C1")]);
    expect(a.map((t) => t.id).sort()).toEqual(b.map((t) => t.id).sort());
  });
});

describe("效用函数（控制律）", () => {
  it("基础优先级 deliver > build > upgrade", () => {
    expect(taskValue("deliver", 0)).toBeGreaterThan(taskValue("build", 0));
    expect(taskValue("build", 0)).toBeGreaterThan(taskValue("upgrade", 0));
  });

  it("拥挤惩罚：deliver 陡峭，upgrade 平缓", () => {
    // 第 1 个执行者后 deliver 惩罚远高于 upgrade
    expect(crowdingCost("deliver", 1)).toBeGreaterThan(
      crowdingCost("upgrade", 1) * 5,
    );
  });

  it("边际效用递减，deliver 自然饱和", () => {
    // deliver: 100 - 25n，第 5 个执行者边际效用为负
    expect(taskValue("deliver", 3)).toBeGreaterThan(0);
    expect(taskValue("deliver", 4)).toBe(0);
    expect(taskValue("deliver", 5)).toBeLessThan(0);
  });

  it("upgrade 兜底：上限内始终为正（吸收剩余产能）", () => {
    for (let n = 0; n <= 6; n++) {
      expect(taskValue("upgrade", n)).toBeGreaterThan(0);
    }
  });

  it("距离成本线性递减效用", () => {
    expect(taskUtility("deliver", 1, 0)).toBeGreaterThan(
      taskUtility("deliver", 10, 0),
    );
  });
});

describe("allocate（边际效用贪心分配）", () => {
  const creep = (name: string, dist: Record<string, number>) => ({
    name,
    body: [WORK, CARRY, MOVE],
    distByTaskId: new Map(Object.entries(dist)),
  });
  const task = (action: Action, targetId: string): Task => ({
    id: `${action}:${targetId}`,
    action,
    targetId,
    roomName: "W0N1",
  });

  it("把 idle creep 分配给效用最高的任务", () => {
    const tasks = [task("deliver", "S1"), task("upgrade", "C1")];
    const result = allocate(
      [creep("a", { "deliver:S1": 3, "upgrade:C1": 5 })],
      tasks,
      new Map(),
    );
    expect(result.get("a")).toBe("deliver:S1");
  });

  it("拥挤惩罚驱动分流：deliver 饱和后新执行者流向 upgrade", () => {
    const tasks = [task("deliver", "S1"), task("upgrade", "C1")];
    // deliver 已有 3 个执行者（第 4 人边际效用 100-75-距离 4 = 21），
    // upgrade 距离近（30-2=28）→ 新 creep 选择 upgrade
    const a = creep("a", { "deliver:S1": 2, "upgrade:C1": 1 });
    const result = allocate([a], tasks, new Map([["deliver:S1", 3]]));
    expect(result.get("a")).toBe("upgrade:C1");
  });

  it("缺口大时多个执行者合理聚集（拥挤惩罚温和递增）", () => {
    const tasks = [task("deliver", "S1")];
    const a = creep("a", { "deliver:S1": 1 });
    const b = creep("b", { "deliver:S1": 1 });
    // 第 1 人 98，第 2 人 73：都为正，都分配（缺口需要多人填）
    const result = allocate([a, b], tasks, new Map());
    expect(result.size).toBe(2);
  });

  it("距离影响选择：近的任务优先", () => {
    const tasks = [task("deliver", "S1"), task("deliver", "S2")];
    const result = allocate(
      [creep("a", { "deliver:S1": 20, "deliver:S2": 2 })],
      tasks,
      new Map(),
    );
    expect(result.get("a")).toBe("deliver:S2");
  });

  it("能力不足的 creep 不能领取任务", () => {
    const tasks = [task("deliver", "S1")];
    const noCarry = {
      name: "weak",
      body: [MOVE],
      distByTaskId: new Map([["deliver:S1", 1]]),
    };
    expect(allocate([noCarry], tasks, new Map()).size).toBe(0);
  });

  it("距离远但价值为正的兜底任务仍分配（无人空闲）", () => {
    const tasks = [task("upgrade", "C1")];
    // upgrade 价值 30 > 0，即使距离 20 格（效用 30-40=-10）也应分配
    const result = allocate(
      [creep("a", { "upgrade:C1": 20 })],
      tasks,
      new Map(),
    );
    expect(result.get("a")).toBe("upgrade:C1");
  });

  it("距离只影响选择排序：deliver 价值低但距离近时仍可选", () => {
    const tasks = [task("deliver", "S1"), task("upgrade", "C1")];
    // deliver 已有 4 人（价值 0），upgrade 距离 25（效用 30-50=-20），deliver 距离 0（效用 0）
    // 两者都可分配（upgrade 价值 30>0），选效用高的 deliver
    const result = allocate(
      [creep("a", { "deliver:S1": 0, "upgrade:C1": 25 })],
      tasks,
      new Map([["deliver:S1", 4]]),
    );
    expect(result.get("a")).toBe("deliver:S1");
  });

  it("负效用不分配（拥挤过饱和后停止）", () => {
    const tasks = [task("deliver", "S1")];
    // 已有 5 个执行者：deliver 边际效用 = -25，分配无意义
    const result = allocate(
      [creep("a", { "deliver:S1": 0 })],
      tasks,
      new Map([["deliver:S1", 5]]),
    );
    expect(result.size).toBe(0);
  });

  it("升级任务可吸收大量执行者（无上限）", () => {
    const tasks = [task("upgrade", "C1")];
    const creeps = Array.from({ length: 6 }, (_, i) =>
      creep(`c${i}`, { "upgrade:C1": 1 }),
    );
    const result = allocate(creeps, tasks, new Map());
    expect(result.size).toBe(6);
  });
});

describe("shouldSwitchToDeliver（转岗）", () => {
  const upgradeTask: Task = {
    id: "upgrade:C1",
    action: "upgrade",
    targetId: "C1",
    roomName: "W0N1",
  };

  it("能量耗尽且 deliver 效用更高时转岗", () => {
    expect(shouldSwitchToDeliver(upgradeTask, 0, 75, 27)).toBe(true);
  });

  it("deliver 效用不高于当前任务时不转岗", () => {
    expect(shouldSwitchToDeliver(upgradeTask, 0, 20, 27)).toBe(false);
  });

  it("能量未耗尽不转岗", () => {
    expect(shouldSwitchToDeliver(upgradeTask, 10, 75, 27)).toBe(false);
  });

  it("deliver 执行者不转岗", () => {
    const deliverTask: Task = {
      id: "deliver:S1",
      action: "deliver",
      targetId: "S1",
      roomName: "W0N1",
    };
    expect(shouldSwitchToDeliver(deliverTask, 0, 75, 27)).toBe(false);
  });

  it("无任务不转岗", () => {
    expect(shouldSwitchToDeliver(undefined, 0, 75, 27)).toBe(false);
  });
});

describe("structureRate（消耗速率声明）", () => {
  const base = {
    spawning: false,
    energy: 100,
    capacity: 300,
    bodyCost: 300,
    spawnTime: 18,
    prepRate: 10,
  };

  it("满能量时无需求（rate=0）", () => {
    expect(structureRate({ ...base, energy: 300 })).toBe(0);
  });

  it("空闲未满时按备产速率", () => {
    expect(structureRate({ ...base })).toBe(10);
  });

  it("生产中按生产消耗均摊速率", () => {
    expect(structureRate({ ...base, spawning: true })).toBeCloseTo(300 / 18);
  });
});

describe("消耗速率加权效用", () => {
  it("rate 越高 deliver 价值越高（需求强度）", () => {
    expect(taskValue("deliver", 0, 20)).toBeGreaterThan(
      taskValue("deliver", 0, 0),
    );
  });

  it("rate 只影响 deliver，不影响其他动作", () => {
    expect(taskValue("upgrade", 0, 100)).toBe(taskValue("upgrade", 0, 0));
  });

  it("生产中 spawn 可容忍更多执行者（rate 抬高饱和点）", () => {
    // 生产速率 16.7：价值 100+33-25×4 = 33 > 0，第 5 人仍可分配
    expect(taskValue("deliver", 4, 16.7)).toBeGreaterThan(0);
    // 无消耗（rate=0）：第 5 人价值为负
    expect(taskValue("deliver", 4, 0)).toBeLessThanOrEqual(0);
  });
});

describe("nextWorkingState（滞回控制）", () => {
  it("初始状态进入采集", () => {
    expect(nextWorkingState(undefined, 0, 50)).toBe(false);
  });

  it("采集中未满载保持采集", () => {
    expect(nextWorkingState(false, 10, 40)).toBe(false);
  });

  it("采集中满载转工作", () => {
    expect(nextWorkingState(false, 50, 0)).toBe(true);
  });

  it("工作中未耗尽保持工作（修复单动作消耗振荡的关键）", () => {
    // 升级一次消耗 2 能量后（48/2），不再返回采集
    expect(nextWorkingState(true, 48, 2)).toBe(true);
  });

  it("工作中耗尽转采集", () => {
    expect(nextWorkingState(true, 0, 50)).toBe(false);
  });
});
