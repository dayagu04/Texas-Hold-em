/*
 * 德州扑克 Board（docs/UI-DESIGN.md §7.2 TexasBoard）。
 * 中央椭圆桌 + 5 张公共牌居中 + pot 数字正下方 + side pots 小标签。
 * 玩家围坐（自己永远屏幕底部中央），显示 SeatCard + 底牌（摊牌时高亮）。
 * 下注筹码朝底池方向(内侧)推放;每街结束筹码飞入中央底池(收池动画)。
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { zhCN } from "../../i18n/zh-CN";
import { subscribe } from "../../socket";
import { soundManager } from "../../utils/sound";
import CardSprite from "../CardSprite";
import ChipStack from "../ChipStack";
import SeatCard from "../SeatCard";
import DealerButton from "../DealerButton";
import type { Card, CurrentTurn, PrivateState, PublicPlayer, TexasTableState, HandEnd } from "../../types";

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

/* 飘字反馈（行动时座位上方浮现）*/
interface FloatingText {
  id: string;
  sid: string;
  text: string;
  color: "gold" | "lo"; // gold=加注/看牌, lo=弃牌/过牌
}

export default function TexasBoard({ state, privateState, mySid }: Props) {
  const { players, payload, current_turn, stage, hand_id, log } = state;
  const { pot, side_pots, community, button_seat, player_bets } = payload;

  // 发牌动画触发：hand_id 变化时重置 dealKey 以触发 framer-motion 重新挂载 + 发牌音
  const prevHandId = useRef(hand_id);
  useEffect(() => {
    if (hand_id !== prevHandId.current) {
      prevHandId.current = hand_id;
      // 发牌音：hand_id 变化意味着新一手牌开始发牌
      if (hand_id) {
        soundManager.play("deal");
      }
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
  // 从各家下注区生成飞向底池的临时筹码 + 筹码音。
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
        // 筹码入池音：收池动画开始时触发
        soundManager.play("bet");
        const t = setTimeout(() => setFlying([]), 650);
        prevBets.current = player_bets;
        return () => clearTimeout(t);
      }
    }
    prevBets.current = player_bets;
    // seatLayout/betPos 由 players+mySid 派生,player_bets 变化即覆盖,无需额外依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player_bets, hand_id]);

  // 飘字反馈：监听 log 最后一条，生成飘字 + 可选音效
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const prevLogLen = useRef(log.length);
  useEffect(() => {
    if (log.length > prevLogLen.current && log.length > 0) {
      const latest = log[log.length - 1];
      const actionName = latest.action;
      const detail = latest.detail ?? "";

      // 根据 action 生成飘字文本和颜色
      let text = "";
      let color: "gold" | "lo" = "gold";

      if (actionName === "fold") {
        text = "弃牌";
        color = "lo";
        soundManager.play("fold");
      } else if (actionName === "check") {
        text = "过牌";
        color = "lo";
      } else if (actionName === "call") {
        text = `跟注${detail ? " " + detail : ""}`;
        color = "gold";
        soundManager.play("bet");
      } else if (actionName === "raise") {
        text = `加注${detail ? " " + detail : ""}`;
        color = "gold";
        soundManager.play("bet");
      } else if (actionName === "all_in") {
        text = "ALL IN";
        color = "gold";
        soundManager.play("bet");
      } else if (actionName === "look") {
        text = "看牌";
        color = "gold";
      }

      if (text) {
        const newText: FloatingText = {
          id: `float-${latest.sid}-${Date.now()}`,
          sid: latest.sid,
          text,
          color,
        };
        setFloatingTexts((prev) => [...prev, newText]);
        const timer = setTimeout(() => {
          setFloatingTexts((prev) => prev.filter((t) => t.id !== newText.id));
        }, 1200);
        return () => clearTimeout(timer);
      }
    }
    prevLogLen.current = log.length;
  }, [log]);

  // 赢家演出：监听 hand_end 事件，记录赢家 sid + 胜利音
  const [winnerSids, setWinnerSids] = useState<string[]>([]);
  useEffect(() => {
    const off = subscribe("table:hand_end", (data: HandEnd) => {
      // 筛选出盈利玩家作为赢家
      const winners = data.results
        .filter((r: any) => "amount" in r && r.amount > 0)
        .map((r: any) => r.sid);
      setWinnerSids(winners);
      // 胜利音：赢家演出开始时触发
      if (winners.length > 0) {
        soundManager.play("win");
      }
      // 3秒后清除赢家状态
      const timer = setTimeout(() => setWinnerSids([]), 3000);
      return () => clearTimeout(timer);
    });
    return off;
  }, []);

  const stageText = zhCN.stage[stage] ?? stage;

  return (
    <div className="relative h-full">
      {/* 桌面布局：桌面端椭圆桌 / 移动端纵向堆叠 */}
      <div className="hidden h-full md:block">
        <DesktopTable
          seatLayout={seatLayout}
          pot={pot}
          side_pots={side_pots}
          community={community}
          stageText={stageText}
          hand_id={hand_id}
          button_seat={button_seat}
          player_bets={player_bets}
          current_turn={current_turn}
          privateState={privateState}
          mySid={mySid}
          betPos={betPos}
          flying={flying}
          floatingTexts={floatingTexts}
          winnerSids={winnerSids}
        />
      </div>

      <div className="block h-full md:hidden">
        <MobileTable
          arranged={arranged}
          pot={pot}
          community={community}
          stageText={stageText}
          hand_id={hand_id}
          button_seat={button_seat}
          player_bets={player_bets}
          current_turn={current_turn}
          privateState={privateState}
        />
      </div>
    </div>
  );
}

/* 桌面端椭圆桌布局 */
function DesktopTable({
  seatLayout,
  pot,
  side_pots,
  community,
  stageText,
  hand_id,
  button_seat,
  player_bets,
  current_turn,
  privateState,
  mySid,
  betPos,
  flying,
  floatingTexts,
  winnerSids,
}: {
  seatLayout: Array<{ p: PublicPlayer; i: number; angle: number; x: number; y: number }>;
  pot: number;
  side_pots: { amount: number; eligible_sids: string[] }[];
  community: Card[];
  stageText: string;
  hand_id: string;
  button_seat: number;
  player_bets: Record<string, number>;
  current_turn: CurrentTurn | null;
  privateState: PrivateState | null;
  mySid: string;
  betPos: (x: number, y: number) => { x: number; y: number };
  flying: FlyingChip[];
  floatingTexts: FloatingText[];
  winnerSids: string[];
}) {
  // 翻公共牌音：监听 community 长度变化（flop/turn/river 发牌时触发）
  const prevCommLen = useRef(community.length);
  useEffect(() => {
    if (community.length > prevCommLen.current && community.length > 0) {
      // 公共牌新增时播放翻牌音（flop 3张 / turn 1张 / river 1张）
      soundManager.play("deal");
    }
    prevCommLen.current = community.length;
  }, [community.length]);

  return (
    <div className="relative h-full">
      {/* 椭圆桌面：多层材质叠加 + 立体桌沿 + 绒布质感。inset 收窄让桌面占满主区。 */}
      <div
        className="absolute inset-x-4 inset-y-3 rounded-[50%] bg-felt"
        style={{
          boxShadow: `
            inset 0 0 0 1px var(--table-edge-inner),
            inset 0 0 0 6px var(--table-edge-mid),
            inset 0 2px 3px 6px var(--table-edge-highlight),
            inset 0 0 0 9px var(--table-edge-outer),
            inset 0 0 140px rgba(0, 0, 0, 0.75),
            0 28px 70px rgba(0, 0, 0, 0.65),
            0 12px 30px rgba(0, 0, 0, 0.5)
          `,
        }}
      >
        {/* 桌面中心聚光层（增强亮度，突出焦点区） */}
        <div className="pointer-events-none absolute inset-0 rounded-[50%] bg-table-spotlight opacity-90" />
        {/* 桌面暗角层（四周压暗，增强纵深感） */}
        <div className="pointer-events-none absolute inset-0 rounded-[50%] bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.5)_100%)]" />
        {/* 中央区：公共牌 + pot */}
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-4">
          {/* pot - 精致金色光晕 + 立体描边 + 微妙渐变底 + 增强质感 */}
          <div
            className="rounded-panel border-2 border-gold/70 bg-base/90 px-6 py-3 text-center backdrop-blur-md"
            style={{
              boxShadow: `
                0 0 28px rgba(201, 161, 74, 0.4),
                0 0 16px rgba(231, 200, 122, 0.3),
                inset 0 1px 2px rgba(201, 161, 74, 0.3),
                inset 0 -1px 1px rgba(0, 0, 0, 0.2),
                0 15px 45px rgba(0, 0, 0, 0.6)
              `,
              background: `
                radial-gradient(ellipse at 50% 25%, rgba(231, 200, 122, 0.12) 0%, transparent 65%),
                linear-gradient(155deg, rgba(22, 26, 24, 0.92) 0%, rgba(13, 15, 14, 0.95) 100%)
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

          {/* 阶段标签 - 精致金色徽章（增强立体感） */}
          <div
            className="rounded-full border-2 border-gold/80 bg-base/75 px-5 py-1.5 text-sm font-semibold text-gold backdrop-blur-md"
            style={{
              boxShadow: `
                0 0 16px rgba(201, 161, 74, 0.35),
                0 0 8px rgba(231, 200, 122, 0.25),
                inset 0 1px 1px rgba(201, 161, 74, 0.25),
                inset 0 -1px 0 rgba(0, 0, 0, 0.15)
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
          const isWinner = winnerSids.includes(p.sid);

          // 底牌：自己从 privateState 取，摊牌时从 state 取（暂简化）
          let hole: Card[] = [];
          if (isMe && privateState) hole = privateState.hole;

          return (
            <div
              key={p.sid}
              className="absolute"
              style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
            >
              {/* 赢家光柱效果 */}
              {isWinner && (
                <motion.div
                  className="pointer-events-none absolute inset-0 -inset-x-8 -inset-y-8"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0.8, 0] }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                  style={{
                    background: `
                      radial-gradient(ellipse at center,
                        rgba(201, 161, 74, 0.6) 0%,
                        rgba(231, 200, 122, 0.4) 30%,
                        transparent 70%)
                    `,
                    filter: "blur(8px)",
                  }}
                />
              )}

              {/* 赢家金币雨（移动端降级：< 768px 关闭粒子效果） */}
              {isWinner && (
                <div className="pointer-events-none absolute inset-0 hidden md:block">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <motion.div
                      key={`coin-${i}`}
                      className="absolute h-3 w-3 rounded-full"
                      style={{
                        left: `${20 + Math.random() * 60}%`,
                        top: "-40px",
                        background: "radial-gradient(circle, var(--gold) 0%, var(--gold-soft) 100%)",
                        boxShadow: "0 0 8px rgba(201, 161, 74, 0.8)",
                      }}
                      initial={{ y: 0, opacity: 1, scale: 0.5 }}
                      animate={{
                        y: [0, 100 + Math.random() * 60],
                        opacity: [1, 1, 0],
                        scale: [0.5, 1, 0.8],
                        rotate: [0, 180 + Math.random() * 180],
                      }}
                      transition={{
                        duration: 1 + Math.random() * 0.5,
                        delay: i * 0.08,
                        ease: "easeIn",
                      }}
                    />
                  ))}
                </div>
              )}

              <SeatCard
                player={p}
                isCurrentTurn={isCurrentTurn}
                isMe={isMe}
                deadline={isCurrentTurn && current_turn?.deadline ? new Date(current_turn.deadline).getTime() : undefined}
              />
              {/* 底牌（自己 / 摊牌）— 从庄家位牌堆飞向座位,落定回弹 */}
              {hole.length > 0 && (
                <div className="mt-2 flex justify-center gap-1">
                  {hole.map((c, j) => {
                    // 计算庄家位置作为牌堆起点
                    const dealerSeat = seatLayout.find((s) => s.p.seat === button_seat);
                    const dealerX = dealerSeat ? dealerSeat.x - x : -60;
                    const dealerY = dealerSeat ? dealerSeat.y - y : -80;

                    return (
                      <motion.div
                        key={`${hand_id}-${c.suit}${c.rank}`}
                        initial={{ x: dealerX, y: dealerY, scale: 0.55, opacity: 0 }}
                        animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                        transition={{
                          type: "spring",
                          stiffness: 180,
                          damping: 20,
                          delay: j * 0.08,
                          duration: 0.22,
                        }}
                      >
                        <CardSprite card={c} className="scale-75" />
                      </motion.div>
                    );
                  })}
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

        {/* 飘字反馈: 行动时座位上方浮现金色飘字，上浮淡出 */}
        <AnimatePresence>
          {floatingTexts.map((ft) => {
            const seat = seatLayout.find((s) => s.p.sid === ft.sid);
            if (!seat) return null;

            return (
              <motion.div
                key={ft.id}
                className="pointer-events-none absolute z-30 whitespace-nowrap rounded-full border-2 px-4 py-2 text-base font-bold backdrop-blur-sm"
                style={{
                  left: `${seat.x}%`,
                  top: `${seat.y}%`,
                  x: "-50%",
                  y: "-50%",
                  borderColor: ft.color === "gold" ? "var(--gold)" : "var(--text-lo)",
                  color: ft.color === "gold" ? "var(--gold)" : "var(--text-lo)",
                  backgroundColor: ft.color === "gold" ? "rgba(201, 161, 74, 0.15)" : "rgba(179, 169, 142, 0.1)",
                  boxShadow: ft.color === "gold" ? "0 0 20px rgba(201, 161, 74, 0.4)" : "none",
                }}
                initial={{ y: "-50%", opacity: 1, scale: 0.9 }}
                animate={{ y: "-90px", opacity: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2, ease: "easeOut" }}
              >
                {ft.text}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* 移动端纵向堆叠布局 (#012) */
function MobileTable({
  arranged,
  pot,
  community,
  stageText,
  hand_id,
  button_seat,
  player_bets,
  current_turn,
  privateState,
}: {
  arranged: PublicPlayer[];
  pot: number;
  community: Card[];
  stageText: string;
  hand_id: string;
  button_seat: number;
  player_bets: Record<string, number>;
  current_turn: CurrentTurn | null;
  privateState: PrivateState | null;
}) {
  // 翻公共牌音：移动端也需要（与桌面端逻辑一致）
  const prevCommLen = useRef(community.length);
  useEffect(() => {
    if (community.length > prevCommLen.current && community.length > 0) {
      soundManager.play("deal");
    }
    prevCommLen.current = community.length;
  }, [community.length]);

  const me = arranged[0]; // 自己永远第一个（底部）
  const opponents = arranged.slice(1); // 其余玩家（顶部横排）

  const myHole = privateState?.hole ?? [];
  const myBet = player_bets[me.sid] ?? 0;
  const isMyTurn = current_turn?.sid === me.sid;

  return (
    <div className="flex h-full flex-col bg-felt p-2">
      {/* 顶部：对手横排（横滑） */}
      <div className="mb-2 overflow-x-auto">
        <div className="flex gap-2 pb-1">
          {opponents.map((p) => {
            const isCurrentTurn = current_turn?.sid === p.sid;
            const bet = player_bets[p.sid] ?? 0;
            return (
              <div key={p.sid} className="relative flex-shrink-0">
                <div className="w-20">
                  <SeatCard
                    player={p}
                    isCurrentTurn={isCurrentTurn}
                    isMe={false}
                    deadline={isCurrentTurn && current_turn?.deadline ? new Date(current_turn.deadline).getTime() : undefined}
                  />
                  {p.seat === button_seat && (
                    <DealerButton className="absolute -top-1 -left-1 scale-75" />
                  )}
                </div>
                {bet > 0 && (
                  <div className="mt-1 rounded border border-gold/50 bg-base/90 px-1.5 py-0.5 text-center text-xs font-bold text-gold">
                    {bet}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 中央：公共牌 + pot + 阶段 */}
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <div className="rounded-panel border border-gold/60 bg-base/85 px-4 py-2 text-center backdrop-blur-sm">
          <div className="text-xs text-text-lo">{zhCN.table.pot}</div>
          <div className="text-2xl font-bold text-gold" style={{ fontFamily: "var(--font-mono)" }}>
            {pot}
          </div>
        </div>

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
                <CardSprite card={c} className="h-16 w-12" />
              </motion.div>
            ))}
          </div>
        )}

        <div className="rounded-full border border-gold/70 bg-base/70 px-4 py-1 text-xs font-semibold text-gold backdrop-blur-sm">
          {stageText}
        </div>
      </div>

      {/* 底部：自己的座位 + 手牌 */}
      <div className="mt-2">
        <div className="flex items-center justify-between gap-2 rounded-card border border-gold/30 bg-elev/80 p-3 backdrop-blur-sm">
          <div className="flex-1">
            <div className="mb-1 text-sm font-bold text-text-hi">{me.name}</div>
            <div className="text-xs text-text-lo">
              筹码 <span className="font-semibold text-gold">{me.chips}</span>
            </div>
            {myBet > 0 && (
              <div className="mt-1 text-xs text-gold">已下注 {myBet}</div>
            )}
          </div>

          {myHole.length > 0 && (
            <div className="flex gap-1.5">
              {myHole.map((c, j) => (
                <motion.div
                  key={`${hand_id}-hole-${c.suit}${c.rank}`}
                  initial={{ x: -30, scale: 0.8, opacity: 0 }}
                  animate={{ x: 0, scale: 1, opacity: 1 }}
                  transition={{ duration: 0.22, delay: j * 0.08, ease: "easeOut" }}
                >
                  <CardSprite card={c} className="h-16 w-12" />
                </motion.div>
              ))}
            </div>
          )}

          {me.seat === button_seat && (
            <DealerButton className="absolute -top-1 -right-1 scale-90" />
          )}
        </div>

        {isMyTurn && (
          <div className="mt-2 rounded border border-gold/50 bg-gold/10 px-2 py-1 text-center text-xs text-gold">
            轮到你了
          </div>
        )}
      </div>
    </div>
  );
}
