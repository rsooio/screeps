/**
 * Screeps 入口：服务器每个 tick 调用一次 main.loop()。
 * 所有命令（move/attack/harvest 等）在本 tick 结束后统一生效。
 */
export function loop(): void {
  const cpu = Game.cpu.getUsed();
  console.log(`[tick ${Game.time}] cpu: ${cpu.toFixed(2)} / ${Game.cpu.limit}`);

  const creepNames = Object.keys(Game.creeps);
  console.log(
    `[creeps] ${creepNames.length} alive: ${creepNames.join(", ") || "(none)"}`,
  );
}
