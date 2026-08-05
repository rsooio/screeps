/**
 * Screeps 运行时提供 console（类似浏览器控制台，输出显示在游戏内），
 * @types/screeps 未声明（lib ES2022 也不含），这里补全局类型。
 * 仅声明 Screeps 实际提供的方法子集，按需扩展。
 */
declare const console: {
  log(...data: unknown[]): void;
  info(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  error(...data: unknown[]): void;
};
