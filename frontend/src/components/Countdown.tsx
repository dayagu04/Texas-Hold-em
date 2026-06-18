/*
 * 倒计时组件（docs/UI-DESIGN.md §7，行动条左侧嵌入）。
 * 进度条线性递减，5 秒内变红。M3 骨架版纯文本；M4 精修进度条动画。
 */
import { useEffect, useState } from "react";
import { ANIM } from "../theme/motion";

interface Props {
  deadline: string; // ISO 8601
  className?: string;
}

export default function Countdown({ deadline, className = "" }: Props) {
  const [remaining, setRemaining] = useState(0);
  const [total] = useState(() => {
    const ms = new Date(deadline).getTime() - Date.now();
    return Math.max(1, Math.floor(ms / 1000));
  });

  useEffect(() => {
    const update = () => {
      const ms = new Date(deadline).getTime() - Date.now();
      setRemaining(Math.max(0, Math.floor(ms / 1000)));
    };
    update();
    const timer = setInterval(update, 200);
    return () => clearInterval(timer);
  }, [deadline]);

  const isDanger = remaining <= ANIM.countdownDanger;
  const progress = Math.max(0, Math.min(100, (remaining / total) * 100));

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative h-8 w-8">
        <svg className="h-full w-full -rotate-90 transform">
          <circle
            cx="16"
            cy="16"
            r="14"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            className="text-rim"
          />
          <circle
            cx="16"
            cy="16"
            r="14"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeDasharray={`${2 * Math.PI * 14}`}
            strokeDashoffset={`${2 * Math.PI * 14 * (1 - progress / 100)}`}
            className={`transition-all ${isDanger ? "text-danger" : "text-gold"}`}
          />
        </svg>
      </div>
      <span
        className={`text-sm font-bold ${isDanger ? "text-danger" : "text-text-hi"}`}
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {remaining}s
      </span>
    </div>
  );
}
