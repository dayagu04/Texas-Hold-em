/*
 * 庄家按钮（docs/UI-DESIGN.md §7.1）。
 * 金色 D 圆形，挂在庄家位旁。M3 纯色圆形；M4 精修光晕动画。
 * M4.5 精修：放大尺寸 + 金色径向渐变 + 双层描边 + 立体感 + 外光晕发光徽章 + 3D 凸起效果。
 */
interface Props {
  className?: string;
}

export default function DealerButton({ className = "" }: Props) {
  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 bg-dealer-gold font-bold text-base shadow-dealer ${className}`}
      style={{
        borderColor: "rgba(169, 135, 62, 0.9)",
        boxShadow:
          "0 0 20px rgba(201, 161, 74, 0.7), 0 0 10px rgba(231, 200, 122, 0.5), 0 2px 6px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.3), inset 0 -1px 2px rgba(0, 0, 0, 0.25)",
      }}
    >
      D
    </div>
  );
}
