/*
 * Socket.IO 单例 · 全应用唯一连接入口（docs/ARCHITECTURE.md §2）。
 * - 握手带 token；
 * - 暴露 subscribe(event, handler) / emit(event, payload)；
 * - VITE_MOCK=1 时切到本地 mock reducer，不连真实后端（docs/HANDOFF.md FAQ）。
 * hooks/useSocket.ts 消费此单例，组件不直接 import socket.io-client。
 */
import type {
  ClientEvent,
  ClientToServerEvents,
  ConnectionStatus,
  ServerEvent,
  ServerToClientEvents,
  Transport,
} from "./socketEvents";
import { SocketIoTransport } from "./transport/socketIo";
import { MockTransport } from "./transport/mock";
import { getToken } from "./api";

const MOCK = import.meta.env.VITE_MOCK === "1";

const transport: Transport = MOCK
  ? new MockTransport()
  : new SocketIoTransport();

let connected = false;

/** 用当前存储的 token 建立连接（幂等）。无 token 时不连。 */
export function connectSocket(): void {
  if (connected) {
    console.log("[socket] connectSocket: already connected, skipping");
    return;
  }
  const token = getToken();
  if (!token && !MOCK) {
    console.warn("[socket] connectSocket: no token, skipping connection");
    return;
  }
  console.log("[socket] connectSocket: initiating connection, MOCK:", MOCK);
  transport.connect(token ?? "mock");
  connected = true;
}

export function disconnectSocket(): void {
  transport.disconnect();
  connected = false;
}

/** 订阅服务端事件，返回取消订阅函数。 */
export function subscribe<E extends ServerEvent>(
  event: E,
  handler: ServerToClientEvents[E],
): () => void {
  return transport.subscribe(event, handler);
}

/** 向服务端发送事件。 */
export function emit<E extends ClientEvent>(
  event: E,
  payload: Parameters<ClientToServerEvents[E]>[0],
): void {
  transport.emit(event, payload);
}

/** 订阅连接状态变化（驱动断线重连 banner）。 */
export function onStatus(
  handler: (status: ConnectionStatus) => void,
): () => void {
  return transport.onStatus(handler);
}

export function connectionStatus(): ConnectionStatus {
  return transport.status();
}

export const IS_MOCK = MOCK;
