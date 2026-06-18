/*
 * Mock fixture · 德州扑克一局事件序列，供 VITE_MOCK=1 离线演示。
 * 形状严格对齐 docs/API-CONTRACT.md，可被 mock reducer 顺序回放。
 * 后端若提供 backend/tests/fixtures/ 样例，可替换此文件。
 */
import type {
  HandEnd,
  LobbyTable,
  PrivateState,
  TexasTableState,
} from "../types";

export const MOCK_ME = { name: "你", expires_at: "2026-06-19T00:00:00Z" };

export const MOCK_LOBBY: LobbyTable[] = [
  {
    id: "t-texas-1",
    name: "周五局",
    game_type: "texas",
    seats_taken: 3,
    seats_total: 6,
    has_bots: true,
    status: "waiting",
    spectatable: true,
  },
  {
    id: "t-guandan-1",
    name: "兄弟连",
    game_type: "guandan",
    seats_taken: 4,
    seats_total: 4,
    has_bots: false,
    status: "playing",
    spectatable: true,
  },
  {
    id: "t-brag-1",
    name: "老板局",
    game_type: "brag",
    seats_taken: 2,
    seats_total: 6,
    has_bots: true,
    status: "waiting",
    spectatable: false,
  },
];

const ME_SID = "sid-me";
const BOT_SID = "sid-bot";

const players: TexasTableState["players"] = [
  {
    sid: ME_SID,
    name: "你",
    seat: 0,
    is_bot: false,
    chips: 1000,
    status: "active",
  },
  {
    sid: BOT_SID,
    name: "机器人 Bo",
    seat: 1,
    is_bot: true,
    bot_level: "easy",
    chips: 1000,
    status: "active",
  },
];

/* 一局德州的状态推进帧（preflop → flop → showdown 简化序） */
export const MOCK_TEXAS_STATES: TexasTableState[] = [
  {
    table_id: "t-texas-1",
    game_type: "texas",
    hand_id: "h1",
    stage: "preflop",
    current_turn: { sid: ME_SID, deadline: "2026-06-18T14:30:25Z" },
    players,
    log: [],
    payload: {
      pot: 30,
      side_pots: [],
      current_bet: 20,
      min_raise: 20,
      community: [],
      button_seat: 0,
      player_bets: { [ME_SID]: 10, [BOT_SID]: 20 },
    },
  },
  {
    table_id: "t-texas-1",
    game_type: "texas",
    hand_id: "h1",
    stage: "flop",
    current_turn: { sid: ME_SID, deadline: "2026-06-18T14:30:50Z" },
    players,
    log: [
      {
        ts: "2026-06-18T14:30:30Z",
        sid: ME_SID,
        name: "你",
        action: "call",
        detail: "20",
      },
    ],
    payload: {
      pot: 40,
      side_pots: [],
      current_bet: 0,
      min_raise: 20,
      community: [
        { rank: 14, suit: "S", code: "As" },
        { rank: 13, suit: "H", code: "Kh" },
        { rank: 7, suit: "D", code: "7d" },
      ],
      button_seat: 0,
      player_bets: {},
    },
  },
];

export const MOCK_TEXAS_PRIVATE: PrivateState = {
  table_id: "t-texas-1",
  hand_id: "h1",
  hole: [
    { rank: 14, suit: "D", code: "Ad" },
    { rank: 14, suit: "C", code: "Ac" },
  ],
  legal_actions: [
    { action: "fold" },
    { action: "check" },
    { action: "raise", payload_schema: { amount: "int" } },
    { action: "all_in" },
  ],
};

export const MOCK_TEXAS_HAND_END: HandEnd = {
  table_id: "t-texas-1",
  hand_id: "h1",
  results: [
    {
      sid: ME_SID,
      name: "你",
      amount: 40,
      hand: "三条 A",
      cards: [
        { rank: 14, suit: "D", code: "Ad" },
        { rank: 14, suit: "C", code: "Ac" },
        { rank: 14, suit: "S", code: "As" },
      ],
    },
  ],
  next_hand_in: 0,
};

export const MOCK_SELF_SID = ME_SID;
