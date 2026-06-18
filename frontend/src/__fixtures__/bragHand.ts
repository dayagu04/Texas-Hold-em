/*
 * Mock fixture · 炸金花一局事件序列，供 VITE_MOCK=1 离线演示。
 * 形状严格对齐 docs/API-CONTRACT.md §2.5 Three-Card Brag。
 */
import type {
  HandEnd,
  PrivateState,
  BragTableState,
} from "../types";

const ME_SID = "sid-brag-me";
const BOT1_SID = "sid-brag-bot1";
const BOT2_SID = "sid-brag-bot2";

const players: BragTableState["players"] = [
  {
    sid: ME_SID,
    name: "你",
    seat: 0,
    is_bot: false,
    chips: 1000,
    status: "active",
  },
  {
    sid: BOT1_SID,
    name: "机器人 A",
    seat: 1,
    is_bot: true,
    bot_level: "easy",
    chips: 1000,
    status: "active",
  },
  {
    sid: BOT2_SID,
    name: "机器人 B",
    seat: 2,
    is_bot: true,
    bot_level: "normal",
    chips: 1000,
    status: "active",
  },
];

/* 炸金花状态推进帧（betting → 看牌 → call → showdown） */
export const MOCK_BRAG_STATES: BragTableState[] = [
  {
    table_id: "t-brag-1",
    game_type: "brag",
    hand_id: "brag-h1",
    stage: "betting",
    current_turn: { sid: ME_SID, deadline: "2026-06-19T10:00:25Z" },
    players,
    log: [],
    payload: {
      pot: 30,
      ante: 10,
      current_bet: 10,
      looked: {},
      active_sids: [ME_SID, BOT1_SID, BOT2_SID],
      last_raiser_sid: null,
      no_raise_rounds: 0,
    },
  },
  {
    table_id: "t-brag-1",
    game_type: "brag",
    hand_id: "brag-h1",
    stage: "betting",
    current_turn: { sid: BOT1_SID, deadline: "2026-06-19T10:00:50Z" },
    players,
    log: [
      {
        ts: "2026-06-19T10:00:30Z",
        sid: ME_SID,
        name: "你",
        action: "look",
        detail: "",
      },
    ],
    payload: {
      pot: 30,
      ante: 10,
      current_bet: 10,
      looked: { [ME_SID]: true },
      active_sids: [ME_SID, BOT1_SID, BOT2_SID],
      last_raiser_sid: null,
      no_raise_rounds: 0,
    },
  },
  {
    table_id: "t-brag-1",
    game_type: "brag",
    hand_id: "brag-h1",
    stage: "betting",
    current_turn: { sid: ME_SID, deadline: "2026-06-19T10:01:15Z" },
    players: players.map((p) =>
      p.sid === BOT2_SID ? { ...p, status: "folded" as const } : p
    ),
    log: [
      {
        ts: "2026-06-19T10:00:30Z",
        sid: ME_SID,
        name: "你",
        action: "look",
        detail: "",
      },
      {
        ts: "2026-06-19T10:00:55Z",
        sid: BOT1_SID,
        name: "机器人 A",
        action: "call",
        detail: "10",
      },
      {
        ts: "2026-06-19T10:01:10Z",
        sid: BOT2_SID,
        name: "机器人 B",
        action: "fold",
        detail: "",
      },
    ],
    payload: {
      pot: 50,
      ante: 10,
      current_bet: 10,
      looked: { [ME_SID]: true },
      active_sids: [ME_SID, BOT1_SID],
      last_raiser_sid: null,
      no_raise_rounds: 1,
    },
  },
];

export const MOCK_BRAG_PRIVATE: PrivateState = {
  table_id: "t-brag-1",
  hand_id: "brag-h1",
  hole: [
    { rank: 13, suit: "H", code: "Kh" },
    { rank: 13, suit: "D", code: "Kd" },
    { rank: 13, suit: "C", code: "Kc" },
  ],
  legal_actions: [
    { action: "look" },
    { action: "call" },
    { action: "raise", payload_schema: { amount: "int" } },
    { action: "fold" },
  ],
};

export const MOCK_BRAG_HAND_END: HandEnd = {
  table_id: "t-brag-1",
  hand_id: "brag-h1",
  results: [
    {
      sid: ME_SID,
      name: "你",
      amount: 50,
      hand: "三条 K",
      cards: [
        { rank: 13, suit: "H", code: "Kh" },
        { rank: 13, suit: "D", code: "Kd" },
        { rank: 13, suit: "C", code: "Kc" },
      ],
      revealed: true,
    },
    {
      sid: BOT1_SID,
      name: "机器人 A",
      amount: -10,
      hand: "高牌 Q",
      cards: [
        { rank: 12, suit: "S", code: "Qs" },
        { rank: 9, suit: "H", code: "9h" },
        { rank: 5, suit: "D", code: "5d" },
      ],
      revealed: true,
    },
    {
      sid: BOT2_SID,
      name: "机器人 B",
      amount: -10,
      revealed: false,
    },
  ],
  next_hand_in: 5000,
};

export const MOCK_BRAG_SELF_SID = ME_SID;
