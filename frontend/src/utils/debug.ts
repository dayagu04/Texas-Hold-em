/**
 * 调试日志：同时打印到 Console 和推送到后端 backend_debug.log。
 * 后端集中分析多端时序问题。失败静默，不影响主流程。
 */
export function debugLog(message: string, data?: unknown): void {
  const timestamp = new Date().toISOString().split("T")[1].slice(0, -1);
  const fullMsg =
    data !== undefined ? `${message} ${JSON.stringify(data)}` : message;

  console.log(`[${timestamp}] ${fullMsg}`);

  fetch("/api/debug/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: fullMsg }),
  }).catch(() => {});
}
