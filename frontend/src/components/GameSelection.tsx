/*
 * 游戏选择主页（公开页面，不需登录）。
 * 三个游戏卡片（德州扑克、掼蛋、炸金花），每个卡片展示：
 * - 游戏名称 + 玩法介绍（2-3 句，来自 GAME-RULES.md）
 * - 开始游戏按钮（未登录弹登录框，已登录直接跳 /lobby）
 * 右上角：未登录显示[登录]按钮，已登录显示头像+用户名+退出。
 * 视觉：赌场暗金主题 + framer-motion 淡入淡出动效。
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../auth";
import { zhCN } from "../i18n/zh-CN";
import LoginModal from "./LoginModal";
import type { GameType } from "../types";
import { MOTION } from "../theme/motion";

interface GameInfo {
  type: GameType;
  icon: string;
  title: string;
  description: string[];
  tagBg: string;
}

const GAMES: GameInfo[] = [
  {
    type: "texas",
    icon: "♠",
    title: "德州扑克",
    description: ["2-6 人，4 街下注", "最强 5 张牌组合获胜", "经典策略博弈"],
    tagBg: "bg-[var(--color-tag-texas)]",
  },
  {
    type: "guandan",
    icon: "🃏",
    title: "掼蛋",
    description: ["4 人 2v2 搭档", "先出完牌的队伍获胜", "炸弹最大，配合取胜"],
    tagBg: "bg-[var(--color-tag-guandan)]",
  },
  {
    type: "brag",
    icon: "🎴",
    title: "炸金花",
    description: ["2-6 人，3 张比大小", "豹子>顺金>金花>顺子>对子>散牌", "盲下刺激比牌"],
    tagBg: "bg-[var(--color-tag-brag)]",
  },
];

export default function GameSelection() {
  const { name, isAuthed, signOut } = useAuth();
  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);

  const handleStartGame = () => {
    if (isAuthed) {
      // 已登录，直接进大厅
      navigate("/lobby");
    } else {
      // 未登录，弹登录框
      setShowLoginModal(true);
    }
  };

  const handleLogout = () => {
    signOut();
    // 退出后留在主页（主页公开）
  };

  const handleLoginSuccess = () => {
    // 登录成功后跳大厅
    navigate("/lobby");
  };

  return (
    <div className="min-h-screen bg-vignette">
      {/* 顶部栏 */}
      <header className="border-b border-rim/50 bg-base/80 px-6 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <h1
            className="text-2xl text-gold"
            style={{ fontFamily: "var(--font-brand)" }}
          >
            {zhCN.brand}
          </h1>
          <div className="flex items-center gap-4">
            {isAuthed ? (
              // 已登录：头像 + 用户名 + 退出
              <div className="flex items-center gap-3">
                {/* 头像（首字母圆形） */}
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold text-base font-bold">
                  {name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <span className="text-text-hi">{name}</span>
                <button
                  onClick={handleLogout}
                  className="rounded-card border border-rim px-3 py-1 text-sm text-text-lo transition hover:border-gold/50 hover:text-text-hi"
                >
                  {zhCN.common.logout}
                </button>
              </div>
            ) : (
              // 未登录：登录按钮
              <button
                onClick={() => setShowLoginModal(true)}
                className="rounded-card bg-gold px-6 py-2 font-bold text-base transition hover:bg-gold-soft hover:shadow-lg"
              >
                {zhCN.login.title}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="mx-auto max-w-6xl px-6 py-16">
        {/* 标题区 */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: MOTION.base }}
          className="mb-12 text-center"
        >
          <h2
            className="mb-3 text-4xl font-bold text-gold"
            style={{ fontFamily: "var(--font-brand)" }}
          >
            {zhCN.gameSelection.title}
          </h2>
          <p className="text-lg text-text-lo">{zhCN.gameSelection.subtitle}</p>
        </motion.div>

        {/* 游戏卡片网格 */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {GAMES.map((game, idx) => (
            <motion.article
              key={game.type}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: MOTION.slow,
                delay: idx * 0.15,
              }}
              whileHover={{ scale: 1.03 }}
              className="group relative rounded-panel border border-gold/30 bg-elev p-8 shadow-card transition-colors hover:border-gold/60"
            >
              {/* 顶部标签 */}
              <div className="mb-6 flex items-center justify-between">
                <span
                  className={`rounded px-3 py-1 text-xs font-medium text-text-hi ${game.tagBg}`}
                >
                  {zhCN.gameTag[game.type]}
                </span>
                <span className="text-5xl opacity-80 transition-opacity group-hover:opacity-100">
                  {game.icon}
                </span>
              </div>

              {/* 游戏标题 */}
              <h3 className="mb-4 text-2xl font-bold text-text-hi">
                {game.title}
              </h3>

              {/* 玩法描述 */}
              <ul className="mb-6 space-y-2">
                {game.description.map((line, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-text-lo">
                    <span className="mt-1 inline-block h-1 w-1 flex-shrink-0 rounded-full bg-gold"></span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              {/* 开始游戏按钮 */}
              <button
                onClick={handleStartGame}
                className="w-full rounded-card bg-gold py-3 font-bold text-base transition hover:bg-gold-soft hover:shadow-lg"
              >
                {zhCN.gameSelection.startGame}
              </button>

              {/* 悬停发光效果 */}
              <div className="pointer-events-none absolute inset-0 rounded-panel opacity-0 transition-opacity group-hover:opacity-100">
                <div
                  className="absolute inset-0 rounded-panel"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 50%, rgba(201, 161, 74, 0.1) 0%, transparent 70%)",
                  }}
                />
              </div>
            </motion.article>
          ))}
        </div>

        {/* 底部提示 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: MOTION.base, delay: 0.6 }}
          className="mt-16 text-center text-sm text-text-lo"
        >
          <p>{zhCN.gameSelection.hint}</p>
        </motion.div>
      </main>

      {/* 登录弹窗 */}
      {showLoginModal && (
        <LoginModal
          onClose={() => setShowLoginModal(false)}
          onSuccess={handleLoginSuccess}
        />
      )}
    </div>
  );
}
