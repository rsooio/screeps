/**
 * Spawn 生产决策：纯函数，不依赖 Game 全局。
 * 生产规则：不忙碌、未达上限，且（房间无人 或 存在未领取的任务）。
 * open 任务包含 upgrade 兜底任务——它有任务没人领，就说明该继续生产。
 */
export const MAX_CREEPS = 6;

/** body 档次：按可用能量从低到高（WORK=100, CARRY=50, MOVE=50） */
const BODY_TIERS: BodyPartConstant[][] = [
  [WORK, CARRY, MOVE], // 200
  [WORK, WORK, CARRY, MOVE], // 300
  [WORK, WORK, CARRY, CARRY, MOVE, MOVE], // 400
  [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE], // 500
];

export function bodyCost(body: readonly BodyPartConstant[]): number {
  return body.reduce((sum, part) => sum + BODYPART_COST[part], 0);
}

/** 按可用能量选最高能负担的 body 档次；不足最小档次返回 undefined */
export function bodyForEnergy(energy: number): BodyPartConstant[] | undefined {
  for (let i = BODY_TIERS.length - 1; i >= 0; i--) {
    if (energy >= bodyCost(BODY_TIERS[i])) return BODY_TIERS[i];
  }
  return undefined;
}

export interface SpawnParams {
  /** spawn 当前能量 */
  energy: number;
  /** 房间存活 creep 数 */
  creepCount: number;
  /** 未领取的任务数（含 upgrade 兜底） */
  openTaskCount: number;
  /** spawn 正在生产 */
  busy: boolean;
}

export function decideSpawn(
  params: SpawnParams,
): BodyPartConstant[] | undefined {
  const { energy, creepCount, openTaskCount, busy } = params;
  if (busy || creepCount >= MAX_CREEPS) return undefined;
  // 房间一个 creep 都没有时必须保底开工（哪怕只有 upgrade 任务）
  if (creepCount === 0) return bodyForEnergy(energy);
  // 有活才干
  if (openTaskCount === 0) return undefined;
  return bodyForEnergy(energy);
}
