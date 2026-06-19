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
import {
  MOCK_BRAG_HAND_END,
  MOCK_BRAG_PRIVATE,
  MOCK_BRAG_STATES,
  MOCK_BRAG_SELF_SID,
} from "../__fixtures__/bragHand";
import {
  MOCK_GUANDAN_HAND_END,
  MOCK_GUANDAN_PRIVATE,
  MOCK_GUANDAN_STATES,
  MOCK_GUANDAN_SELF_SID,
} from "../__fixtures__/guandanHand";

type AnyHandler = (data: unknown) => void;

export class MockTransport implements Transport {
  private handlers = new Map<ServerEvent, Set<AnyHandler>>();
  private statusHandlers = new Set<(s: ConnectionStatus) => void>();
  private current: ConnectionStatus = "idle";
  private stateIdx = 0;
  private currentGameType: "texas" | "guandan" | "brag" = "texas";

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
      case "lobby:create_table": {
        // mock：按 game_type 生成 table_id，回 lobby:joined（与真实后端契约一致）
        const p = payload as { game_type?: "texas" | "guandan" | "brag" };
        const gt = p.game_type ?? "texas";
        this.currentGameType = gt;
        await this.delay(200);
        this.fire("lobby:joined", { table_id: `t-${gt}-mock`, your_seat: 0 });
        await this.delay(100);
        this.stateIdx = 0;
        this.pushState(0);
        this.pushPrivate();
        break;
      }
      case "lobby:join_table": {
        const p = payload as { table_id: string };
        // 根据 table_id 推断玩法
        if (p.table_id.includes("brag")) {
          this.currentGameType = "brag";
        } else if (p.table_id.includes("guandan")) {
          this.currentGameType = "guandan";
        } else {
          this.currentGameType = "texas";
        }
        this.fire("lobby:joined", { table_id: p.table_id, your_seat: 0 });
        await this.delay(200);
        this.stateIdx = 0;
        this.pushState(0);
        this.pushPrivate();
        break;
      }
      case "table:start_hand":
        this.stateIdx = 0;
        this.pushState(0);
        this.pushPrivate();
        break;
      case "table:action": {
        // 推进到下一帧；走到结尾发 hand_end
        await this.delay(300);
        const maxIdx = this.getMaxStateIndex();
        if (this.stateIdx < maxIdx) {
          this.stateIdx += 1;
          this.pushState(this.stateIdx);
          this.pushPrivate();
        } else {
          await this.delay(400);
          this.pushHandEnd();
        }
        break;
      }
      case "table:chat": {
        const p = payload as { table_id: string; text: string };
        const selfSid = this.getCurrentSelfSid();
        this.fire("table:chat", {
          sid: selfSid,
          name: "你",
          text: p.text,
          ts: new Date().toISOString(),
        });
        break;
      }
      default:
        break;
    }
  }

  private pushState(idx: number): void {
    switch (this.currentGameType) {
      case "texas":
        this.fire("table:state", MOCK_TEXAS_STATES[idx]);
        break;
      case "brag":
        this.fire("table:state", MOCK_BRAG_STATES[idx]);
        break;
      case "guandan":
        this.fire("table:state", MOCK_GUANDAN_STATES[idx]);
        break;
    }
  }

  private pushPrivate(): void {
    switch (this.currentGameType) {
      case "texas":
        this.fire("table:private", MOCK_TEXAS_PRIVATE);
        break;
      case "brag":
        this.fire("table:private", MOCK_BRAG_PRIVATE);
        break;
      case "guandan":
        this.fire("table:private", MOCK_GUANDAN_PRIVATE);
        break;
    }
  }

  private pushHandEnd(): void {
    switch (this.currentGameType) {
      case "texas":
        this.fire("table:hand_end", MOCK_TEXAS_HAND_END);
        break;
      case "brag":
        this.fire("table:hand_end", MOCK_BRAG_HAND_END);
        break;
      case "guandan":
        this.fire("table:hand_end", MOCK_GUANDAN_HAND_END);
        break;
    }
  }

  private getMaxStateIndex(): number {
    switch (this.currentGameType) {
      case "texas":
        return MOCK_TEXAS_STATES.length - 1;
      case "brag":
        return MOCK_BRAG_STATES.length - 1;
      case "guandan":
        return MOCK_GUANDAN_STATES.length - 1;
    }
  }

  private getCurrentSelfSid(): string {
    switch (this.currentGameType) {
      case "texas":
        return MOCK_SELF_SID;
      case "brag":
        return MOCK_BRAG_SELF_SID;
      case "guandan":
        return MOCK_GUANDAN_SELF_SID;
    }
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

  /**
   * Mock 模式无真实 socket.id,返回当前 fixture 的 self sid
   * (texas/brag/guandan 各自不同),保留现有 mySid 推断行为。
   */
  getSid(): string | null {
    return this.getCurrentSelfSid();
  }
}
