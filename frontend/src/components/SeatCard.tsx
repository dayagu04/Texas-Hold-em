/*
 * 座位卡（docs/UI-DESIGN.md §7.1）。
 * 玩家头像（首字母圆形）、昵称、筹码、当前下注 chip、状态徽标（folded / all-in / 🤖level）。
 * M3 骨架版：纯文本 + 状态样式；M4 精修头像渐变 / Bot 思考闪烁动画。
 * M4.5 精修：悬浮质感卡片 + 渐变底 + 毛玻璃 + 双层描边 + 立体投影 + 头像放大光晕 + 轮到你金色脉冲动画。
 */
import { useEffect, useState } from "react";
import { zhCN } from "../i18n/zh-CN";
import ChipStack from "./ChipStack";
import Avatar from "./Avatar";
import type { PublicPlayer } from "../types";

interface Props {
  player: PublicPlayer;
  currentBet?: number; // 本街已下注（非总筹码）
  isCurrentTurn?: boolean;
  isMe?: boolean;
  deadline?: number; // Unix timestamp ms，轮到你时的行动截止时间
  className?: string;
}

export default function SeatCard({
  player,
  currentBet,
  isCurrentTurn,
  isMe,
  deadline,
  className = "",
}: Props) {
  const statusLabel = player.status !== "active" ? zhCN.playerStatus[player.status] : "";
  const isWinner = player.status === "won";

  // 计时环：用 now 心跳(仅在 interval 回调里 setState,不在 effect 体内同步调用),
  // timeLeft 在渲染期从 deadline 派生,规避 react-hooks/set-state-in-effect。
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isCurrentTurn || !deadline) return;
    const id = setInterval(() => setNow(Date.now()), 100); // 每 100ms 更新一次
    return () => clearInterval(id);
  }, [isCurrentTurn, deadline]);
  const timeLeft =
    isCurrentTurn && deadline
      ? Math.max(0, Math.min(100, ((deadline - now) / 30000) * 100)) // 30s 总时长(与后端 TURN_TIMEOUT 对齐)
      : 100;

  return (
    <div
      className={`relative min-w-[136px] rounded-xl backdrop-blur-sm ${
        isMe
          ? "border-2 border-gold bg-seat-card shadow-seat"
          : isCurrentTurn
            ? "border-2 border-gold-soft bg-seat-card shadow-seat animate-[activePulse_2s_ease-in-out_infinite]"
            : "border border-rim/80 bg-seat-card shadow-seat"
      } p-3.5 transition-all duration-base ${isWinner ? "animate-[winnerGlow_1200ms_ease-in-out]" : ""} ${className}`}
    >
      {/* 呼吸光环效果：当前行动者专属，金色外发光脉冲 */}
      {isCurrentTurn && (
        <div
          className="pointer-events-none absolute inset-0 rounded-xl"
          style={{
            animation: "activePulse 2s ease-in-out infinite",
            zIndex: -1,
          }}
        />
      )}
      {/* 头像（首字母圆形 / 真实头像） */}
      <div className="mb-2.5 flex items-center gap-2.5">
        <div className="relative">
          {/* 计时环：仅 isCurrentTurn 时渲染 */}
          {isCurrentTurn && deadline && (
            <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 56 56">
              {/* 底层灰色环(背景) */}
              <circle cx="28" cy="28" r="26" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
              {/* 进度环(金色,根据 timeLeft 控制 stroke-dashoffset) */}
              <circle
                cx="28" cy="28" r="26" fill="none"
                stroke="var(--color-gold-soft)" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 26}`}
                strokeDashoffset={`${2 * Math.PI * 26 * (1 - timeLeft / 100)}`}
                className="transition-all duration-100 ease-linear"
              />
            </svg>
          )}
          {/* 头像（首字母圆形 / 真实头像，加载失败回退首字母） */}
          <Avatar
            src={player.avatar}
            name={player.name}
            className={`h-10 w-10 text-sm ${
              isMe
                ? "border-2 border-gold/70 shadow-[0_0_18px_rgba(201,161,74,0.6)]"
                : "border-2 border-rim/60 shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
            }`}
            fallbackClassName={
              isMe ? "!bg-gold !text-base" : "!bg-rim !text-text-lo"
            }
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="truncate text-base font-semibold text-text-hi drop-shadow-sm">
            {player.name}
            {player.is_bot && (
              <span className="ml-1.5 text-xs text-gold/80" title={player.bot_level}>
                🤖
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 筹码数（千位分隔 + 金色醒目） */}
      <div className="mb-1.5 flex items-center gap-1 text-xs text-text-lo">
        <span className="inline-block h-3 w-3 rounded-full border border-gold/60 bg-gold/20" title="筹码" />
        <span className="font-medium text-gold" style={{ fontFamily: "var(--font-mono)" }}>
          {player.chips.toLocaleString("en-US")}
        </span>
      </div>

      {/* 当前下注筹码堆（桌面筹码，保留在卡片外侧） */}
      {currentBet !== undefined && currentBet > 0 && (
        <div className="absolute -top-2 -right-2">
          <ChipStack amount={currentBet} />
        </div>
      )}

      {/* 状态徽标（folded / all_in / sitting_out 全屏遮罩） */}
      {statusLabel && (
        <div
          className={`absolute inset-0 flex items-center justify-center rounded-xl ${
            player.status === "folded"
              ? "border border-danger/40 bg-base/85 backdrop-blur-sm"
              : player.status === "all_in"
                ? "border border-gold/50 bg-gold/15 backdrop-blur-sm"
                : "border border-rim/50 bg-elev/70 backdrop-blur-sm"
          }`}
        >
          <span
            className={`text-base font-bold drop-shadow-md ${
              player.status === "folded"
                ? "text-danger"
                : player.status === "all_in"
                  ? "text-gold"
                  : "text-text-lo"
            }`}
          >
            {statusLabel}
          </span>
        </div>
      )}

      {/* Bot 思考动画（回合中 + bot） */}
      {player.is_bot && isCurrentTurn && (
        <div className="absolute -top-2 -left-2 rounded-full border border-gold/40 bg-base/95 px-2 py-0.5 text-xs font-semibold text-gold shadow-[0_0_12px_rgba(201,161,74,0.4)]">
          <span className="animate-[botThinking_1s_ease-in-out_infinite]">...</span>
        </div>
      )}
    </div>
  );
}
