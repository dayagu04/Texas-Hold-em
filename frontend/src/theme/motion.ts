/*
 * framer-motion 用的时长常量（秒），与 theme/tokens.css 的 --duration-* 严格对应。
 * CSS 端用 var(--duration-base)，JS 端用 MOTION.base —— 改一处务必改两处。
 * 复杂动效时序参数登记在 docs/UI-DESIGN.md §8。
 */
export const MOTION = {
  fast: 0.12, // --duration-fast 120ms：面板淡入
  base: 0.22, // --duration-base 220ms：状态切换 / 发牌单张
  slow: 0.42, // --duration-slow 420ms：复杂时序
} as const;

/* docs/UI-DESIGN.md §8 动效清单参数 */
export const ANIM = {
  dealStaggerStep: 0.08, // 发牌错峰 80ms
  flipCommunity: 0.36, // 翻公共牌 360ms
  chipToPot: 0.32, // 筹码入池 320ms
  winnerGlow: 1.2, // 赢家光晕 1200ms
  bragFlip: 0.6, // 炸金花看牌 3D 翻面 600ms
  turnTimeout: 25, // 行动倒计时 25s
  countdownDanger: 5, // 倒计时进入红色告警阈值（秒）
} as const;
