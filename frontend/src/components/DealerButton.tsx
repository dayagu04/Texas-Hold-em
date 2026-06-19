/*
 * 庄家按钮（docs/UI-DESIGN.md §7.1）。
 * 金色 D 圆形，挂在庄家位旁。M3 纯色圆形；M4 精修光晕动画。
 * M4.5 精修：放大尺寸 + 金色径向渐变 + 双层描边 + 立体感 + 外光晕发光徽章 + 3D 凸起效果。
 * M4.6 精修：筹码式同心内圈 inlay（凹陷印花区）+ 顶部椭圆高光（金属反光），更接近真实金属/陶瓷庄家钮。
 */
interface Props {
  className?: string;
}

export default function DealerButton({ className = "" }: Props) {
  return (
    <div
      className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 bg-dealer-gold font-bold text-base shadow-dealer ${className}`}
      style={{
        borderColor: "rgba(169, 135, 62, 0.9)",
        boxShadow:
          "0 0 20px rgba(201, 161, 74, 0.7), 0 0 10px rgba(231, 200, 122, 0.5), 0 2px 6px rgba(0, 0, 0, 0.55), 0 6px 14px rgba(0, 0, 0, 0.35), inset 0 1px 1px rgba(255, 255, 255, 0.35), inset 0 -1px 2px rgba(0, 0, 0, 0.28)",
      }}
    >
      {/* 同心内圈 inlay：凹陷的印花区，双层 inset 环让 D 坐在略低一阶的金盘上（筹码质感） */}
      <span
        className="pointer-events-none absolute rounded-full"
        style={{
          inset: "5px",
          boxShadow:
            "inset 0 0 0 1px rgba(255,255,255,0.30), inset 0 0 0 2px rgba(120,90,30,0.45), inset 0 1px 3px rgba(0,0,0,0.30)",
        }}
        aria-hidden
      />
      {/* 顶部椭圆高光：环境光在金属弧面顶端的镜面反射 */}
      <span
        className="pointer-events-none absolute rounded-full"
        style={{
          inset: 0,
          background:
            "radial-gradient(ellipse 50% 32% at 36% 22%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.12) 48%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(circle, #000 62%, transparent 64%)",
          maskImage: "radial-gradient(circle, #000 62%, transparent 64%)",
        }}
        aria-hidden
      />
      <span className="relative z-10 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]">D</span>
    </div>
  );
}
