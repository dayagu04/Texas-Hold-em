/*
 * 筹码堆叠组件（docs/UI-DESIGN.md §7.1）。
 * 按数量分层渲染（5/25/100/500 不同颜色），动画用 transform: translate + opacity。
 * M3 简化版：单色圆形 + 数字；M4 精修多层堆叠效果。
 */
interface Props {
  amount: number;
  className?: string;
}

export default function ChipStack({ amount, className = "" }: Props) {
  if (amount <= 0) return null;

  // M3 简化：单个圆形 chip + 数字，不做分层堆叠（M4 优化）
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full bg-gold/90 px-2 py-1 text-xs font-bold text-base shadow-card ${className}`}
      style={{ fontFamily: "var(--font-mono)" }}
    >
      <span className="text-base">🪙</span>
      <span>{amount}</span>
    </div>
  );
}
