import type { Task } from "./tasks";

declare global {
  interface Memory {
    tasks: Task[];
  }
  interface CreepMemory {
    taskId?: string;
    /** 滞回工作状态：true=工作中（升级/建造/运送），false=采集中 */
    working?: boolean;
  }
}

export {};
