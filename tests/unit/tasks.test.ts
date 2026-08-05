import { describe, it, expect } from "vitest";
import {
  createTask,
  claimTask,
  releaseTask,
  removeTask,
  findOpenTask,
  removeDeadClaims,
} from "../../src/tasks";

describe("createTask", () => {
  it("同类型同目标 id 一致（幂等去重）", () => {
    expect(createTask("harvest", "S1").id).toBe(createTask("harvest", "S1").id);
    expect(createTask("harvest", "S1").id).not.toBe(
      createTask("build", "S1").id,
    );
  });

  it("初始状态无领取者", () => {
    const task = createTask("harvest", "S1");
    expect(task.claimedBy).toBeUndefined();
  });
});

describe("claimTask", () => {
  it("open 任务可领取", () => {
    const tasks = [createTask("harvest", "S1")];
    const next = claimTask(tasks, "harvest:S1", "creep1");
    expect(next[0].claimedBy).toBe("creep1");
  });

  it("已领取的任务不可被二次领取", () => {
    let tasks = [createTask("harvest", "S1")];
    tasks = claimTask(tasks, "harvest:S1", "creep1");
    tasks = claimTask(tasks, "harvest:S1", "creep2");
    expect(tasks[0].claimedBy).toBe("creep1");
  });

  it("原数组不被修改（不可变操作）", () => {
    const tasks = [createTask("harvest", "S1")];
    claimTask(tasks, "harvest:S1", "creep1");
    expect(tasks[0].claimedBy).toBeUndefined();
  });
});

describe("releaseTask", () => {
  it("仅领取者本人可释放", () => {
    let tasks = [createTask("harvest", "S1")];
    tasks = claimTask(tasks, "harvest:S1", "creep1");
    tasks = releaseTask(tasks, "harvest:S1", "creep2");
    expect(tasks[0].claimedBy).toBe("creep1");
    tasks = releaseTask(tasks, "harvest:S1", "creep1");
    expect(tasks[0].claimedBy).toBeUndefined();
  });
});

describe("removeTask", () => {
  it("移除指定任务，其余保留", () => {
    const tasks = [createTask("harvest", "S1"), createTask("build", "C1")];
    const next = removeTask(tasks, "harvest:S1");
    expect(next).toHaveLength(1);
    expect(next[0].type).toBe("build");
  });
});

describe("findOpenTask", () => {
  it("按优先级返回 harvest > build > upgrade", () => {
    const tasks = [
      createTask("upgrade", "C1"),
      createTask("harvest", "S1"),
      createTask("build", "B1"),
    ];
    expect(findOpenTask(tasks)?.type).toBe("harvest");
  });

  it("已领取的任务不会被选中", () => {
    let tasks = [createTask("harvest", "S1"), createTask("build", "B1")];
    tasks = claimTask(tasks, "harvest:S1", "c1");
    expect(findOpenTask(tasks)?.type).toBe("build");
  });

  it("无 open 任务返回 undefined", () => {
    expect(findOpenTask([])).toBeUndefined();
  });
});

describe("removeDeadClaims", () => {
  it("清除死亡 creep 的任务占用", () => {
    let tasks = [createTask("harvest", "S1")];
    tasks = claimTask(tasks, "harvest:S1", "dead");
    const next = removeDeadClaims(tasks, new Set(["alive"]));
    expect(next[0].claimedBy).toBeUndefined();
  });

  it("保留存活 creep 的占用", () => {
    let tasks = [createTask("harvest", "S1")];
    tasks = claimTask(tasks, "harvest:S1", "alive");
    const next = removeDeadClaims(tasks, new Set(["alive"]));
    expect(next[0].claimedBy).toBe("alive");
  });

  it("无死亡占用时返回原数组引用（避免 Memory 写回）", () => {
    const tasks = [createTask("harvest", "S1")];
    const next = removeDeadClaims(tasks, new Set(["anyone"]));
    expect(next).toBe(tasks);
  });
});
