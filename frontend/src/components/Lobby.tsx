/*
 * 大厅页（docs/UI-DESIGN.md §6）。
 * 左侧筛选（玩法 / 状态），右侧房间网格（响应式 1/2/3 列）。
 * 玩法 tag 配色（德扑深红 / 掼蛋深蓝 / 炸金花暗紫），右上 🤖 标识。
 * 状态徽标：等待灰色虚线 / 进行中金色实心。
 * 右下 + 新建 按钮触发 CreateTableModal（M2 后半）。
 * 进入时 connectSocket，挂 ReconnectBanner。
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../hooks/useSocket";
import { useAuth } from "../auth";
import { connectSocket } from "../socket";
import { zhCN } from "../i18n/zh-CN";
import * as api from "../api";
import CreateTableModal from "./CreateTableModal";
import ReconnectBanner from "./ReconnectBanner";
import Avatar from "./Avatar";
import Leaderboard from "./Leaderboard";
import type { GameType, LobbyTable, TableStatus } from "../types";

const TAG_BG: Record<GameType, string> = {
  texas: "bg-[var(--color-tag-texas)]",
  guandan: "bg-[var(--color-tag-guandan)]",
  brag: "bg-[var(--color-tag-brag)]",
};

export default function Lobby() {
  const { subscribe, emit } = useSocket();
  const { name, signOut } = useAuth();
  const navigate = useNavigate();
  const [tables, setTables] = useState<LobbyTable[]>([]);
  const [filterGame, setFilterGame] = useState<GameType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<Set<TableStatus>>(
    new Set(["waiting", "playing"]),
  );
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [points, setPoints] = useState<number | null>(null);
  const [quickMatchGameType, setQuickMatchGameType] = useState<GameType | null>(null);

  // 进入大厅时建立 socket 连接（幂等）
  useEffect(() => {
    connectSocket();
  }, []);

  // 加载头像 + 积分
  useEffect(() => {
    api
      .me()
      .then((res) => {
        setAvatar(res.avatar ?? null);
        setPoints(res.points ?? null);
      })
      .catch(() => {
        setAvatar(null);
        setPoints(null);
      });
  }, []);

  useEffect(() => {
    const off = subscribe("lobby:update", (data) => setTables(data.tables));
    emit("lobby:list", {});
    return off;
  }, [subscribe, emit]);

  // 处理 lobby:no_match（快速匹配无房间时引导创建）
  useEffect(() => {
    const off = subscribe("lobby:no_match", (data: { game_type: GameType }) => {
      if (confirm(zhCN.lobby.noMatchFound)) {
        setQuickMatchGameType(data.game_type);
        setShowCreateModal(true);
      }
    });
    return off;
  }, [subscribe]);

  const handleLogout = () => {
    signOut();
    navigate("/login", { replace: true });
  };

  const join = (t: LobbyTable) => {
    emit("lobby:join_table", { table_id: t.id });
    navigate(`/table/${t.id}`);
  };

  // 稳定引用:内联箭头每次渲染换新引用,会让 CreateTableModal 的
  // useEffect 频繁重订阅,localhost 极快的后端响应会落进解除/重订阅的
  // 窗口里丢失 → 模态框卡"创建中"。navigate 是稳定引用。
  // (见 docs/features/bugfix-create-stuck-card-display.md)
  const handleCreated = useCallback(
    (id: string) => {
      setShowCreateModal(false);
      setQuickMatchGameType(null);
      navigate(`/table/${id}`);
    },
    [navigate],
  );

  const handleQuickMatch = (gameType: GameType) => {
    emit("lobby:quick_match", { game_type: gameType });
  };

  const toggleStatus = (s: TableStatus) => {
    const next = new Set(filterStatus);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setFilterStatus(next);
  };

  const filtered = tables.filter(
    (t) =>
      (filterGame === "all" || t.game_type === filterGame) &&
      filterStatus.has(t.status),
  );

  return (
    <div className="min-h-screen bg-vignette">
      {/* ReconnectBanner（仅在需要 socket 的页面挂载） */}
      <ReconnectBanner />
      {/* 顶部栏 */}
      <header className="border-b border-rim/50 bg-base/80 px-6 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <h1
            className="text-2xl text-gold"
            style={{ fontFamily: "var(--font-brand)" }}
          >
            {zhCN.brand}
          </h1>
          <div className="flex items-center gap-3 text-text-lo">
            {/* 头像 */}
            <Avatar
              src={avatar}
              name={name}
              className="h-10 w-10 border border-gold/30"
            />
            <div className="flex flex-col leading-tight">
              <span className="text-text-hi">{name}</span>
              {points !== null && (
                <span
                  className="text-xs text-gold"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  积分 {points.toLocaleString("en-US")}
                </span>
              )}
            </div>
            <button
              onClick={() => navigate("/profile")}
              className="rounded-card border border-rim px-3 py-1 text-sm transition hover:border-gold/50"
            >
              个人中心
            </button>
            <button
              onClick={handleLogout}
              className="rounded-card border border-rim px-3 py-1 text-sm transition hover:border-gold/50"
            >
              {zhCN.common.logout}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl p-6">
        {/* 快速开局按钮组 */}
        <div className="mb-6 rounded-panel border border-gold/30 bg-elev p-4 shadow-card">
          <h3 className="mb-3 text-sm font-medium text-text-hi">
            {zhCN.lobby.quickMatch}
          </h3>
          <div className="flex gap-3">
            {(["texas", "guandan", "brag"] as const).map((game) => (
              <button
                key={game}
                onClick={() => handleQuickMatch(game)}
                className="flex-1 rounded-card border border-gold/50 bg-gold/5 px-4 py-2 text-sm font-medium text-gold transition hover:bg-gold/10"
              >
                {zhCN.gameType[game]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-6">
          {/* 左侧筛选 */}
          <aside className="w-48 flex-shrink-0">
            <div className="sticky top-6 rounded-panel border border-gold/30 bg-elev p-4">
              <h3 className="mb-3 text-sm font-medium text-text-hi">
                {zhCN.lobby.filterGame}
              </h3>
              <div className="mb-4 space-y-2 text-sm">
                {(["all", "texas", "guandan", "brag"] as const).map((g) => (
                  <label
                    key={g}
                    className="flex cursor-pointer items-center gap-2 text-text-lo transition hover:text-text-hi"
                  >
                    <input
                      type="radio"
                      name="game"
                      checked={filterGame === g}
                      onChange={() => setFilterGame(g)}
                      className="accent-gold"
                    />
                    {g === "all"
                      ? zhCN.lobby.all
                      : zhCN.gameType[g as GameType]}
                  </label>
                ))}
              </div>

              <h3 className="mb-3 text-sm font-medium text-text-hi">
                {zhCN.lobby.filterStatus}
              </h3>
              <div className="space-y-2 text-sm">
                {(["waiting", "playing"] as const).map((s) => (
                  <label
                    key={s}
                    className="flex cursor-pointer items-center gap-2 text-text-lo transition hover:text-text-hi"
                  >
                    <input
                      type="checkbox"
                      checked={filterStatus.has(s)}
                      onChange={() => toggleStatus(s)}
                      className="accent-gold"
                    />
                    {s === "waiting"
                      ? zhCN.lobby.statusWaiting
                      : zhCN.lobby.statusPlaying}
                  </label>
                ))}
              </div>

              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-6 w-full rounded-card bg-gold py-2 text-sm font-bold text-base transition hover:bg-gold-soft"
              >
                + {zhCN.lobby.createTable}
              </button>
            </div>
          </aside>

          {/* 中间房间网格 */}
          <main className="flex-1">
            {filtered.length === 0 ? (
              <p className="py-16 text-center text-text-lo">
                {zhCN.lobby.empty}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((t) => (
                  <article
                    key={t.id}
                    className="relative rounded-panel border border-gold/30 bg-elev p-4 shadow-card transition hover:border-gold/50"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium text-text-hi ${TAG_BG[t.game_type]}`}
                      >
                        {zhCN.gameTag[t.game_type]}
                      </span>
                      {t.has_bots && (
                        <span title={zhCN.lobby.hasBots} className="text-base">
                          🤖
                        </span>
                      )}
                    </div>
                    <h3 className="mb-1 font-medium text-text-hi">{t.name}</h3>
                    <div className="mb-3 flex items-center gap-2 text-sm text-text-lo">
                      <span>{zhCN.lobby.seats(t.seats_taken, t.seats_total)}</span>
                      <span className="text-rim">·</span>
                      <span
                        className={`inline-flex items-center gap-1 ${
                          t.status === "waiting"
                            ? "text-text-lo"
                            : "font-medium text-gold"
                        }`}
                      >
                        {t.status === "waiting" ? (
                          <>
                            <span className="inline-block h-2 w-2 rounded-full border border-dashed border-text-lo"></span>
                            {zhCN.lobby.statusWaiting}
                          </>
                        ) : (
                          <>
                            <span className="inline-block h-2 w-2 rounded-full bg-gold"></span>
                            {zhCN.lobby.statusPlaying}
                          </>
                        )}
                      </span>
                    </div>
                    <button
                      onClick={() => join(t)}
                      className="w-full rounded-card bg-gold py-2 text-sm font-bold text-base transition hover:bg-gold-soft"
                    >
                      {t.status === "playing" && t.spectatable
                        ? zhCN.common.spectate
                        : zhCN.common.sit}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </main>

          {/* 右侧积分榜 */}
          <aside className="w-64 flex-shrink-0">
            <div className="sticky top-6">
              <Leaderboard />
            </div>
          </aside>
        </div>
      </div>

      {showCreateModal && (
        <CreateTableModal
          onClose={() => {
            setShowCreateModal(false);
            setQuickMatchGameType(null);
          }}
          onCreated={handleCreated}
          preselectedGame={quickMatchGameType ?? undefined}
        />
      )}
    </div>
  );
}
