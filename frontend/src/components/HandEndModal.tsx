/*
 * 摊牌结算浮层（docs/features/006-hand-end-ui-multi-rounds.md §2.1）。
 * 收到 table:hand_end 后由 TableShell 渲染：展示每位参与者的底牌 + 手牌描述 + 盈亏，
 * 赢家金色高亮，弃牌玩家灰显。倒计时(next_hand_in) 到 0 自动 onClose；
 * next_hand_in=0 视为游戏结束（单局 / 限定局数打满），不自动关、只留"返回大厅"。
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import CardSprite from "./CardSprite";
import type { HandResult, PublicPlayer, TexasHandResult, BragHandResult } from "../types";

interface Props {
  results: HandResult[];
  players: PublicPlayer[];
  nextHandIn: number; // ms，0 = 不自动开下局（单局 / 已打满）
  onClose: () => void;
  onLeave: () => void;
}

// 类型守卫：德扑/炸金花有 sid/name/amount/cards/hand，掼蛋按队结算无这些字段
function isPlayerResult(r: HandResult): r is TexasHandResult | BragHandResult {
  return "sid" in r && "name" in r && "amount" in r;
}

export default function HandEndModal({
  results,
  players,
  nextHandIn,
  onClose,
  onLeave,
}: Props) {
  // 赢家在上：按盈亏降序。掼蛋结算不适用(按队),暂只排序玩家结算。
  const playerResults = results.filter(isPlayerResult);
  const ranked = [...playerResults].sort((a, b) => b.amount - a.amount);

  // 弃牌玩家：在 players 里但不在 results 里。
  const resultSids = new Set(ranked.map((r) => r.sid));
  const foldedPlayers = players.filter((p) => !resultSids.has(p.sid));

  // next_hand_in=0 表示本桌不再自动开局（游戏结束）。
  const willAutoStart = nextHandIn > 0;
  const [remaining, setRemaining] = useState(() =>
    willAutoStart ? Math.ceil(nextHandIn / 1000) : 0,
  );

  // 倒计时：每秒减 1，到 0 自动 onClose()。仅在 willAutoStart 时启动。
  useEffect(() => {
    if (!willAutoStart) return;
    if (remaining <= 0) {
      onClose();
      return;
    }
    const timer = setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining, willAutoStart, onClose]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          className="w-full max-w-xl rounded-panel border-2 border-gold bg-elev shadow-2xl"
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.2 }}
        >
          <header className="border-b border-rim/50 px-4 py-3 text-center">
            <h2 className="text-xl font-bold text-gold">🏆 一局结束</h2>
          </header>

          <div className="max-h-[50vh] space-y-2 overflow-y-auto p-4">
            {ranked.map((r) => {
              const isWinner = r.amount > 0;
              return (
                <div
                  key={r.sid}
                  className={`rounded-card border-2 px-4 py-3 ${
                    isWinner ? "border-gold bg-gold/5" : "border-rim/50"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium text-text-hi">
                      {isWinner && "🏆 "}
                      {r.name}
                    </span>
                    {r.amount > 0 ? (
                      <span className="font-bold text-[#5cb85c]">
                        +{r.amount}
                      </span>
                    ) : r.amount < 0 ? (
                      <span className="text-text-lo">{r.amount}</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    {r.cards && r.cards.length > 0 && (
                      <div className="flex gap-1">
                        {r.cards.map((c, i) => (
                          <CardSprite key={i} card={c} className="h-12 w-9" />
                        ))}
                      </div>
                    )}
                    {r.hand && (
                      <span className="text-sm text-text-lo">{r.hand}</span>
                    )}
                  </div>
                </div>
              );
            })}

            {foldedPlayers.map((p) => (
              <div
                key={p.sid}
                className="flex items-center justify-between rounded-card border-2 border-rim/50 px-4 py-3 opacity-50"
              >
                <span className="text-text-lo">{p.name}</span>
                <span className="text-sm text-text-lo">弃牌</span>
              </div>
            ))}
          </div>

          <footer className="flex items-center justify-between border-t border-rim/50 px-4 py-3">
            <span
              className={`text-sm ${
                willAutoStart && remaining < 2 ? "text-danger" : "text-text-lo"
              }`}
            >
              {willAutoStart
                ? `下一局倒计时：${remaining}s`
                : "游戏已结束"}
            </span>
            <div className="flex gap-3">
              {willAutoStart && (
                <button
                  onClick={onClose}
                  className="rounded-card border border-rim px-4 py-2 text-sm text-text-lo transition hover:border-gold/50 hover:text-text-hi"
                >
                  跳过等待
                </button>
              )}
              <button
                onClick={onLeave}
                className="rounded-card bg-gold px-4 py-2 text-sm font-bold text-base transition hover:bg-gold-soft"
              >
                返回大厅
              </button>
            </div>
          </footer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
