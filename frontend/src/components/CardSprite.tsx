/*
 * 单张牌组件（docs/UI-DESIGN.md §7.1 共用）。
 * M3 占位版：纯色矩形 + rank/suit 文本；M4 接入 icons.svg sprite `<use href="#card-As">`。
 * 支持 face / back / dim（暗淡，不在最优组合中）。
 */
import type { Card } from "../types";

interface Props {
  card?: Card; // undefined → 背面
  dim?: boolean;
  animate?: "flip" | "deal"; // M4 动效：flip=翻牌 3D / deal=发牌飞入
  className?: string;
}

// 后端 cards.py 发送小写花色 s/h/d/c（evaluator 依赖小写,见
// docs/features/bugfix-create-stuck-card-display.md）。key 用小写,
// 查表前 toLowerCase() 归一,兼容 mock fixture 里的大写花色。
const SUIT_SYMBOL: Record<string, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
  j: "🃏",
};

const SUIT_COLOR: Record<string, string> = {
  s: "text-text-hi",
  h: "text-danger",
  d: "text-danger",
  c: "text-text-hi",
  j: "text-gold",
};

const RANK_LABEL: Record<number, string> = {
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
  15: "小王",
  16: "大王",
};

export default function CardSprite({ card, dim, animate, className = "" }: Props) {
  const animClass = animate
    ? animate === "flip"
      ? "animate-[flipCard_360ms_ease-out]"
      : "animate-[dealCard_220ms_ease-out]"
    : "";

  if (!card) {
    // 背面
    return (
      <div
        className={`flex h-20 w-14 items-center justify-center rounded-card border border-gold/30 bg-rim shadow-card ${className}`}
      >
        <span className="text-2xl text-gold/50">🂠</span>
      </div>
    );
  }

  const rankLabel =
    RANK_LABEL[card.rank] ??
    (card.rank >= 2 && card.rank <= 10
      ? String(card.rank)
      : card.rank === 1
        ? "A"
        : "?");
  const suitKey = (card.suit || "").toLowerCase();
  const suitSymbol = SUIT_SYMBOL[suitKey] ?? "🂠";
  const suitColor = SUIT_COLOR[suitKey] ?? "text-text-lo";

  return (
    <div
      className={`relative flex h-20 w-14 flex-col items-center justify-center rounded-card border border-gold/30 bg-[#f5efe0] shadow-card ${
        dim ? "opacity-40" : ""
      } ${animClass} ${className}`}
    >
      <span className={`text-sm font-bold ${suitColor}`}>{rankLabel}</span>
      <span className={`text-3xl ${suitColor}`}>{suitSymbol}</span>
    </div>
  );
}
