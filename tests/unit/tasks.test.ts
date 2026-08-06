import { describe, it, expect } from "vitest";
import {
  createTask,
  removeTask,
  findNearestOpenTask,
  isTaskClaimable,
  shouldTransferToHarvest,
} from "../../src/tasks";
import type { Task } from "../../src/tasks";

describe("createTask", () => {
  it("同类型同关键标识 id 一致（幂等去重）", () => {
    expect(createTask("harvest", "W0N1", 2).id).toBe(
      createTask("harvest", "W0N1", 2).id,
    );
    expect(createTask("build", "W0N1", "B1", 1).id).toBe(
      createTask("build", "W0N1", "B1", 1).id,
    );
    expect(createTask("harvest", "W0N1", 2).id).not.toBe(
      createTask("build", "W0N1", "B1", 1).id,
    );
  });

  it("harvest 任务无固定目标（无 targetId）", () => {
    const task = createTask("harvest", "W0N1", 2);
    expect(task.type).toBe("harvest");
    expect("targetId" in task).toBe(false);
  });
});

describe("removeTask", () => {
  it("移除指定任务，其余保留", () => {
    const tasks: Task[] = [
      createTask("harvest", "W0N1", 2),
      createTask("build", "W0N1", "B1", 1),
    ];
    const next = removeTask(tasks, "harvest:W0N1");
    expect(next).toHaveLength(1);
    expect(next[0].type).toBe("build");
  });
});

describe("isTaskClaimable（容量模型）", () => {
  it("持有者未达容量时可领", () => {
    const task = createTask("harvest", "W0N1", 2);
    expect(isTaskClaimable(task, new Map([["harvest:W0N1", 1]]))).toBe(true);
  });

  it("持有者达到容量时不可领", () => {
    const task = createTask("harvest", "W0N1", 2);
    expect(isTaskClaimable(task, new Map([["harvest:W0N1", 2]]))).toBe(false);
    expect(isTaskClaimable(task, new Map([["harvest:W0N1", 3]]))).toBe(false);
  });

  it("无持有者记录时可领", () => {
    const task = createTask("build", "W0N1", "B1", 1);
    expect(isTaskClaimable(task, new Map())).toBe(true);
  });

  it("build 任务（容量 1）被占用后不可领", () => {
    const task = createTask("build", "W0N1", "B1", 1);
    expect(isTaskClaimable(task, new Map([["build:B1", 1]]))).toBe(false);
  });

  it("upgrade 任务（容量 = MAX_CREEPS）多执行者可领", () => {
    const task = createTask("upgrade", "W0N1", "C1", 6);
    expect(isTaskClaimable(task, new Map([["upgrade:C1", 5]]))).toBe(true);
    expect(isTaskClaimable(task, new Map([["upgrade:C1", 6]]))).toBe(false);
  });
});

describe("findNearestOpenTask", () => {
  it("按优先级返回 harvest > build > upgrade", () => {
    const tasks: Task[] = [
      createTask("upgrade", "W0N1", "C1", 6),
      createTask("harvest", "W0N1", 2),
      createTask("build", "W0N1", "B1", 1),
    ];
    expect(findNearestOpenTask(tasks)?.type).toBe("harvest");
  });

  it("同一优先级内选距离最近的任务", () => {
    const tasks: Task[] = [
      createTask("build", "W0N1", "B1", 1),
      createTask("build", "W0N1", "B2", 1),
    ];
    const dist = new Map([
      ["build:B1", 10],
      ["build:B2", 2],
    ]);
    expect(findNearestOpenTask(tasks, dist)?.id).toBe("build:B2");
  });

  it("高优先级无任务时降级到低优先级", () => {
    const tasks: Task[] = [
      createTask("upgrade", "W0N1", "C1", 6),
      createTask("build", "W0N1", "B1", 1),
    ];
    expect(findNearestOpenTask(tasks)?.type).toBe("build");
  });

  it("有距离信息的任务优先于无距离任务", () => {
    const tasks: Task[] = [
      createTask("build", "W0N1", "B1", 1),
      createTask("build", "W0N1", "B2", 1),
      createTask("upgrade", "W0N1", "C1", 6),
    ];
    const dist = new Map([["build:B2", 1]]);
    expect(findNearestOpenTask(tasks, dist)?.id).toBe("build:B2");
  });

  it("所有任务无距离信息时退化为取第一个任务", () => {
    const tasks: Task[] = [
      createTask("harvest", "W0N1", 2),
      createTask("harvest", "W1N1", 2),
      createTask("upgrade", "W0N1", "C1", 6),
    ];
    expect(findNearestOpenTask(tasks)?.id).toBe("harvest:W0N1");
  });

  it("无任务返回 undefined", () => {
    expect(findNearestOpenTask([])).toBeUndefined();
  });
});

describe("shouldTransferToHarvest", () => {
  it("持有固定目标任务、能量耗尽且 harvest 可领时转岗", () => {
    expect(
      shouldTransferToHarvest(createTask("upgrade", "W0N1", "C1", 6), 0, true),
    ).toBe(true);
  });

  it("harvest 任务持有者不转岗", () => {
    expect(
      shouldTransferToHarvest(createTask("harvest", "W0N1", 2), 0, true),
    ).toBe(false);
  });

  it("能量未耗尽不转岗", () => {
    expect(
      shouldTransferToHarvest(createTask("upgrade", "W0N1", "C1", 6), 10, true),
    ).toBe(false);
  });

  it("harvest 不可领（饱和）时不转岗", () => {
    expect(
      shouldTransferToHarvest(createTask("upgrade", "W0N1", "C1", 6), 0, false),
    ).toBe(false);
  });

  it("无任务不转岗", () => {
    expect(shouldTransferToHarvest(undefined, 0, true)).toBe(false);
  });
});
