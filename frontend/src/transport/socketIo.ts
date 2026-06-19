/*
 * 真实 Socket.IO 传输层。握手带 token（docs/API-CONTRACT.md §2.1）。
 * 仅在 VITE_MOCK!=1 时被 socket 单例选用。
 */
import { io, type Socket } from "socket.io-client";
import type {
  ClientEvent,
  ClientToServerEvents,
  ConnectionStatus,
  ServerEvent,
  ServerToClientEvents,
  Transport,
} from "../socketEvents";
import { API_BASE } from "../api";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export class SocketIoTransport implements Transport {
  private socket: TypedSocket | null = null;
  private statusHandlers = new Set<(s: ConnectionStatus) => void>();
  private current: ConnectionStatus = "idle";

  private setStatus(s: ConnectionStatus): void {
    this.current = s;
    for (const h of this.statusHandlers) h(s);
  }

  connect(token: string): void {
    if (this.socket) return;
    this.setStatus("connecting");
    console.log("[socket] connecting with token:", token.slice(0, 20) + "...");
    // API_BASE 为空时走同源 / vite proxy
    // transports 默认 ["polling", "websocket"]，自动升级
    const socket: TypedSocket = io(API_BASE || undefined, {
      auth: { token },
    });

    socket.on("connect", () => {
      console.log("[socket] connected, socket.id:", socket.id);
      this.setStatus("connected");
      // 重连成功后立即拉一次大厅（API-CONTRACT §4）
      socket.emit("lobby:list", {});
    });

    socket.on("disconnect", (reason) => {
      console.log("[socket] disconnected, reason:", reason);
      this.setStatus("disconnected");
    });

    socket.on("connect_error", (err) => {
      console.error("[socket] connect_error:", err.message, err);
      this.setStatus("disconnected");
    });

    socket.io.on("reconnect_attempt", (attempt) => {
      console.log("[socket] reconnect_attempt #", attempt);
      this.setStatus("reconnecting");
    });

    socket.io.on("reconnect", (attempt) => {
      console.log("[socket] reconnected after", attempt, "attempts");
      this.setStatus("connected");
    });

    this.socket = socket;
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.setStatus("idle");
  }

  emit<E extends ClientEvent>(
    event: E,
    payload: Parameters<ClientToServerEvents[E]>[0],
  ): void {
    // socket.io 的 emit 重载与映射类型推断冲突，此处做一次窄化转发
    (this.socket?.emit as ((e: string, p: unknown) => void) | undefined)?.(
      event,
      payload,
    );
  }

  subscribe<E extends ServerEvent>(
    event: E,
    handler: ServerToClientEvents[E],
  ): () => void {
    this.socket?.on(event, handler as never);
    return () => {
      this.socket?.off(event, handler as never);
    };
  }

  onStatus(handler: (s: ConnectionStatus) => void): () => void {
    this.statusHandlers.add(handler);
    handler(this.current);
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  status(): ConnectionStatus {
    return this.current;
  }
}
