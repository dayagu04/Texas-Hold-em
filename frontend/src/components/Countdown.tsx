/*
 * 倒计时组件（docs/UI-DESIGN.md §7，行动条左侧嵌入）。
 * 进度条线性递减，5 秒内变红 + aria-live 播报告警。
 * M4：进度条动画 + 红色警告 + 无障碍支持。
 */
import { useEffect, useState, useRef } from "react";
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
  const [liveText, setLiveText] = useState("");
  const dangerAnnounced = useRef(false);

  useEffect(() => {
    const update = () => {
      const ms = new Date(deadline).getTime() - Date.now();
      const newRemaining = Math.max(0, Math.floor(ms / 1000));
      setRemaining(newRemaining);

      if (newRemaining > ANIM.countdownDanger) {
        // 离开危险区域（含切换到新的 deadline）时重置播报标志
        dangerAnnounced.current = false;
      } else if (newRemaining > 0 && !dangerAnnounced.current) {
        // 进入危险区域时播报一次
        dangerAnnounced.current = true;
        setLiveText(`警告：还剩 ${newRemaining} 秒`);
      }
    };
    update();
    const timer = setInterval(update, 200);
    return () => clearInterval(timer);
  }, [deadline]);

  const isDanger = remaining <= ANIM.countdownDanger;
  const progress = Math.max(0, Math.min(100, (remaining / total) * 100));

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* aria-live 区域（屏幕阅读器播报） */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveText}
      </div>

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
            className={`transition-all duration-200 ${isDanger ? "text-danger" : "text-gold"}`}
          />
        </svg>
      </div>
      <span
        className={`text-sm font-bold transition-colors duration-200 ${isDanger ? "text-danger" : "text-text-hi"}`}
        style={{ fontFamily: "var(--font-mono)" }}
        aria-label={`剩余时间 ${remaining} 秒`}
      >
        {remaining}s
      </span>
    </div>
  );
}
