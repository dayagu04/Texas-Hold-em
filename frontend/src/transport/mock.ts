/*
 * Mock 传输层 · VITE_MOCK=1 时启用。
 * 不连后端，由本地 reducer 把客户端事件映射为 fixture 事件序列回放，
 * 支撑离线演示：登录 → 大厅 → 进桌 → 一局德州（docs/HANDOFF.md 验收 §5）。
 */
import type {
  ClientEvent,
  ClientToServerEvents,
  ConnectionStatus,
  ServerEvent,
  ServerToClientEvents,
  Transport,
} from "../socketEvents";
import {
  MOCK_LOBBY,
  MOCK_TEXAS_HAND_END,
  MOCK_TEXAS_PRIVATE,
  MOCK_TEXAS_STATES,
  MOCK_SELF_SID,
} from "../__fixtures__/texasHand";

type AnyHandler = (data: unknown) => void;

export class MockTransport implements Transport {
  private handlers = new Map<ServerEvent, Set<AnyHandler>>();
  private statusHandlers = new Set<(s: ConnectionStatus) => void>();
  private current: ConnectionStatus = "idle";
  private stateIdx = 0;

  private setStatus(s: ConnectionStatus): void {
    this.current = s;
    for (const h of this.statusHandlers) h(s);
  }

  private fire<E extends ServerEvent>(
    event: E,
    data: Parameters<ServerToClientEvents[E]>[0],
  ): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of set) h(data as unknown);
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
  }

  connect(_token: string): void {
    void _token;
    this.setStatus("connecting");
    // 模拟握手延迟
    void this.delay(150).then(() => {
      this.setStatus("connected");
      this.fire("lobby:update", { tables: MOCK_LOBBY });
    });
  }

  disconnect(): void {
    this.setStatus("idle");
    this.handlers.clear();
  }

  emit<E extends ClientEvent>(
    event: E,
    payload: Parameters<ClientToServerEvents[E]>[0],
  ): void {
    void this.handleClientEvent(event, payload);
  }

  private async handleClientEvent<E extends ClientEvent>(
    event: E,
    payload: Parameters<ClientToServerEvents[E]>[0],
  ): Promise<void> {
    switch (event) {
      case "lobby:list":
        this.fire("lobby:update", { tables: MOCK_LOBBY });
        break;
      case "lobby:join_table": {
        const p = payload as { table_id: string };
        this.fire("lobby:joined", { table_id: p.table_id, your_seat: 0 });
        await this.delay(200);
        this.pushState(0);
        this.fire("table:private", MOCK_TEXAS_PRIVATE);
        break;
      }
      case "table:start_hand":
        this.stateIdx = 0;
        this.pushState(0);
        this.fire("table:private", MOCK_TEXAS_PRIVATE);
        break;
      case "table:action": {
        // 推进到下一帧；走到结尾发 hand_end
        await this.delay(300);
        if (this.stateIdx < MOCK_TEXAS_STATES.length - 1) {
          this.stateIdx += 1;
          this.pushState(this.stateIdx);
          this.fire("table:private", MOCK_TEXAS_PRIVATE);
        } else {
          await this.delay(400);
          this.fire("table:hand_end", MOCK_TEXAS_HAND_END);
        }
        break;
      }
      case "table:chat": {
        const p = payload as { table_id: string; text: string };
        this.fire("table:chat", {
          sid: MOCK_SELF_SID,
          name: "你",
          text: p.text,
          ts: "2026-06-18T14:31:00Z",
        });
        break;
      }
      default:
        break;
    }
  }

  private pushState(idx: number): void {
    this.fire("table:state", MOCK_TEXAS_STATES[idx]);
  }

  subscribe<E extends ServerEvent>(
    event: E,
    handler: ServerToClientEvents[E],
  ): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as AnyHandler);
    return () => {
      this.handlers.get(event)?.delete(handler as AnyHandler);
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
