/*
 * 单张牌组件（docs/UI-DESIGN.md §7.1 共用，texas / guandan / brag 三玩法共用）。
 * 纯 CSS/SVG 矢量牌面，零位图资源，参考腾讯欢乐斗地主观感：
 *   · 正面底：暖白渐变 + 左上光泽叠层 + 细牌缘描边 + 浮起投影，营造卡片厚度/受光。
 *   · 角标：左上 + 右下（旋转 180°）竖排「粗体大点数 + 花色」，醒目紧凑。
 *   · 数字牌 2-10：中央按真实扑克标准 pip layout 排列花色点数（下半区花色旋转 180°）。
 *   · A：中央单个超大花色（真实扑克惯例）。
 *   · 人头牌 J/Q/K：中央大号衬线字母 + 花色，配金色装饰边框，区别于数字牌且显「高级」。
 *   · 王牌（rank 15/16）：🃏 + 竖排 JOKER 文案，小王=ink、大王=gold。
 *   · 背面（card 为 undefined）：金色菱形暗纹 + 金边 + 中央菱形徽记。
 * 牌内所有元素用容器查询单位（cqmin）排版，随牌尺寸等比缩放，
 * 配合 scale-* 或 h-/w- 覆盖都不裁切。
 */
import type { ReactNode } from "react";
import type { Card } from "../types";
import { debugLog } from "../utils/debug";

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

// 红黑标准色用语义令牌（tokens.css）。红桃/方块=card-red，黑桃/梅花=card-ink。
const SUIT_COLOR: Record<string, string> = {
  s: "text-card-ink",
  h: "text-card-red",
  d: "text-card-red",
  c: "text-card-ink",
  j: "text-card-ink",
};

const RANK_LABEL: Record<number, string> = {
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
  15: "小王",
  16: "大王",
};

// 花色用系统 Symbol 字体兜底:某些环境下默认字体不含 ♠♥♦♣,
// 显式声明 Apple Color Emoji / Segoe UI Symbol 保证可见。
const SUIT_FONT_STACK =
  '"Apple Color Emoji", "Segoe UI Symbol", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

// 消费方若已传入显式尺寸（h-* / w-*）则不叠加默认尺寸，避免 Tailwind 同优先级冲突。
// HandEndModal 传 "h-12 w-9"，各 board 传 "scale-75/90"（不含尺寸）→ 用默认。
const HAS_EXPLICIT_SIZE = /(?:^|\s)[hw]-/;
const DEFAULT_SIZE = "h-24 w-[4.25rem]"; // ≈96×68px，扑克 2.5:3.5 比例，比旧 h-20 w-14 更舒展

/*
 * 标准扑克 pip 排列（rank 2-10）。坐标为牌面百分比 [x, y]，
 * pip 以 translate(-50%,-50%) 居中定位；下半区（y > 50）花色旋转 180°（真实扑克惯例）。
 * 左/右列 x=28/72，中列 x=50。行位置取自标准印刷牌型。
 */
const PIP_LAYOUT: Record<number, [number, number][]> = {
  2: [
    [50, 18],
    [50, 82],
  ],
  3: [
    [50, 18],
    [50, 50],
    [50, 82],
  ],
  4: [
    [28, 18],
    [72, 18],
    [28, 82],
    [72, 82],
  ],
  5: [
    [28, 18],
    [72, 18],
    [50, 50],
    [28, 82],
    [72, 82],
  ],
  6: [
    [28, 18],
    [72, 18],
    [28, 50],
    [72, 50],
    [28, 82],
    [72, 82],
  ],
  7: [
    [28, 18],
    [72, 18],
    [50, 34],
    [28, 50],
    [72, 50],
    [28, 82],
    [72, 82],
  ],
  8: [
    [28, 18],
    [72, 18],
    [50, 34],
    [28, 50],
    [72, 50],
    [50, 66],
    [28, 82],
    [72, 82],
  ],
  9: [
    [28, 18],
    [72, 18],
    [28, 39],
    [72, 39],
    [50, 50],
    [28, 61],
    [72, 61],
    [28, 82],
    [72, 82],
  ],
  10: [
    [28, 18],
    [72, 18],
    [50, 29],
    [28, 39],
    [72, 39],
    [28, 61],
    [72, 61],
    [50, 71],
    [28, 82],
    [72, 82],
  ],
};

