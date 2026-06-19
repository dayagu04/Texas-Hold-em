/*
 * 筹码堆叠组件（docs/UI-DESIGN.md §7.1，texas / brag 共用）。
 * 纯 CSS 绘制（径向渐变 + 多层描边模拟边缘条纹），零位图：
 *   · 单枚筹码：径向渐变盘面 + 深色描边 + 6 段虚线边缘条纹（赌场筹码外圈白点）。
 *   · 堆叠：按金额分档决定枚数（小注 1-2 / 中注 3 / 大注 4 / 全下级 5），
 *     纵向错位叠放营造厚度；金额越大堆越高。
 *   · 颜色分档（真实赌场惯例）：白<25 / 红<100 / 绿<500 / 黑<2000 / 紫≥2000，
 *     色值取自 tokens.css --color-chip-*。
 * 仅视觉：数据由调用方传入 amount，组件不含业务逻辑。
 */

interface Props {
  amount: number;
  /** 单枚筹码直径（cqmin 之外的固定 px / rem 由 className 控制时可不传）。默认 14px。 */
  size?: number;
  className?: string;
}

interface ChipTier {
  /** 该档颜色变量名（tokens.css） */
  color: string;
  /** 该档堆叠枚数 */
  count: number;
}

// 金额 → 档位（颜色 + 堆高）。阈值参考真实筹码面额梯度。
function tierFor(amount: number): ChipTier {
  if (amount < 25) return { color: "--color-chip-white", count: amount < 10 ? 1 : 2 };
  if (amount < 100) return { color: "--color-chip-red", count: 3 };
  if (amount < 500) return { color: "--color-chip-green", count: 3 };
  if (amount < 2000) return { color: "--color-chip-black", count: 4 };
  return { color: "--color-chip-purple", count: 5 };
}

function Chip({ color, size, z }: { color: string; size: number; z: number }) {
  return (
    <span
      className="absolute left-0 rounded-full"
      style={{
        width: size,
        height: size,
        bottom: z * Math.max(2, size * 0.16),
        zIndex: z,
        // 盘面：径向渐变（中心亮、边缘暗）模拟筹码受光
        background: `radial-gradient(circle at 38% 32%, color-mix(in srgb, var(${color}) 78%, #fff) 0%, var(${color}) 52%, color-mix(in srgb, var(${color}) 70%, #000) 100%)`,
        // 多层描边：外深边 + 内浅环；虚线边缘条纹用 repeating conic 叠加
        boxShadow: [
          "0 0 0 1px rgba(0,0,0,0.55)",
          "inset 0 0 0 1.5px rgba(255,255,255,0.45)",
          `inset 0 0 0 ${Math.max(2, size * 0.18)}px color-mix(in srgb, var(${color}) 60%, #000)`,
          "var(--shadow-chip)",
        ].join(", "),
      }}
    >
      {/* 边缘条纹：6 段白色短弧（赌场筹码外圈标识），用 conic-gradient 遮罩近似 */}
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "repeating-conic-gradient(rgba(255,255,255,0.85) 0deg 10deg, transparent 10deg 60deg)",
          // 仅保留外环：用 radial 遮罩挖空中心
          WebkitMaskImage:
            "radial-gradient(circle, transparent 58%, #000 60%, #000 92%, transparent 96%)",
          maskImage:
            "radial-gradient(circle, transparent 58%, #000 60%, #000 92%, transparent 96%)",
        }}
      />
    </span>
  );
}

export default function ChipStack({ amount, size = 14, className = "" }: Props) {
  if (amount <= 0) return null;

  const { color, count } = tierFor(amount);
  const stackHeight = size + (count - 1) * Math.max(2, size * 0.16);

  return (
    <span
      className={`relative inline-block ${className}`}
      style={{ width: size, height: stackHeight }}
      aria-hidden
    >
      {Array.from({ length: count }, (_, i) => (
        <Chip key={i} color={color} size={size} z={i} />
      ))}
    </span>
  );
}
