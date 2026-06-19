/*
 * 德州扑克 Board（docs/UI-DESIGN.md §7.2 TexasBoard）。
 * 中央椭圆桌 + 5 张公共牌居中 + pot 数字正下方 + side pots 小标签。
 * 玩家围坐（自己永远屏幕底部中央），显示 SeatCard + 底牌（摊牌时高亮）。
 * M3 骨架版：布局 + 状态渲染；M4 精修发牌动画 / 赢家光晕。
 */
import { useEffect, useRef } from "react";
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

  const stageText = zhCN.stage[stage] ?? stage;

  return (
    <div className="relative h-full">
      {/* 椭圆桌面：金属内沿高光 + 更柔和暗角 */}
      <div className="absolute inset-10 rounded-[50%] border-8 border-rim bg-felt shadow-[inset_0_2px_3px_rgba(201,161,74,0.2),inset_0_0_80px_rgba(0,0,0,0.65),0_20px_50px_rgba(0,0,0,0.5)]">
        {/* 桌面暗角层（柔和聚光，叠在毡布上） */}
        <div className="pointer-events-none absolute inset-0 rounded-[50%] bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.4)_100%)]" />
        {/* 中央区：公共牌 + pot */}
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-4">
          {/* pot */}
          <div className="rounded-panel border border-gold/50 bg-base/80 px-6 py-3 text-center shadow-elev backdrop-blur-sm">
            <div className="mb-1 text-xs text-text-lo">{zhCN.table.pot}</div>
            <div
              className="text-3xl font-bold text-gold"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {pot}
            </div>
          </div>

          {/* 公共牌 — M4 翻牌动画：依次错峰翻转 */}
          {community.length > 0 && (
            <div className="flex gap-2">
              {community.map((c, i) => (
                <motion.div
                  key={`${hand_id}-comm-${i}`}
                  initial={{ rotateY: -90, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  transition={{ duration: 0.36, delay: i * 0.12, ease: "easeOut" }}
                  style={{ transformStyle: "preserve-3d" }}
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

          {/* 阶段 */}
          <div className="rounded-full border border-rim bg-base/60 px-4 py-1 text-sm text-text-hi backdrop-blur-sm">
            {stageText}
          </div>
        </div>

        {/* 玩家（围坐） */}
        {arranged.map((p, i) => {
          const angle = (i / arranged.length) * 2 * Math.PI - Math.PI / 2;
          const radiusX = 42;
          const radiusY = 32;
          const x = 50 + radiusX * Math.cos(angle);
          const y = 50 + radiusY * Math.sin(angle);
          const isMe = p.sid === mySid;
          const isCurrentTurn = current_turn?.sid === p.sid;
          const bet = player_bets[p.sid] ?? 0;

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
                currentBet={bet}
                isCurrentTurn={isCurrentTurn}
                isMe={isMe}
              />
              {/* 底牌（自己 / 摊牌）— M4 发牌动画：hand_id 变化触发错峰飞入 */}
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
              {/* 当前轮下注筹码 — M4 筹码堆叠 + 抛入动画 + 加注金色脉冲（Task 4） */}
              <AnimatePresence mode="wait">
                {bet > 0 && (
                  <motion.div
                    key={`bet-${p.sid}-${bet}`}
                    initial={{ y: -30, opacity: 0, scale: 0.6, rotate: -10 }}
                    animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ y: -25, opacity: 0, scale: 0.75 }}
                    transition={{
                      duration: 0.45,
                      ease: [0.2, 0.8, 0.3, 1],
                      opacity: { duration: 0.3 },
                    }}
                    className="absolute -bottom-9 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-gold/70 bg-base/95 px-3 py-1.5 text-xs font-bold text-gold shadow-[0_0_0_rgba(231,200,122,0),var(--shadow-chip)] backdrop-blur-sm animate-[raisePulse_560ms_ease-out]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    <ChipStack amount={bet} size={15} />
                    <span>{bet}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
