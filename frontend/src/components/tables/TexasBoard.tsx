/*
 * 德州扑克 Board（docs/UI-DESIGN.md §7.2 TexasBoard）。
 * 中央椭圆桌 + 5 张公共牌居中 + pot 数字正下方 + side pots 小标签。
 * 玩家围坐（自己永远屏幕底部中央），显示 SeatCard + 底牌（摊牌时高亮）。
 * 下注筹码朝底池方向(内侧)推放;每街结束筹码飞入中央底池(收池动画)。
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { zhCN } from "../../i18n/zh-CN";
import CardSprite from "../CardSprite";
import ChipStack from "../ChipStack";
import SeatCard from "../SeatCard";
import DealerButton from "../DealerButton";
import type { Card, PrivateState, TexasTableState } from "../../types";

interface Props {
  state: TexasTableState;
  privateState: PrivateState | null;
  mySid: string;
}

/* 飞向底池的临时筹码(收池动画用)。 */
interface FlyingChip {
  id: string;
  x: number; // 起点(下注区)table 坐标 %
  y: number;
  amount: number;
}

export default function TexasBoard({ state, privateState, mySid }: Props) {
  const { players, payload, current_turn, stage, hand_id } = state;
  const { pot, side_pots, community, button_seat, player_bets } = payload;

  // 发牌动画触发：hand_id 变化时重置 dealKey 以触发 framer-motion 重新挂载
  const prevHandId = useRef(hand_id);
  useEffect(() => {
    if (hand_id !== prevHandId.current) {
      prevHandId.current = hand_id;
    }
  }, [hand_id]);

  // 自己在底部中央，其余玩家围绕桌沿分布
  const myIdx = players.findIndex((p) => p.sid === mySid);
  const arranged =
    myIdx >= 0 ? [...players.slice(myIdx), ...players.slice(0, myIdx)] : players;

  // 座位坐标(table 坐标系 %): i=0(自己)落在椭圆底部中央(angle=+π/2)。
  const radiusX = 44;
  const radiusY = 38;
  const seatLayout = arranged.map((p, i) => {
    const angle = (i / arranged.length) * 2 * Math.PI + Math.PI / 2;
    const x = 50 + radiusX * Math.cos(angle);
    const y = 50 + radiusY * Math.sin(angle);
    return { p, i, angle, x, y };
  });
  // 下注区: 座位与底池中心连线上、靠近底池的点(0.52 ≈ 一半略偏内)。
  const betPos = (x: number, y: number) => ({
    x: 50 + (x - 50) * 0.52,
    y: 50 + (y - 50) * 0.52,
  });

  // 收池动画: 追踪上一帧各家下注;某街结束(总下注由 >0 归零)时,
  // 从各家下注区生成飞向底池的临时筹码。
  const [flying, setFlying] = useState<FlyingChip[]>([]);
  const prevBets = useRef<Record<string, number>>(player_bets);
  useEffect(() => {
    const prev = prevBets.current;
    const prevTotal = Object.values(prev).reduce((a, b) => a + b, 0);
    const curTotal = Object.values(player_bets).reduce((a, b) => a + b, 0);
    if (prevTotal > 0 && curTotal === 0) {
      const chips: FlyingChip[] = Object.entries(prev)
        .filter(([, amt]) => amt > 0)
        .map(([sid, amt]) => {
          const seat = seatLayout.find((s) => s.p.sid === sid);
          const base = seat ? betPos(seat.x, seat.y) : { x: 50, y: 50 };
          return { id: `${hand_id}-${sid}-${prevTotal}`, x: base.x, y: base.y, amount: amt };
        });
      if (chips.length) {
        setFlying(chips);
        const t = setTimeout(() => setFlying([]), 650);
        prevBets.current = player_bets;
        return () => clearTimeout(t);
      }
    }
    prevBets.current = player_bets;
    // seatLayout/betPos 由 players+mySid 派生,player_bets 变化即覆盖,无需额外依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player_bets, hand_id]);

  const stageText = zhCN.stage[stage] ?? stage;

  return (
    <div className="relative h-full">
      {/* 椭圆桌面：多层材质叠加 + 立体桌沿。inset 收窄让桌面占满主区。 */}
      <div
        className="absolute inset-x-4 inset-y-3 rounded-[50%] bg-felt"
        style={{
          boxShadow: `
            inset 0 0 0 1px var(--table-edge-inner),
            inset 0 0 0 5px var(--table-edge-mid),
            inset 0 1px 2px 5px var(--table-edge-highlight),
            inset 0 0 0 8px var(--table-edge-outer),
            inset 0 0 120px rgba(0, 0, 0, 0.7),
            0 25px 60px rgba(0, 0, 0, 0.6)
          `,
        }}
      >
        {/* 桌面中心聚光层 */}
        <div className="pointer-events-none absolute inset-0 rounded-[50%] bg-table-spotlight" />
        {/* 桌面暗角层（四周压暗） */}
        <div className="pointer-events-none absolute inset-0 rounded-[50%] bg-[radial-gradient(ellipse_at_center,transparent_48%,rgba(0,0,0,0.45)_100%)]" />
        {/* 中央区：公共牌 + pot */}
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-4">
          {/* pot - 精致金色光晕 + 立体描边 + 微妙渐变底 */}
          <div
            className="rounded-panel border border-gold/60 bg-base/85 px-6 py-3 text-center backdrop-blur-sm"
            style={{
              boxShadow: `
                0 0 24px rgba(201, 161, 74, 0.35),
                inset 0 1px 1px rgba(201, 161, 74, 0.25),
                0 12px 40px rgba(0, 0, 0, 0.55)
              `,
              background: `
                radial-gradient(ellipse at 50% 30%, rgba(201, 161, 74, 0.08) 0%, transparent 60%),
                rgba(13, 15, 14, 0.85)
              `,
            }}
          >
            <div className="mb-1 text-xs text-text-lo">{zhCN.table.pot}</div>
            <div
              className="text-3xl font-bold text-gold"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {pot}
            </div>
          </div>

          {/* 公共牌 — M4 翻牌动画：依次错峰翻转，增强浮起投影 */}
          {community.length > 0 && (
            <div className="flex gap-3">
              {community.map((c, i) => (
                <motion.div
                  key={`${hand_id}-comm-${i}`}
                  initial={{ rotateY: -90, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  transition={{ duration: 0.36, delay: i * 0.12, ease: "easeOut" }}
                  style={{
                    transformStyle: "preserve-3d",
                    filter: "drop-shadow(0 6px 14px rgba(0, 0, 0, 0.5))",
                  }}
                >
                  <CardSprite card={c} />
                </motion.div>
              ))}
            </div>
          )}

          {/* side pots（简化显示） */}
          {side_pots.length > 0 && (
            <div className="text-xs text-text-lo">
              {side_pots.length} {zhCN.table.sidePot}
            </div>
          )}

          {/* 阶段标签 - 精致金色徽章 */}
          <div
            className="rounded-full border border-gold/70 bg-base/70 px-5 py-1.5 text-sm font-semibold text-gold backdrop-blur-sm"
            style={{
              boxShadow: `
                0 0 12px rgba(201, 161, 74, 0.25),
                inset 0 1px 0 rgba(201, 161, 74, 0.2)
              `,
            }}
          >
            {stageText}
          </div>
        </div>

        {/* 玩家（围坐） */}
        {seatLayout.map(({ p, x, y }) => {
          const isMe = p.sid === mySid;
          const isCurrentTurn = current_turn?.sid === p.sid;

          // 底牌：自己从 privateState 取，摊牌时从 state 取（暂简化）
          let hole: Card[] = [];
          if (isMe && privateState) hole = privateState.hole;

          return (
            <div
              key={p.sid}
              className="absolute"
              style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
            >
              <SeatCard
                player={p}
                isCurrentTurn={isCurrentTurn}
                isMe={isMe}
                deadline={isCurrentTurn && current_turn?.deadline ? new Date(current_turn.deadline).getTime() : undefined}
              />
              {/* 底牌（自己 / 摊牌）— 朝屏幕下沿展开,不侵入底池 */}
              {hole.length > 0 && (
                <div className="mt-2 flex justify-center gap-1">
                  {hole.map((c, j) => (
                    <motion.div
                      key={`${hand_id}-${c.suit}${c.rank}`}
                      initial={{ x: -60, y: -80, scale: 0.55, opacity: 0 }}
                      animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                      transition={{ duration: 0.22, delay: j * 0.08, ease: "easeOut" }}
                    >
                      <CardSprite card={c} className="scale-75" />
                    </motion.div>
                  ))}
                </div>
              )}
              {/* 庄家按钮 */}
              {p.seat === button_seat && (
                <DealerButton className="absolute -top-2 -left-2" />
              )}
            </div>
          );
        })}

        {/* 下注筹码层(table 坐标,朝底池方向内推)— 抛入动画。
            定位(left/top + 居中)放外层静态 div;动画留给内层 motion.div,
            避免 motion 的 transform(y/scale)覆盖居中用的 translate(-50%,-50%)。 */}
        {seatLayout.map(({ p, x, y }) => {
          const bet = player_bets[p.sid] ?? 0;
          if (bet <= 0) return null;
          const { x: bx, y: by } = betPos(x, y);
          return (
            <div
              key={`bet-wrap-${p.sid}`}
              className="absolute z-10"
              style={{
                left: `${bx}%`,
                top: `${by}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <motion.div
                key={`bet-${p.sid}-${bet}`}
                initial={{ opacity: 0, scale: 0.6, y: -22 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.42, ease: [0.2, 0.8, 0.3, 1] }}
                className="flex items-center gap-1.5 rounded-full border border-gold/70 bg-base/95 px-2.5 py-1 text-xs font-bold text-gold backdrop-blur-sm"
                style={{
                  fontFamily: "var(--font-mono)",
                  boxShadow: "var(--shadow-chip)",
                }}
              >
                <ChipStack amount={bet} size={14} />
                <span>{bet}</span>
              </motion.div>
            </div>
          );
        })}

        {/* 收池动画: 各家下注飞向中央底池后淡出。
            居中用 motion 自己的 x/y:"-50%"(与 scale 同属 transform,motion 会正确合成),
            不要在 style 里写 translate,否则被 scale 覆盖。 */}
        <AnimatePresence>
          {flying.map((c) => (
            <motion.div
              key={c.id}
              className="absolute z-20 flex items-center gap-1.5 rounded-full border border-gold/60 bg-base/90 px-2 py-1 text-xs font-bold text-gold"
              initial={{ left: `${c.x}%`, top: `${c.y}%`, x: "-50%", y: "-50%", opacity: 1, scale: 1 }}
              animate={{ left: "50%", top: "46%", x: "-50%", y: "-50%", opacity: 0, scale: 0.65 }}
              transition={{ duration: 0.6, ease: "easeIn" }}
              style={{ fontFamily: "var(--font-mono)" }}
            >
              <ChipStack amount={c.amount} size={13} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
