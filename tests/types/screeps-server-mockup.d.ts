/**
 * screeps-server-mockup 的最小类型声明（该包无官方类型）。
 * 只声明本项目用到的 API 子集。
 */
declare module "screeps-server-mockup" {
  export class ScreepsServer {
    constructor(opts?: Record<string, unknown>);
    world: {
      reset(): Promise<void>;
      stubWorld(): Promise<void>;
      addRoom(roomName: string): Promise<void>;
      setTerrain(roomName: string, terrain: unknown): Promise<void>;
      addRoomObject(
        room: string,
        type: string,
        x: number,
        y: number,
        attributes?: Record<string, unknown>,
      ): Promise<void>;
      addBot(options: {
        username: string;
        room: string;
        x: number;
        y: number;
        modules: Record<string, string>;
        spawnName?: string;
      }): Promise<Bot>;
      roomObjects(roomName: string): Promise<Record<string, unknown>[]>;
    };
    start(): Promise<void>;
    tick(): Promise<void>;
    stop(): void;
  }

  export interface Bot {
    /** 存储中的原始 Memory JSON 字符串（需自行 JSON.parse） */
    memory: Promise<string>;
    newNotifications: Promise<{ message?: string }[]>;
    on(event: "console", listener: (logs: string[]) => void): void;
  }

  export class TerrainMatrix {
    set(x: number, y: number, type: "wall" | "swamp" | "plain"): void;
    static unserialize(data: string): TerrainMatrix;
  }
}
