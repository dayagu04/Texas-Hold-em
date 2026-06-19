/*
 * 掼蛋 Board（docs/UI-DESIGN.md §7.2 GuandanBoard）。
 * 4 个固定座位（北/西/南/东，南=自己），搭档关系连线（0↔2 暗金虚线）。
 * 中央显示"上家出牌"区，左下角己方手牌（按花色排序，可拖拽多选）。
 * 顶部小标签显示当前级牌 `打 2`。
 * 出牌按钮：`出牌(N)` 按所选张数动态变；`要不起`代替 pass。
 * M3 骨架版：布局 + 手牌展示；M4 精修多选 / 拖拽 / 搭档连线动画。
 */
import { useState } from "react";
import { zhCN } from "../../i18n/zh-CN";
import CardSprite from "../CardSprite";
import SeatCard from "../SeatCard";
import type { GuandanTableState, PrivateState } from "../../types";

interface Props {
  state: GuandanTableState;
  privateState: PrivateState | null;
  mySid: string;
}

export default function GuandanBoard({ state, privateState, mySid }: Props) {
  const { players, payload, current_turn, stage } = state;
  const { level_card, last_play, hand_counts, team_a } = payload;
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // 固定 4 座位：南(自己) / 西 / 北 / 东
  const myIdx = players.findIndex((p) => p.sid === mySid);
  const positions = ["南", "西", "北", "东"];
  const arranged =
    myIdx >= 0 ? [...players.slice(myIdx), ...players.slice(0, myIdx)] : players;

  const stageText = zhCN.stage[stage] ?? stage;
  const myTeam = team_a.includes(mySid) ? "A" : "B";

  // 己方手牌（从 privateState 取，M3 简化不做花色排序）
  const myHole = privateState?.hole ?? [];

  const toggleCard = (idx: number) => {
    const next = new Set(selected);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setSelected(next);
  };

  return (
    <div className="relative h-full">
      {/* 顶部标签：级牌 + 队伍 */}
      <div className="absolute left-1/2 top-4 flex -translate-x-1/2 gap-4 text-sm text-text-hi">
        <span className="rounded-full border border-gold bg-base/80 px-3 py-1 backdrop-blur-sm">
          {zhCN.table.levelCard(String(level_card))}
        </span>
        <span className="rounded-full border border-rim bg-base/80 px-3 py-1 backdrop-blur-sm">
          {zhCN.table.team(myTeam)}
        </span>
      </div>

      {/* 中央出牌区 */}
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3">
        <div className="rounded-panel border border-gold/50 bg-base/80 px-6 py-3 text-center shadow-elev backdrop-blur-sm">
          <div className="mb-1 text-xs text-text-lo">上家出牌</div>
          {last_play ? (
            <div className="flex gap-1">
              {last_play.cards.map((c, i) => (
                <CardSprite key={i} card={c} className="scale-75" />
              ))}
            </div>
          ) : (
            <div className="text-sm text-text-lo">无</div>
          )}
        </div>
        <div className="rounded-full border border-rim bg-base/60 px-4 py-1 text-sm text-text-hi backdrop-blur-sm">
          {stageText}
        </div>
      </div>

      {/* 4 座位固定布局 */}
      {arranged.map((p, i) => {
        const pos = positions[i];
        const coords =
          pos === "南"
            ? { bottom: "5%", left: "50%", transform: "translateX(-50%)" }
            : pos === "西"
              ? { left: "5%", top: "50%", transform: "translateY(-50%)" }
              : pos === "北"
                ? { top: "5%", left: "50%", transform: "translateX(-50%)" }
                : { right: "5%", top: "50%", transform: "translateY(-50%)" };
        const isMe = p.sid === mySid;
        const isCurrentTurn = current_turn?.sid === p.sid;
        const count = hand_counts[p.sid] ?? 0;

        return (
          <div key={p.sid} className="absolute" style={coords as React.CSSProperties}>
            <SeatCard player={p} isCurrentTurn={isCurrentTurn} isMe={isMe} deadline={isCurrentTurn && current_turn?.deadline ? new Date(current_turn.deadline).getTime() : undefined} />
            <div className="mt-1 text-center text-xs text-text-lo">
              {pos} · 剩 {count} 张
            </div>
          </div>
        );
      })}

      {/* 搭档连线（M3 简化：不画线，M4 精修） */}

      {/* 己方手牌区（左下角，可多选） */}
      {myHole.length > 0 && (
        <div className="absolute bottom-4 left-4 right-4 flex justify-center">
          <div className="flex flex-wrap gap-1">
            {myHole.map((c, i) => (
              <button
                key={i}
                onClick={() => toggleCard(i)}
                className={`transition ${selected.has(i) ? "-translate-y-2" : ""}`}
              >
                <CardSprite card={c} className="scale-90" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
