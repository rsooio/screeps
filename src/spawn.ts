/**
 * Spawn 生产决策：纯函数，不依赖 Game 全局。
 * 生产规则：不忙碌、未达上限，且（房间无人 或 存在价值为正的任务）。
 * body 定制：按未领取任务的需求分布选择档位组——
 * 运输需求多（deliver）→ CARRY 重；工作需求多（upgrade/build）→ WORK 重。
 */
export const MAX_CREEPS = 6;

/**
 * 矿工基础设施：固定产能节点（类似 source），不参与任务经济。
 * 无 CARRY（采集后能量自动掉落，由 deliver 拾取），2 WORK = 4/tick；
 * 成本 250 ≤ spawn 容量 300（无 extension 也可生产）。
 */
export const MINER_BODY: BodyPartConstant[] = [WORK, WORK, MOVE];

export const MINER_COST = bodyCost(MINER_BODY);

/** 工作档位组：WORK 重（升级/建造效率），按可用能量从低到高 */
const WORK_TIERS: BodyPartConstant[][] = [
  [WORK, CARRY, MOVE], // 200
  [WORK, WORK, CARRY, MOVE], // 300
  [WORK, WORK, CARRY, CARRY, MOVE, MOVE], // 400
  [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE], // 500
];

/** 运输档位组：CARRY 重（运能量效率），按可用能量从低到高 */
const CARRY_TIERS: BodyPartConstant[][] = [
  [WORK, CARRY, CARRY, MOVE], // 250
  [WORK, CARRY, CARRY, CARRY, MOVE, MOVE], // 350
  [WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE], // 450
];

export function bodyCost(body: readonly BodyPartConstant[]): number {
  return body.reduce((sum, part) => sum + BODYPART_COST[part], 0);
}

/** 按任务需求分布选最高能负担的档位；不足最低档返回 undefined */
export function bodyForDemand(
  energy: number,
  mix: { carry: number; work: number },
): BodyPartConstant[] | undefined {
  const tiers = mix.carry >= mix.work ? CARRY_TIERS : WORK_TIERS;
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (energy >= bodyCost(tiers[i])) return tiers[i];
  }
  return undefined;
}

export interface SpawnParams {
  /** spawn 当前能量 */
  energy: number;
  /** 房间存活 creep 数 */
  creepCount: number;
  /** 价值为正的任务数（含 upgrade 兜底） */
  openTaskCount: number;
  /** spawn 正在生产 */
  busy: boolean;
  /** 未领取任务的类型分布（定制 body 用） */
  taskMix: { carry: number; work: number };
}

export function decideSpawn(
  params: SpawnParams,
): BodyPartConstant[] | undefined {
  const { energy, creepCount, openTaskCount, busy, taskMix } = params;
  if (busy || creepCount >= MAX_CREEPS) return undefined;
  // 房间一个 creep 都没有时必须保底开工（哪怕只有 upgrade 任务）
  if (creepCount === 0) return bodyForDemand(energy, { carry: 0, work: 1 });
  // 有活才干
  if (openTaskCount === 0) return undefined;
  return bodyForDemand(energy, taskMix);
}

/**
 * 矿工部署参数（投资门槛，可被测试注入覆盖）：
 * - minWorkers：普通 creep 数下限（劳动力基础，不挤占基本盘）
 * - energyThreshold：能量储备门槛（有存款才投资）
 * 默认值经参数扫描实验确定（scripts/param-sweep.ts），非猜测。
 */
export interface MinerParams {
  minWorkers: number;
  energyThreshold: number;
}

declare global {
  // 参数扫描注入点（实验用）：main 模块首行设置，运行时每 tick 读取
  var __MINER_PARAMS: MinerParams | undefined;
}

/**
 * 默认部署参数（经参数扫描实验确定，scripts/param-sweep.ts 两轮数据）：
 * energyThreshold=300：spawn 能量满才投资（满能量 = 生产间歇，不挤占劳动力）
 * minWorkers=1：至少 1 个普通 creep 后才投资（保底劳动力不被矿工挤掉，
 *   扫描实测 w0 冷启动 spawnE 储备差 61 vs w1 的 147）
 */
export const DEFAULT_MINER_PARAMS: MinerParams = {
  minWorkers: 1,
  energyThreshold: 300,
};

export function minerParams(): MinerParams {
  return globalThis.__MINER_PARAMS ?? DEFAULT_MINER_PARAMS;
}

/**
 * 矿工部署条件（投资决策）：
 * 1. 劳动力基础：普通 creep 数 ≥ minWorkers
 * 2. 能量储备：spawn 能量 ≥ energyThreshold
 * 3. 数量：每 source 至多 1 个矿工（低数量）
 */
export function minerDeployable(params: {
  energy: number;
  workerCount: number;
  minerCount: number;
  sourceCount: number;
  busy: boolean;
}): boolean {
  const { energy, workerCount, minerCount, sourceCount, busy } = params;
  const { minWorkers, energyThreshold } = minerParams();
  return (
    !busy &&
    workerCount >= minWorkers &&
    energy >= energyThreshold &&
    minerCount < sourceCount
  );
}
