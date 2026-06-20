/*
 * 积分榜组件（大厅侧栏）。
 * 三个 tab 切换 metric（积分/净胜/胜率），前三名显示奖牌。
 */
import { useState, useEffect } from "react";
import * as api from "../api";
import { zhCN } from "../i18n/zh-CN";
import Avatar from "./Avatar";
import type { LeaderboardEntry, LeaderboardMetric } from "../types";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function Leaderboard() {
  const [metric, setMetric] = useState<LeaderboardMetric>("points");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, [metric]);

  const loadLeaderboard = async () => {
    setLoading(true);
    try {
      const res = await api.getLeaderboard(metric, 10);
      setEntries(res.entries);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const formatValue = (entry: LeaderboardEntry): string => {
    switch (metric) {
      case "points":
        return entry.points.toLocaleString("en-US");
      case "net":
        return entry.total_net > 0
          ? `+${entry.total_net.toLocaleString("en-US")}`
          : entry.total_net.toLocaleString("en-US");
      case "winrate":
        return `${Math.round(entry.winrate * 100)}%`;
    }
  };

  return (
    <div className="rounded-panel border border-gold/30 bg-elev p-4 shadow-card">
      <h3 className="mb-4 text-lg font-bold text-text-hi">
        {zhCN.leaderboard.title}
      </h3>

      {/* Tab 切换 */}
      <div className="mb-4 flex gap-2">
        <TabButton
          active={metric === "points"}
          onClick={() => setMetric("points")}
          label={zhCN.leaderboard.metricPoints}
        />
        <TabButton
          active={metric === "net"}
          onClick={() => setMetric("net")}
          label={zhCN.leaderboard.metricNet}
        />
        <TabButton
          active={metric === "winrate"}
          onClick={() => setMetric("winrate")}
          label={zhCN.leaderboard.metricWinrate}
        />
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="py-8 text-center text-sm text-text-lo">
          {zhCN.common.loading}
        </div>
      ) : entries.length === 0 ? (
        <div className="py-8 text-center text-sm text-text-lo">暂无数据</div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, index) => (
            <div
              key={entry.name}
              className="flex items-center gap-3 rounded-card border border-rim/50 bg-base/50 p-2 text-sm"
            >
              {/* 排名 + 奖牌 */}
              <div className="w-8 flex-shrink-0 text-center">
                {index < 3 ? (
                  <span className="text-lg">{MEDALS[index]}</span>
                ) : (
                  <span className="text-text-lo">{entry.rank}</span>
                )}
              </div>

              {/* 头像 */}
              <Avatar
                src={entry.avatar}
                name={entry.name}
                className="h-8 w-8 border border-gold/20 text-xs"
              />

              {/* 名字 */}
              <div className="flex-1 truncate text-text-hi">{entry.name}</div>

              {/* 数值 */}
              <div
                className="font-semibold text-gold"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {formatValue(entry)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded border px-2 py-1 text-xs font-medium transition ${
        active
          ? "border-gold bg-gold/10 text-gold"
          : "border-rim/50 text-text-lo hover:border-gold/50 hover:text-text-hi"
      }`}
    >
      {label}
    </button>
  );
}
