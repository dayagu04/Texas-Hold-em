/*
 * 筹码堆叠组件（docs/UI-DESIGN.md §7.1，texas / brag 共用）。
 * 纯 CSS 绘制（径向渐变 + 多层描边 + conic 边缘色块），零位图：
 *   · 单枚筹码：径向渐变盘面 + 深色侧边 + 6 段等分 edge spots（赌场筹码外圈色块）+ 同心圆 inlay 中心印花区。
 *   · 堆叠：按金额分档决定枚数（小注 1-2 / 中注 3 / 大注 4 / 全下级 5），
 *     纵向错位叠放；每枚底部深色侧边表现厚度，侧面比顶面略深；金额越大堆越高。
 *   · 最上一枚加椭圆顶部高光（环境光反射，塑料/陶瓷质感）。
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

function Chip({
  color,
  size,
  z,
  isTop,
}: {
  color: string;
  size: number;
  z: number;
  /** 是否最上面那枚（加顶部高光 + inlay 印花） */
  isTop: boolean;
}) {
  // 每枚厚度（侧面可见高度）：随直径缩放，至少 2px。
  const lift = Math.max(2, size * 0.16);
  // 侧面深色细边厚度（表现筹码物理厚度）。
  const edge = Math.max(1.5, size * 0.12);
  return (
    <span
      className="absolute left-0 rounded-full"
      style={{
        width: size,
        height: size,
        bottom: z * lift,
        zIndex: z,
        // 盘面：径向渐变（中心亮、边缘暗）模拟筹码受光
        background: `radial-gradient(circle at 38% 32%, color-mix(in srgb, var(${color}) 80%, #fff) 0%, var(${color}) 50%, color-mix(in srgb, var(${color}) 68%, #000) 100%)`,
        boxShadow: [
          // 外深边（盘缘）
          "0 0 0 1px rgba(0,0,0,0.55)",
          // 顶面内浅环高光
          "inset 0 0 0 1.5px rgba(255,255,255,0.42)",
          // 侧面厚度：底部深色细边（比顶面深一档），表现叠起来的物理侧壁
          `0 ${edge}px 0 color-mix(in srgb, var(${color}) 48%, #000)`,
          `0 ${edge}px 0 1px rgba(0,0,0,0.5)`,
          // 接触/柔影
          "var(--shadow-chip)",
        ].join(", "),
      }}
    >
      {/* 边缘色块 edge spots：6 段等分浅色块嵌在筹码外圈（repeating-conic-gradient），
          用 radial 遮罩仅保留外环。 */}
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "repeating-conic-gradient(rgba(255,255,255,0.88) 0deg 22deg, transparent 22deg 60deg)",
          WebkitMaskImage:
            "radial-gradient(circle, transparent 60%, #000 63%, #000 92%, transparent 96%)",
          maskImage:
            "radial-gradient(circle, transparent 60%, #000 63%, #000 92%, transparent 96%)",
        }}
      />
      {/* inlay 中心印花区：同心圆描边圈出筹码中心盘，内有一圈细金/暗纹环。 */}
      <span
        className="absolute rounded-full"
        style={{
          inset: `${Math.max(2, size * 0.2)}px`,
          // 中心盘略沉，靠双层 inset 环表现凹陷的印花区
          boxShadow: [
            "inset 0 0 0 1px rgba(255,255,255,0.28)",
            "inset 0 0 0 2px rgba(0,0,0,0.32)",
            `inset 0 0 ${Math.max(2, size * 0.18)}px rgba(0,0,0,0.28)`,
          ].join(", "),
          background:
            "radial-gradient(circle at 42% 36%, rgba(255,255,255,0.16) 0%, rgba(0,0,0,0.05) 60%, rgba(0,0,0,0.12) 100%)",
        }}
      />
      {/* 中心暗纹符号（菱形花色暗记），仅在足够大时显现，避免小尺寸糊成一团 */}
      {size >= 12 && (
        <span
          className="absolute left-1/2 top-1/2 rounded-[1px]"
          style={{
            width: Math.max(2, size * 0.16),
            height: Math.max(2, size * 0.16),
            transform: "translate(-50%, -50%) rotate(45deg)",
            background: "rgba(255,255,255,0.22)",
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
          }}
        />
      )}
      {/* 顶部高光：仅最上一枚，椭圆高光模拟环境光在弧面顶端的反射（塑料/陶瓷质感） */}
      {isTop && (
        <span
          className="pointer-events-none absolute rounded-full"
          style={{
            inset: 0,
            background:
              "radial-gradient(ellipse 46% 30% at 36% 24%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.15) 45%, transparent 70%)",
            WebkitMaskImage: "radial-gradient(circle, #000 60%, transparent 62%)",
            maskImage: "radial-gradient(circle, #000 60%, transparent 62%)",
          }}
        />
      )}
    </span>
  );
}

export default function ChipStack({ amount, size = 14, className = "" }: Props) {
  if (amount <= 0) return null;

  const { color, count } = tierFor(amount);
  const lift = Math.max(2, size * 0.16);
  const edge = Math.max(1.5, size * 0.12);
  // 堆高需含顶枚直径 + 错位累加 + 顶枚侧边厚度，避免裁切。
  const stackHeight = size + (count - 1) * lift + edge;

  return (
    <span
      className={`relative inline-block ${className}`}
      style={{ width: size, height: stackHeight }}
      aria-hidden
    >
      {Array.from({ length: count }, (_, i) => (
        <Chip key={i} color={color} size={size} z={i} isTop={i === count - 1} />
      ))}
    </span>
  );
}
