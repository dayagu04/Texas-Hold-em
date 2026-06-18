/*
 * Bot 面板（docs/UI-DESIGN.md §2，M2 新增）。
 * 桌内空座位上的 + 按钮触发，选难度后发 table:add_bot；
 * 已有 bot 的座位显示 − 按钮，发 table:remove_bot。
 * M2 骨架：基础 UI + 事件；M3 接入 TableShell 时联动座位状态。
 */
import { useState } from "react";
import { zhCN } from "../i18n/zh-CN";
import { emit } from "../socket";
import type { BotLevel } from "../types";

interface Props {
  tableId: string;
  seat: number;
  onClose: () => void;
}

export default function BotPanel({ tableId, seat, onClose }: Props) {
  const [level, setLevel] = useState<BotLevel>("easy");

  const handleAdd = () => {
    emit("table:add_bot", { table_id: tableId, seat, level });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-80 rounded-panel border border-gold/40 bg-elev p-6 shadow-elev"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-medium text-text-hi">
          {zhCN.table.addBot} — {zhCN.createTable.seatLabel(seat)}
        </h3>
        <div className="mb-4 space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="level"
              checked={level === "easy"}
              onChange={() => setLevel("easy")}
              className="accent-gold"
            />
            <span className="text-text-hi">{zhCN.createTable.botEasy}</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="level"
              checked={level === "normal"}
              onChange={() => setLevel("normal")}
              className="accent-gold"
            />
            <span className="text-text-hi">{zhCN.createTable.botNormal}</span>
          </label>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-card border border-rim py-2 text-sm text-text-lo transition hover:border-gold/50 hover:text-text-hi"
          >
            {zhCN.common.cancel}
          </button>
          <button
            onClick={handleAdd}
            className="flex-1 rounded-card bg-gold py-2 text-sm font-bold text-base transition hover:bg-gold-soft"
          >
            {zhCN.common.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
