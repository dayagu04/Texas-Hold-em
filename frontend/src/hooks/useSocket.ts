/*
 * useSocket · 消费 socket 单例（docs/HANDOFF.md M1）。
 * 提供连接状态 + 订阅/发送的便捷封装；组件不直接碰 socket.io-client。
 */
import { useEffect, useState } from "react";
import {
  connectionStatus,
  emit,
  onStatus,
  subscribe,
} from "../socket";
import type { ConnectionStatus } from "../socketEvents";

export function useSocket() {
  const [status, setStatus] = useState<ConnectionStatus>(connectionStatus());

  useEffect(() => onStatus(setStatus), []);

  const connected = status === "connected";

  return { status, connected, subscribe, emit };
}
