import type { Task } from "./tasks";

declare global {
  interface Memory {
    tasks: Task[];
  }
  interface CreepMemory {
    taskId?: string;
  }
}

export {};
