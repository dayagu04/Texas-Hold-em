/*
 * Socket.IO 事件类型映射 · 严格对齐 docs/API-CONTRACT.md §2。
 * 事件名 / payload 字段为硬契约，改动须先改契约文档。
 */
import type {
  ChatMessage,
  CreateTablePayload,
  BotLevel,
  HandEnd,
  LobbyTable,
  PrivateState,
  SocketError,
  TableState,
} from "./types";

/* 服务端 → 客户端 */
export interface ServerToClientEvents {
  "lobby:update": (data: { tables: LobbyTable[] }) => void;
  "lobby:joined": (data: { table_id: string; your_seat: number | null }) => void;
  "table:state": (data: TableState) => void;
  "table:private": (data: PrivateState) => void;
  "table:chat": (data: ChatMessage) => void;
  "table:hand_end": (data: HandEnd) => void;
  kicked: (data: { reason: string }) => void;
  error: (data: SocketError) => void;
  "system:announce": (data: { text: string }) => void;
}

/* 客户端 → 服务端 */
export interface ClientToServerEvents {
  "lobby:list": (payload: Record<string, never>) => void;
  "lobby:create_table": (payload: CreateTablePayload) => void;
  "lobby:join_table": (payload: {
    table_id: string;
    seat?: number;
    spectate?: boolean;
  }) => void;
  "lobby:leave_table": (payload: { table_id: string }) => void;
  "table:action": (payload: {
    table_id: string;
    action: string;
    payload: unknown;
  }) => void;
  "table:chat": (payload: { table_id: string; text: string }) => void;
  "table:add_bot": (payload: {
    table_id: string;
    seat: number;
    level: BotLevel;
  }) => void;
  "table:remove_bot": (payload: { table_id: string; seat: number }) => void;
  "table:start_hand": (payload: { table_id: string }) => void;
}

export type ServerEvent = keyof ServerToClientEvents;
export type ClientEvent = keyof ClientToServerEvents;

/* 连接状态（驱动断线重连 banner，docs/HANDOFF.md M4） */
export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

/*
 * 传输层抽象：真实 Socket.IO 与本地 mock reducer 都实现它，
 * 上层 socket 单例对二者无感知。
 */
export interface Transport {
  connect(token: string): void;
  disconnect(): void;
  emit<E extends ClientEvent>(
    event: E,
    payload: Parameters<ClientToServerEvents[E]>[0],
  ): void;
  subscribe<E extends ServerEvent>(
    event: E,
    handler: ServerToClientEvents[E],
  ): () => void;
  onStatus(handler: (status: ConnectionStatus) => void): () => void;
  status(): ConnectionStatus;
}
