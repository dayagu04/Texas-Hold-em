/*
 * 通用类型 · 严格对齐 docs/API-CONTRACT.md。
 * 契约是硬约束：事件名 / 字段名 / 枚举值不得擅改。
 */

/* ---- 玩法标识（API-CONTRACT §1.4 / §2.4）---- */
export type GameType = "texas" | "guandan" | "brag";

export type BotLevel = "easy" | "normal";

/* ---- 牌（API-CONTRACT §3）---- */
// suit: J = Joker（王）；rank: 2..14 普通，15=小王，16=大王
export type Suit = "S" | "H" | "D" | "C" | "J";

export interface Card {
  rank: number; // 2..14 普通；15=小王，16=大王
  suit: Suit;
  code: string; // 例 "As" "Td" "JL"=小王 "JB"=大王
}

/* ---- 大厅（API-CONTRACT §1.4）---- */
export type TableStatus = "waiting" | "playing";

export interface LobbyTable {
  id: string;
  name: string;
  game_type: GameType;
  seats_taken: number;
  seats_total: number;
  has_bots: boolean;
  status: TableStatus;
  spectatable: boolean;
}

/* ---- 玩家公开态（API-CONTRACT §2.4 PublicPlayer）---- */
export type PlayerStatus =
  | "active"
  | "folded"
  | "all_in"
  | "sitting_out"
  | "won"
  | "lost";

export interface PublicPlayer {
  sid: string;
  name: string;
  seat: number;
  is_bot: boolean;
  bot_level?: BotLevel;
  chips: number;
  status: PlayerStatus;
}

/* ---- 行动日志（API-CONTRACT §2.4 ActionLog）---- */
export interface ActionLog {
  ts: string;
  sid: string;
  name: string;
  action: string;
  detail?: string;
}

/* ---- 当前回合 ---- */
export interface CurrentTurn {
  sid: string;
  deadline: string; // ISO 8601
}

/* ---- 合法动作（API-CONTRACT §2.4 LegalAction）----
 * payload_schema 描述该动作所需字段及其类型，前端按钮据此渲染输入控件。 */
export type PayloadFieldType = "int" | "card[]" | "sid";

export interface LegalAction {
  action: string;
  payload_schema?: Record<string, PayloadFieldType>;
}

/* ---- 私有态（API-CONTRACT §2.4 table:private）---- */
export interface PrivateState {
  table_id: string;
  hand_id: string;
  hole: Card[];
  legal_actions: LegalAction[];
}

/* ---- 错误码（API-CONTRACT §2.6）---- */
export type ErrorCode =
  | "AUTH_REQUIRED"
  | "NOT_ALLOWED"
  | "INVALID_TOKEN"
  | "TABLE_NOT_FOUND"
  | "SEAT_TAKEN"
  | "FORBIDDEN"
  | "INVALID_ACTION"
  | "OUT_OF_TURN"
  | "RULE_VIOLATION";

export interface SocketError {
  code: ErrorCode;
  message: string;
  context?: unknown;
}

/* ---- 创建房间（API-CONTRACT §2.3 CreateTablePayload）---- */
export interface CreateTablePayload {
  name: string;
  game_type: GameType;
  seats: number; // texas: 2-6, guandan: 4(固定), brag: 2-6
  initial_chips?: number; // texas / brag
  small_blind?: number; // texas
  ante?: number; // brag
  bots?: { seat: number; level: BotLevel }[];
  spectatable?: boolean;
}

/* ---- 聊天（API-CONTRACT §2.4 table:chat S→C）---- */
export interface ChatMessage {
  sid: string;
  name: string;
  text: string;
  ts: string;
}

/* ---- REST：登录 / 当前用户（API-CONTRACT §1.2 / §1.3）---- */
export interface LoginResponse {
  token: string;
  name: string;
}

export interface MeResponse {
  name: string;
  expires_at: string;
}
