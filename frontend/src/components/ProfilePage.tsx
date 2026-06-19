/*
 * 个人中心页面。
 * 显示当前头像（可上传）、积分卡片、对局历史。
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import * as api from "../api";
import { zhCN } from "../i18n/zh-CN";
import Avatar from "./Avatar";
import CardSprite from "./CardSprite";
import { parseCards } from "../utils/cards";
import type {
  HandHistory,
  HandHistoryPlayer,
  HandResultOutcome,
  ProfileStats,
} from "../types";

/* 结果文案 + 着色（won 金 / lost 红 / folded 灰）。 */
const RESULT_LABEL: Record<HandResultOutcome, string> = {
  won: "赢",
  lost: "输",
  folded: "弃牌",
};
const RESULT_COLOR: Record<HandResultOutcome, string> = {
  won: "text-gold",
  lost: "text-danger",
  folded: "text-text-lo",
};

/** 净输赢着色：正绿（用 gold 区分赢钱）/ 负红 / 0 灰。 */
function netClass(net: number): string {
  if (net > 0) return "text-gold";
  if (net < 0) return "text-danger";
  return "text-text-lo";
}
function netLabel(net: number): string {
  return net > 0 ? `+${net}` : `${net}`;
}

/** ended_at（ISO）→ 友好时间。 */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export default function ProfilePage() {
  const { name } = useAuth();
  const navigate = useNavigate();
  const [avatar, setAvatar] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [history, setHistory] = useState<HandHistory[] | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // 头像 + 积分（me 也带 points，但 stats 更全）
    api
      .me()
      .then((res) => setAvatar(res.avatar ?? null))
      .catch(() => setAvatar(null));

    api
      .getStats()
      .then(setStats)
      .catch(() => setStats(null));

    api
      .getHistory(20)
      .then((res) => setHistory(res.history))
      .catch(() => setHistory([]));
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setError("仅支持 PNG 和 JPEG 格式");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("文件大小不能超过 2MB");
      return;
    }

    setError(null);
    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = (ev) => {
      setPreviewUrl(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setError(null);
    try {
      const res = await api.uploadAvatar(selectedFile);
      setAvatar(res.avatar);
      setPreviewUrl(null);
      setSelectedFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const currentAvatar = previewUrl ?? avatar;
  const winRate =
    stats && stats.hands_played > 0
      ? Math.round((stats.hands_won / stats.hands_played) * 100)
      : 0;

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
          <button
            onClick={() => navigate("/lobby")}
            className="rounded-card border border-rim px-3 py-1 text-sm text-text-lo transition hover:border-gold/50 hover:text-text-hi"
          >
            返回大厅
          </button>
        </div>
      </header>

      {/* 主内容 */}
      <main className="mx-auto max-w-2xl space-y-6 px-6 py-12">
        {/* 资料卡（用户名 + 头像） */}
        <div className="rounded-panel border border-gold/30 bg-elev p-8 shadow-card">
          <h2 className="mb-6 text-2xl font-bold text-text-hi">个人中心</h2>

          <div className="mb-8">
            <div className="text-sm text-text-lo">用户名</div>
            <div className="text-xl font-medium text-text-hi">{name}</div>
          </div>

          <div className="mb-6">
            <div className="mb-3 text-sm text-text-lo">头像</div>
            <div className="flex items-center gap-6">
              <Avatar
                src={currentAvatar}
                name={name}
                className="h-24 w-24 border-2 border-gold/30 text-4xl"
              />

              <div className="flex-1">
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={handleFileSelect}
                  className="mb-2 text-sm text-text-lo"
                  id="avatar-input"
                />
                <div className="text-xs text-text-lo">
                  支持 PNG 和 JPEG，最大 2MB
                </div>
              </div>
            </div>

            {error && <div className="mt-3 text-sm text-danger">{error}</div>}
          </div>

          {selectedFile && (
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="rounded-card bg-gold px-6 py-2 font-bold text-base transition hover:bg-gold-soft disabled:opacity-50"
            >
              {uploading ? "上传中..." : "上传头像"}
            </button>
          )}
        </div>

        {/* 积分卡片 */}
        <div className="rounded-panel border border-gold/30 bg-elev p-8 shadow-card">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="mb-1 text-sm text-text-lo">我的积分</div>
              <div
                className="text-5xl font-bold text-gold"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {stats ? stats.points.toLocaleString("en-US") : "—"}
              </div>
            </div>
            <div className="flex gap-6 text-sm">
              <Metric label="总局数" value={stats ? stats.hands_played : "—"} />
              <Metric label="胜场" value={stats ? stats.hands_won : "—"} />
              <Metric label="胜率" value={stats ? `${winRate}%` : "—"} />
              <Metric
                label="累计盈亏"
                value={stats ? netLabel(stats.total_net) : "—"}
                valueClass={stats ? netClass(stats.total_net) : "text-text-hi"}
              />
            </div>
          </div>
        </div>

        {/* 对局历史 */}
        <div className="rounded-panel border border-gold/30 bg-elev p-6 shadow-card">
          <h3 className="mb-4 text-lg font-bold text-text-hi">对局历史</h3>

          {history === null ? (
            <div className="py-8 text-center text-sm text-text-lo">
              {zhCN.common.loading}
            </div>
          ) : history.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-lo">
              暂无对局记录
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((h) => (
                <HistoryCard
                  key={h.hand_id}
                  hand={h}
                  expanded={!!expanded[h.hand_id]}
                  onToggle={() =>
                    setExpanded((prev) => ({
                      ...prev,
                      [h.hand_id]: !prev[h.hand_id],
                    }))
                  }
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Metric({
  label,
  value,
  valueClass = "text-text-hi",
}: {
  label: string;
  value: string | number;
  valueClass?: string;
}) {
  return (
    <div className="text-center">
      <div className={`text-lg font-semibold ${valueClass}`}>{value}</div>
      <div className="mt-0.5 text-xs text-text-lo">{label}</div>
    </div>
  );
}

/* 一局历史卡片：概要 + 我的牌 + 公共牌 + 可展开同局玩家。 */
function HistoryCard({
  hand,
  expanded,
  onToggle,
}: {
  hand: HandHistory;
  expanded: boolean;
  onToggle: () => void;
}) {
  const myCards = parseCards(hand.me.hole);
  const boardCards = parseCards(hand.board);

  return (
    <div className="rounded-card border border-rim/70 bg-base/50 p-4">
      {/* 概要行 */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="rounded bg-elev px-2 py-0.5 text-xs font-medium text-text-hi">
            {zhCN.gameType[hand.game_type]}
          </span>
          <span className="text-xs text-text-lo">
            {formatTime(hand.ended_at)}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-text-lo">
            底池{" "}
            <span
              className="font-semibold text-gold"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {hand.pot.toLocaleString("en-US")}
            </span>
          </span>
          <span className={`font-semibold ${RESULT_COLOR[hand.me.result]}`}>
            {RESULT_LABEL[hand.me.result]}
          </span>
          <span
            className={`font-semibold ${netClass(hand.me.net)}`}
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {netLabel(hand.me.net)}
          </span>
        </div>
      </div>

      {/* 我的牌 + 公共牌 */}
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <div className="mb-1 text-xs text-text-lo">我的牌</div>
          <CardRow cards={myCards} emptyHint="未亮牌" />
        </div>
        {boardCards.length > 0 && (
          <div>
            <div className="mb-1 text-xs text-text-lo">公共牌</div>
            <CardRow cards={boardCards} emptyHint="" />
          </div>
        )}
      </div>

      {/* 展开同局玩家 */}
      {hand.players.length > 0 && (
        <>
          <button
            onClick={onToggle}
            className="mt-3 text-xs text-text-lo transition hover:text-gold"
          >
            {expanded
              ? "收起本局玩家 ▲"
              : `查看本局玩家 (${hand.players.length}) ▼`}
          </button>
          {expanded && (
            <div className="mt-3 space-y-2 border-t border-rim/50 pt-3">
              {hand.players.map((p) => (
                <PlayerRow key={`${p.seat}-${p.name}`} player={p} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CardRow({ cards, emptyHint }: { cards: ReturnType<typeof parseCards>; emptyHint: string }) {
  if (cards.length === 0) {
    return emptyHint ? (
      <span className="text-xs text-text-lo">{emptyHint}</span>
    ) : null;
  }
  return (
    <div className="flex gap-1">
      {cards.map((c, i) => (
        <CardSprite key={`${c.code}-${i}`} card={c} className="h-12 w-9" />
      ))}
    </div>
  );
}

function PlayerRow({ player }: { player: HandHistoryPlayer }) {
  const cards = parseCards(player.hole);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-hi">{player.name}</span>
        {player.is_bot && (
          <span className="text-xs text-gold/80" title="AI">
            🤖
          </span>
        )}
        <CardRow cards={cards} emptyHint="未亮牌" />
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-text-lo">
          下注{" "}
          <span style={{ fontFamily: "var(--font-mono)" }}>
            {player.total_bet.toLocaleString("en-US")}
          </span>
        </span>
        <span className={RESULT_COLOR[player.result]}>
          {RESULT_LABEL[player.result]}
        </span>
        <span
          className={`font-semibold ${netClass(player.net)}`}
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {netLabel(player.net)}
        </span>
      </div>
    </div>
  );
}
