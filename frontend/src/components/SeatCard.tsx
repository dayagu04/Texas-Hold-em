/*
 * 座位卡（docs/UI-DESIGN.md §7.1）。
 * 玩家头像（首字母圆形）、昵称、筹码、当前下注 chip、状态徽标（folded / all-in / 🤖level）。
 * M3 骨架版：纯文本 + 状态样式；M4 精修头像渐变 / Bot 思考闪烁动画。
 */
import { zhCN } from "../i18n/zh-CN";
import ChipStack from "./ChipStack";
import type { PublicPlayer } from "../types";

interface Props {
  player: PublicPlayer;
  currentBet?: number; // 本街已下注（非总筹码）
  isCurrentTurn?: boolean;
  isMe?: boolean;
  className?: string;
}

export default function SeatCard({
  player,
  currentBet,
  isCurrentTurn,
  isMe,
  className = "",
}: Props) {
  const initials = player.name.slice(0, 2).toUpperCase();
  const statusLabel = player.status !== "active" ? zhCN.playerStatus[player.status] : "";
  const isWinner = player.status === "won";

  return (
    <div
      className={`relative min-w-[120px] rounded-panel border ${
        isMe
          ? "border-gold bg-elev/90"
          : isCurrentTurn
            ? "border-gold-soft bg-elev/80 shadow-[0_0_8px_var(--color-gold)]"
            : "border-rim bg-elev/70"
      } p-3 shadow-card transition ${isWinner ? "animate-[winnerGlow_1200ms_ease-in-out]" : ""} ${className}`}
    >
      {/* 头像（首字母圆形） */}
      <div className="mb-2 flex items-center gap-2">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full ${
            isMe ? "bg-gold text-base" : "bg-rim text-text-lo"
          } text-xs font-bold`}
        >
          {initials}
        </div>
        <div className="flex-1">
          <div className="truncate text-sm font-medium text-text-hi">
            {player.name}
            {player.is_bot && (
              <span className="ml-1 text-xs text-text-lo" title={player.bot_level}>
                🤖
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 筹码 */}
      <div className="mb-1 text-xs text-text-lo">
        筹码：
        <span className="ml-1 font-bold text-gold" style={{ fontFamily: "var(--font-mono)" }}>
          {player.chips}
        </span>
      </div>

      {/* 当前下注（本街） */}
      {currentBet !== undefined && currentBet > 0 && (
        <div className="absolute -top-2 -right-2">
          <ChipStack amount={currentBet} />
        </div>
      )}

      {/* 状态徽标 */}
      {statusLabel && (
        <div
          className={`absolute inset-0 flex items-center justify-center rounded-panel ${
            player.status === "folded"
              ? "bg-base/80"
              : player.status === "all_in"
                ? "bg-gold/20"
                : "bg-elev/60"
          }`}
        >
          <span
            className={`text-sm font-bold ${
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
        <div className="absolute -top-2 -right-2 rounded-full bg-base/90 px-2 py-0.5 text-xs text-gold">
          <span className="animate-[botThinking_1s_ease-in-out_infinite]">...</span>
        </div>
      )}
    </div>
  );
}
