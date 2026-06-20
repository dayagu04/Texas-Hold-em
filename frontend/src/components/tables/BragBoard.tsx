/*
 * 炸金花 Board（docs/UI-DESIGN.md §7.2 BragBoard）。
 * 圆桌，每位玩家面前 3 张牌（背面 / 已看亮 / 摊牌全亮）。
 * 中央池底数字 + ante / current_bet 小标签。
 * 自己的牌片有"看牌"覆盖层，未看时全黑且印着金色"看牌"字样；点击后 3D 翻面（M4 动画 600ms）。
 * M3 骨架版：布局 + 看牌状态切换；M4 精修 3D 翻面动画 + compare 浮层选目标。
 * #015-C：音效联动 + 质感对齐（桌面 felt + 立体桌沿 + 呼吸光环 + 卡牌厚度）。
 */
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { zhCN } from "../../i18n/zh-CN";
import { soundManager } from "../../utils/sound";
import CardSprite from "../CardSprite";
import ChipStack from "../ChipStack";
import SeatCard from "../SeatCard";
import { emit } from "../../socket";
import type { BragTableState, PrivateState } from "../../types";

interface Props {
  state: BragTableState;
  privateState: PrivateState | null;
  mySid: string;
}

export default function BragBoard({ state, privateState, mySid }: Props) {
  const { players, payload, current_turn, stage, log } = state;
  const { pot, ante, current_bet, looked } = payload;

  // 下注音效：监听 log 最后一条
  const prevLogLen = useRef(log.length);
  useEffect(() => {
    if (log.length > prevLogLen.current && log.length > 0) {
      const latest = log[log.length - 1];
      const actionName = latest.action;

      if (actionName === "fold") {
        soundManager.play("fold");
      } else if (actionName === "call" || actionName === "raise" || actionName === "all_in") {
        soundManager.play("bet");
      } else if (actionName === "look") {
        soundManager.play("deal");
      }
    }
    prevLogLen.current = log.length;
  }, [log]);

  const myIdx = players.findIndex((p) => p.sid === mySid);
  const arranged =
    myIdx >= 0 ? [...players.slice(myIdx), ...players.slice(0, myIdx)] : players;

  const stageText = zhCN.stage[stage] ?? stage;
  const iLooked = looked[mySid] ?? false;

  const handleLook = () => {
    emit("table:action", { table_id: state.table_id, action: "look", payload: {} });
  };

  return (
    <div className="relative h-full">
      {/* 圆桌：多层材质叠加 + 立体桌沿 */}
      <div
        className="absolute inset-10 rounded-full bg-felt"
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
        <div className="pointer-events-none absolute inset-0 rounded-full bg-table-spotlight" />
        {/* 桌面暗角层（四周压暗） */}
        <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,transparent_48%,rgba(0,0,0,0.45)_100%)]" />
        {/* 中央池底 - 精致化 */}
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3">
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
          <div className="flex gap-4 text-xs text-text-lo">
            <div className="flex items-center gap-1.5">
              <span>{zhCN.createTable.ante}:</span>
              <ChipStack amount={ante} size={12} />
              <span className="font-mono">{ante}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>{zhCN.table.currentBet}:</span>
              <ChipStack amount={current_bet} size={12} />
              <span className="font-mono">{current_bet}</span>
            </div>
          </div>
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

        {/* 玩家围坐 */}
        {arranged.map((p, i) => {
          const angle = (i / arranged.length) * 2 * Math.PI - Math.PI / 2;
          const radius = 40;
          const x = 50 + radius * Math.cos(angle);
          const y = 50 + radius * Math.sin(angle);
          const isMe = p.sid === mySid;
          const isCurrentTurn = current_turn?.sid === p.sid;
          const hasLooked = looked[p.sid] ?? false;

          // 底牌：自己看过后显示，摊牌时显示（暂简化）
          const hole = isMe && iLooked && privateState ? privateState.hole : [];

          return (
            <div
              key={p.sid}
              className="absolute"
              style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
            >
              <SeatCard player={p} isCurrentTurn={isCurrentTurn} isMe={isMe} deadline={isCurrentTurn && current_turn?.deadline ? new Date(current_turn.deadline).getTime() : undefined} />
              {/* 牌片（3 张） + 看牌覆盖层 */}
              <div className="relative mt-2">
                <div className="flex justify-center gap-1">
                  {hole.length > 0 ? (
                    // 已看牌：显示真实牌面，3D 翻面动画
                    hole.map((c, j) => (
                      <motion.div
                        key={j}
                        initial={{ rotateY: 90 }}
                        animate={{ rotateY: 0 }}
                        transition={{ duration: 0.6, delay: j * 0.1 }}
                      >
                        <CardSprite card={c} className="scale-75" />
                      </motion.div>
                    ))
                  ) : (
                    // 未看牌 / 对手：背面
                    <>
                      <CardSprite className="scale-75" />
                      <CardSprite className="scale-75" />
                      <CardSprite className="scale-75" />
                    </>
                  )}
                </div>
                {/* 看牌覆盖层（未看时显示，点击触发 look action） */}
                {isMe && !iLooked && (
                  <button
                    onClick={handleLook}
                    className="absolute inset-0 flex items-center justify-center rounded-card bg-black/80 text-gold transition hover:bg-black/90"
                  >
                    <span className="text-lg font-bold">{zhCN.actions.look}</span>
                  </button>
                )}
              </div>
              {/* 看牌状态标识 */}
              {hasLooked && (
                <div className="mt-1 text-center text-xs text-gold">
                  {zhCN.actions.look}✓
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