export default function CardSprite({ card, dim, animate, className = "" }: Props) {
  const animClass = animate
    ? animate === "flip"
      ? "animate-[flipCard_360ms_ease-out]"
      : "animate-[dealCard_220ms_ease-out]"
    : "";
  const sizeClass = HAS_EXPLICIT_SIZE.test(className) ? "" : DEFAULT_SIZE;

  // 容器查询：牌内字号以 cqmin 为基准，随牌尺寸等比缩放。
  // overflow-visible 给角标留足空间，缩放时不裁切。
  const baseShell =
    `relative overflow-visible rounded-card shadow-float [container-type:size] ` +
    `${sizeClass} ${dim ? "opacity-40" : ""} ${animClass} ${className}`;

  if (!card) {
    // 背面：金色菱形暗纹网格 + 金边 + 中央双层菱形徽记。
    return (
      <div className={`${baseShell} bg-card-back border border-gold/40`}>
        {/* 内描边边框 */}
        <div className="absolute inset-[7%] rounded-[5px] border border-gold/25" />
        <div className="absolute inset-0 flex items-center justify-center">
          {/* 外菱形 */}
          <span
            className="absolute rotate-45 border-2 border-gold/45 bg-gold/10"
            style={{ width: "30cqmin", height: "30cqmin" }}
          />
          {/* 内菱形 */}
          <span
            className="absolute rotate-45 border border-gold/35"
            style={{ width: "18cqmin", height: "18cqmin" }}
          />
          {/* 中心徽记 */}
          <span className="absolute text-gold/70" style={{ fontSize: "16cqmin" }}>
            ♦
          </span>
        </div>
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
  const suitSymbol = SUIT_SYMBOL[suitKey] ?? "?";
  const suitColor = SUIT_COLOR[suitKey] ?? "text-text-lo";

  // 诊断日志：捕获异常花色/点数原始值
  if (!SUIT_SYMBOL[suitKey] && card.suit) {
    debugLog("[CardSprite] Unknown suit", {
      original: card.suit,
      key: suitKey,
      rank: card.rank,
    });
  }
  if (rankLabel === "?") {
    debugLog("[CardSprite] Unknown rank", {
      rank: card.rank,
      suit: card.suit,
    });
  }

  const isJoker = suitKey === "j" || card.rank === 15 || card.rank === 16;

  // 王牌：🃏 + 竖排 JOKER。小王=ink，大王=gold。
  if (isJoker) {
    const big = card.rank === 16;
    const jokerColor = big ? "text-gold" : "text-card-ink";
    const label = RANK_LABEL[card.rank] ?? "JOKER";
    return (
      <CardFaceShell baseShell={baseShell}>
        <span
          className={`leading-none ${jokerColor}`}
          style={{ fontSize: "40cqmin", fontFamily: SUIT_FONT_STACK }}
        >
          🃏
        </span>
        <span
          className={`mt-[4cqmin] font-bold tracking-widest ${jokerColor}`}
          style={{ fontSize: "13cqmin", writingMode: "vertical-rl" }}
        >
          JOKER
        </span>
        <span
          className={`absolute left-[6%] top-[4%] font-bold ${jokerColor}`}
          style={{ fontSize: "16cqmin" }}
        >
          {label}
        </span>
        <span
          className={`absolute bottom-[4%] right-[6%] rotate-180 font-bold ${jokerColor}`}
          style={{ fontSize: "16cqmin" }}
        >
          {label}
        </span>
      </CardFaceShell>
    );
  }

  const isAce = card.rank === 14 || card.rank === 1;
  const isFace = card.rank >= 11 && card.rank <= 13; // J/Q/K
  const pips = PIP_LAYOUT[card.rank];

  return (
    <CardFaceShell baseShell={baseShell}>
      {/* 左上角标：点数 + 花色（竖排） */}
      <CornerIndex
        rank={rankLabel}
        suit={suitSymbol}
        color={suitColor}
        className="left-[7%] top-[4%]"
      />
      {/* 右下角标：旋转 180° */}
      <CornerIndex
        rank={rankLabel}
        suit={suitSymbol}
        color={suitColor}
        className="bottom-[4%] right-[7%] rotate-180"
      />

      {/* 中央区：A=超大花色 / J·Q·K=装饰人头位 / 2-10=标准 pip 排列 */}
      {isAce ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`leading-none ${suitColor}`}
            style={{ fontSize: "58cqmin", fontFamily: SUIT_FONT_STACK }}
          >
            {suitSymbol}
          </span>
        </div>
      ) : isFace ? (
        <FaceCenter
          rank={rankLabel}
          suit={suitSymbol}
          color={suitColor}
        />
      ) : pips ? (
        // pip 排列限定在角标之间的安全区（横向 18%-82%，纵向 14%-86%）
        <div className="absolute inset-x-[18%] inset-y-[14%]">
          {pips.map(([x, y], i) => (
            <span
              key={i}
              className={`absolute leading-none ${suitColor}`}
              style={{
                left: `${x}%`,
                top: `${y}%`,
                fontSize: "20cqmin",
                fontFamily: SUIT_FONT_STACK,
                transform: `translate(-50%, -50%)${y > 50 ? " rotate(180deg)" : ""}`,
              }}
            >
              {suitSymbol}
            </span>
          ))}
        </div>
      ) : (
        // 兜底（理论不达：未知 rank）：中央单花色
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`leading-none ${suitColor}`}
            style={{ fontSize: "44cqmin", fontFamily: SUIT_FONT_STACK }}
          >
            {suitSymbol}
          </span>
        </div>
      )}
    </CardFaceShell>
  );
}

