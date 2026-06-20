/*
 * 回放播放器 Modal (#013)。
 * 拉取 ReplayData，逐步重建桌面状态，复用牌桌只读渲染。
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import * as api from "../api";
import { zhCN } from "../i18n/zh-CN";
import type { ReplayData, ReplayAction } from "../types";
import CardSprite from "./CardSprite";
import { parseCards } from "../utils/cards";

interface Props {
  handId: string;
  onClose: () => void;
}

export default function ReplayModal({ handId, onClose }: Props) {
  const [data, setData] = useState<ReplayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getHandReplay(handId)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "加载失败");
        setLoading(false);
      });
  }, [handId]);

  // 自动播放
  useEffect(() => {
    if (!playing || !data || currentStep >= data.actions.length) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      setCurrentStep((s) => s + 1);
    }, 1500); // 1.5 秒一步
    return () => clearTimeout(timer);
  }, [playing, currentStep, data]);

  if (loading) {
    return (
      <ModalShell onClose={onClose}>
        <div className="py-12 text-center text-text-lo">{zhCN.common.loading}</div>
      </ModalShell>
    );
  }

  if (error || !data) {
    return (
      <ModalShell onClose={onClose}>
        <div className="py-12 text-center">
          <div className="mb-4 text-danger">{error ?? "无法加载回放"}</div>
          <button
            onClick={onClose}
            className="rounded-card border border-rim px-4 py-2 text-sm text-text-hi transition hover:border-gold/50"
          >
            关闭
          </button>
        </div>
      </ModalShell>
    );
  }

  // 老局无回放数据
  if (data.actions.length === 0) {
    return (
      <ModalShell onClose={onClose}>
        <div className="py-12 text-center">
          <div className="mb-4 text-text-lo">该局无回放数据</div>
          <button
            onClick={onClose}
            className="rounded-card border border-rim px-4 py-2 text-sm text-text-hi transition hover:border-gold/50"
          >
            关闭
          </button>
        </div>
      </ModalShell>
    );
  }

  const action = currentStep < data.actions.length ? data.actions[currentStep] : null;
  const visibleActions = data.actions.slice(0, currentStep + 1);

  const handlePrev = () => {
    setPlaying(false);
    setCurrentStep((s) => Math.max(0, s - 1));
  };

  const handleNext = () => {
    setPlaying(false);
    setCurrentStep((s) => Math.min(data.actions.length - 1, s + 1));
  };

  const handlePlayPause = () => {
    if (currentStep >= data.actions.length - 1) {
      setCurrentStep(0);
      setPlaying(true);
    } else {
      setPlaying(!playing);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <div className="space-y-4">
        {/* 头部信息 */}
        <div className="flex items-center justify-between">
          <div>
            <span className="rounded bg-elev px-2 py-0.5 text-xs font-medium text-text-hi">
              {zhCN.gameType[data.game_type]}
            </span>
            <span className="ml-3 text-sm text-text-lo">
              底池 <span className="font-semibold text-gold">{data.pot}</span>
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-text-lo transition hover:text-text-hi"
          >
            ✕
          </button>
        </div>

        {/* 简化桌面：玩家横排 + 公共牌 */}
        <div className="rounded-card border border-rim/70 bg-base/50 p-6">
          {/* 玩家 */}
          <div className="mb-6 flex flex-wrap justify-center gap-4">
            {data.players.map((p) => {
              const hole = parseCards(p.hole);
              return (
                <div
                  key={`${p.seat}-${p.name}`}
                  className="rounded-card border border-rim/50 bg-elev/50 px-3 py-2 text-center"
                >
                  <div className="mb-1 text-sm font-medium text-text-hi">
                    {p.name}
                    {p.is_bot && <span className="ml-1 text-xs text-gold/80">🤖</span>}
                  </div>
                  {hole.length > 0 && (
                    <div className="flex justify-center gap-1">
                      {hole.map((c, i) => (
                        <CardSprite key={`${c.code}-${i}`} card={c} className="h-12 w-9" />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 公共牌 */}
          {data.board && (
            <div className="mb-4 flex justify-center">
              <div>
                <div className="mb-2 text-center text-xs text-text-lo">公共牌</div>
                <div className="flex justify-center gap-2">
                  {parseCards(data.board).map((c, i) => (
                    <CardSprite key={`board-${c.code}-${i}`} card={c} className="h-16 w-12" />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 当前动作 */}
          {action && (
            <div className="mb-4 rounded-card border border-gold/30 bg-gold/5 px-4 py-2 text-center text-sm text-text-hi">
              <strong className="text-gold">{action.name}</strong> {actionLabel(action)}
            </div>
          )}
        </div>

        {/* 播放控制 */}
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={handlePrev}
            disabled={currentStep === 0}
            className="rounded-card border border-rim px-3 py-1.5 text-sm text-text-hi transition hover:border-gold/50 disabled:opacity-30"
          >
            ⏮ 上一步
          </button>

          <button
            onClick={handlePlayPause}
            className="rounded-card border border-gold/50 bg-gold/10 px-6 py-1.5 text-sm font-bold text-gold transition hover:bg-gold/20"
          >
            {playing ? "⏸ 暂停" : currentStep >= data.actions.length - 1 ? "⏮ 重播" : "▶ 播放"}
          </button>

          <button
            onClick={handleNext}
            disabled={currentStep >= data.actions.length - 1}
            className="rounded-card border border-rim px-3 py-1.5 text-sm text-text-hi transition hover:border-gold/50 disabled:opacity-30"
          >
            下一步 ⏭
          </button>
        </div>

        {/* 进度 */}
        <div className="text-center text-xs text-text-lo">
          {currentStep + 1} / {data.actions.length} 步
        </div>

        {/* 动作历史 */}
        <div className="max-h-32 overflow-y-auto rounded-card border border-rim/50 bg-base/30 p-3">
          <div className="space-y-1 text-xs">
            {visibleActions.map((a) => (
              <div key={a.seq} className="text-text-lo">
                <span className="text-text-hi">{a.name}</span> {actionLabel(a)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="relative w-full max-w-3xl rounded-panel border border-gold/30 bg-elev p-6 shadow-card"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function actionLabel(a: ReplayAction): string {
  const { action, payload } = a;
  switch (action) {
    case "fold":
      return "弃牌";
    case "check":
      return "过牌";
    case "call":
      return `跟注 ${payload?.amount ?? ""}`;
    case "raise":
      return `加注到 ${payload?.amount ?? ""}`;
    case "all_in":
      return "全下";
    case "play":
      return `出牌 ${payload?.cards ? (payload.cards as string[]).join(" ") : ""}`;
    case "pass":
      return "过";
    case "look":
      return "看牌";
    case "compare":
      return `比牌 vs ${payload?.target_name ?? ""}`;
    default:
      return action;
  }
}
