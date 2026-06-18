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
    // API_BASE 为空时走同源 / vite proxy
    const socket: TypedSocket = io(API_BASE || undefined, {
      transports: ["websocket"],
      auth: { token },
    });
    socket.on("connect", () => this.setStatus("connected"));
    socket.on("disconnect", () => this.setStatus("disconnected"));
    socket.io.on("reconnect_attempt", () => this.setStatus("reconnecting"));
    socket.io.on("reconnect", () => this.setStatus("connected"));
    // 重连成功后立即拉一次大厅（API-CONTRACT §4）
    socket.on("connect", () => socket.emit("lobby:list", {}));
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
