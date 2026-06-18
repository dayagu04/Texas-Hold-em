/*
 * 断线重连横幅（docs/HANDOFF.md M4）。
 * status 为 reconnecting/disconnected 时显示"正在重连…"。
 */
import { useSocket } from "../hooks/useSocket";
import { zhCN } from "../i18n/zh-CN";

export default function ReconnectBanner() {
  const { status } = useSocket();
  const show = status === "reconnecting" || status === "disconnected";
  if (!show) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-50 bg-warn/90 py-2 text-center text-sm font-medium text-base"
    >
      {zhCN.common.reconnecting}
    </div>
  );
}
