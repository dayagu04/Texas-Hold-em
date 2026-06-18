/*
 * 德州扑克 Board（docs/UI-DESIGN.md §7.2 TexasBoard）。
 * 中央椭圆桌 + 5 张公共牌居中 + pot 数字正下方 + side pots 小标签。
 * 玩家围坐（自己永远屏幕底部中央），显示 SeatCard + 底牌（摊牌时高亮）。
 * M3 骨架版：布局 + 状态渲染；M4 精修发牌动画 / 赢家光晕。
 */
import { zhCN } from "../../i18n/zh-CN";
import CardSprite from "../CardSprite";
import SeatCard from "../SeatCard";
import DealerButton from "../DealerButton";
import type { Card, PrivateState, TexasTableState } from "../../types";

interface Props {
  state: TexasTableState;
  privateState: PrivateState | null;
  mySid: string;
}

export default function TexasBoard({ state, privateState, mySid }: Props) {
  const { players, payload, current_turn, stage } = state;
  const { pot, side_pots, community, button_seat, player_bets } = payload;

  // 自己在底部中央，其余玩家围绕桌沿分布
  const myIdx = players.findIndex((p) => p.sid === mySid);
  const arranged =
    myIdx >= 0 ? [...players.slice(myIdx), ...players.slice(0, myIdx)] : players;

  const stageText = zhCN.stage[stage] ?? stage;

  return (
    <div className="relative h-full">
      {/* 椭圆桌面 */}
      <div className="absolute inset-10 rounded-[50%] border-8 border-rim bg-felt shadow-[inset_0_0_60px_rgba(0,0,0,0.6)]">
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

          {/* 公共牌 */}
          {community.length > 0 && (
            <div className="flex gap-2">
              {community.map((c, i) => (
                <CardSprite key={i} card={c} animate="flip" />
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
              {/* 底牌（自己 / 摊牌） */}
              {hole.length > 0 && (
                <div className="mt-2 flex justify-center gap-1">
                  {hole.map((c, j) => (
                    <CardSprite key={j} card={c} className="scale-75" />
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
      </div>
    </div>
  );
}
