/*
 * 庄家按钮（docs/UI-DESIGN.md §7.1）。
 * 金色 D 圆形，挂在庄家位旁。M3 纯色圆形；M4 精修光晕动画。
 */
interface Props {
  className?: string;
}

export default function DealerButton({ className = "" }: Props) {
  return (
    <div
      className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-gold bg-gold/20 font-bold text-gold shadow-card ${className}`}
    >
      D
    </div>
  );
}