/*
 * 正面牌壳：暖白渐变底 + 细牌缘描边 + 左上光泽叠层（立体卡片观感）。
 * children 为牌面内容（pip / 角标 / 人头 / joker）。
 */
function CardFaceShell({
  baseShell,
  children,
}: {
  baseShell: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`${baseShell} bg-card-front`}
      style={{ border: "1px solid var(--color-card-edge)" }}
    >
      {children}
      {/* 光泽叠层：左上柔和高光，不挡交互 */}
      <div className="pointer-events-none absolute inset-0 rounded-card bg-card-gloss" />
      {/* 内缘高光细线：模拟卡片切边受光 */}
      <div className="pointer-events-none absolute inset-0 rounded-card shadow-[inset_0_1px_1px_rgba(255,255,255,0.7),inset_0_-1px_2px_rgba(0,0,0,0.08)]" />
    </div>
  );
}

/* 人头牌 J/Q/K 中央：金色装饰框 + 大号衬线字母 + 花色，区别数字牌且显「高级」。 */
function FaceCenter({
  rank,
  suit,
  color,
}: {
  rank: string;
  suit: string;
  color: string;
}) {
  return (
    <div className="absolute inset-[16%] flex items-center justify-center">
      {/* 金色双层装饰边框 */}
      <div className="absolute inset-0 rounded-[4px] border border-gold/60" />
      <div className="absolute inset-[8%] rounded-[3px] border border-gold/30 bg-gold/5" />
      {/* 四角小花色装饰 */}
      <span
        className={`absolute left-[6%] top-[4%] leading-none ${color}`}
        style={{ fontSize: "14cqmin", fontFamily: SUIT_FONT_STACK }}
      >
        {suit}
      </span>
      <span
        className={`absolute bottom-[4%] right-[6%] rotate-180 leading-none ${color}`}
        style={{ fontSize: "14cqmin", fontFamily: SUIT_FONT_STACK }}
      >
        {suit}
      </span>
      {/* 中央大衬线字母 */}
      <span
        className={`font-bold leading-none ${color}`}
        style={{ fontSize: "40cqmin", fontFamily: "var(--font-brand)" }}
      >
        {rank}
      </span>
    </div>
  );
}

/* 角标：竖排「粗体大点数 + 花色」，绝对定位。容器查询单位等比缩放。 */
function CornerIndex({
  rank,
  suit,
  color,
  className = "",
}: {
  rank: string;
  suit: string;
  color: string;
  className?: string;
}) {
  return (
    <div
      className={`absolute flex flex-col items-center leading-none ${color} ${className}`}
    >
      <span
        className="font-bold"
        style={{ fontSize: "23cqmin", letterSpacing: "-0.04em" }}
      >
        {rank}
      </span>
      <span
        className="-mt-[1cqmin]"
        style={{ fontSize: "18cqmin", fontFamily: SUIT_FONT_STACK }}
      >
        {suit}
      </span>
    </div>
  );
}
