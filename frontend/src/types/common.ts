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
  ready?: boolean; // 准备机制：waiting 阶段是否已准备（bot 恒 true）
  avatar?: string | null; // 头像 URL，如 "/static/avatars/大牙.png" 或 null
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
  // 实时牌型预览：德州/炸金花有值，掼蛋为 null。仅定向推给本人。
  hand_rank?: { category: number; name: string } | null;
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
  game_mode?: "single" | "continuous" | "limited"; // 默认 continuous（后端兜底）
  max_hands?: number; // game_mode=limited 时必填
}

/* ---- 聊天（API-CONTRACT §2.4 table:chat S→C）---- */
export interface ChatMessage {
  sid: string;
  name: string;
  text: string;
  ts: string | number; // #010: 改为毫秒数(number)，兼容旧空串
}

/* ---- REST：登录 / 当前用户（API-CONTRACT §1.2 / §1.3）---- */
export interface LoginResponse {
  token: string;
  name: string;
}

export interface MeResponse {
  name: string;
  expires_at: string;
  avatar?: string | null;
  points?: number; // 个人积分（后端 v2 新增）
  is_admin?: boolean; // 是否管理员（#008 白名单管理）
}

/* ---- 个人中心：积分统计（GET /api/profile/stats）---- */
export interface ProfileStats {
  points: number;
  hands_played: number;
  hands_won: number;
  total_net: number;
}

/* ---- 个人中心：对局历史（GET /api/profile/history）---- */
// hole/board 是紧凑卡牌串，如 "8d3s" / "AhKsQc"，可能为空字符串。
export type HandResultOutcome = "won" | "lost" | "folded";

export interface HandHistoryMe {
  hole: string;
  total_bet: number;
  net: number;
  result: HandResultOutcome;
}

export interface HandHistoryPlayer {
  name: string;
  seat: number;
  is_bot: boolean;
  hole: string;
  total_bet: number;
  net: number;
  result: HandResultOutcome;
}

export interface HandHistory {
  hand_id: string;
  game_type: GameType;
  ended_at: string;
  pot: number;
  board: string;
  me: HandHistoryMe;
  players: HandHistoryPlayer[];
}

/* ---- 白名单管理（GET /api/admin/whitelist）---- */
export interface WhitelistUser {
  name: string;
  allowed: boolean;
  is_admin: boolean;
  created_at: string | null;
  points: number;
}

/* ---- 积分榜（GET /api/leaderboard）---- */
export type LeaderboardMetric = "points" | "net" | "winrate";

export interface LeaderboardEntry {
  rank: number;
  name: string;
  avatar: string | null;
  points: number;
  hands_played: number;
  hands_won: number;
  total_net: number;
  winrate: number; // 0..1
}

/* ---- 牌局回放（GET /api/hand/{hand_id}/replay）#013 ---- */
export interface ReplayData {
  hand_id: number;
  game_type: GameType;
  board: string; // 公共牌 code 串，如 "AsKdQh"；无则空串
  pot: number;
  ended_at: string; // ISO 8601 UTC
  players: ReplayPlayer[];
  actions: ReplayAction[]; // 按 seq 升序；空数组表示该局无逐 action 记录
}

export interface ReplayPlayer {
  name: string;
  seat: number;
  is_bot: boolean;
  hole: string; // 起手牌 code 串，如 "AsKd"；掼蛋等无则空串
}

export interface ReplayAction {
  seq: number; // 局内序号，从 0 起，唯一且递增
  name: string; // 行动者展示名（sid 重连会变，回放用 name）
  action: string; // fold|call|raise|check|all_in|play|pass|look|compare|...
  payload: Record<string, unknown> | null; // 如 { amount: 50 } / { cards: ["As","Kd"] }
  stage: string; // 动作发生时的 stage（preflop/flop/.../betting/play）
  ts: string; // ISO 8601 UTC
}
