/*
 * Mock fixture · 掼蛋一局事件序列，供 VITE_MOCK=1 离线演示。
 * 形状严格对齐 docs/API-CONTRACT.md §2.5 Guandan。
 */
import type {
  HandEnd,
  PrivateState,
  GuandanTableState,
} from "../types";

const ME_SID = "sid-gd-me";
const PARTNER_SID = "sid-gd-partner";
const OPP1_SID = "sid-gd-opp1";
const OPP2_SID = "sid-gd-opp2";

const players: GuandanTableState["players"] = [
  {
    sid: ME_SID,
    name: "你",
    seat: 0,
    is_bot: false,
    chips: 0, // 掼蛋不用筹码，填 0
    status: "active",
  },
  {
    sid: OPP1_SID,
    name: "对手 A",
    seat: 1,
    is_bot: true,
    bot_level: "normal",
    chips: 0,
    status: "active",
  },
  {
    sid: PARTNER_SID,
    name: "搭档",
    seat: 2,
    is_bot: true,
    bot_level: "easy",
    chips: 0,
    status: "active",
  },
  {
    sid: OPP2_SID,
    name: "对手 B",
    seat: 3,
    is_bot: true,
    bot_level: "normal",
    chips: 0,
    status: "active",
  },
];

/* 掼蛋状态推进帧（play → 出牌 → 搭档接风 → 上岸） */
export const MOCK_GUANDAN_STATES: GuandanTableState[] = [
  {
    table_id: "t-guandan-1",
    game_type: "guandan",
    hand_id: "gd-h1",
    stage: "play",
    current_turn: { sid: ME_SID, deadline: "2026-06-19T10:10:25Z" },
    players,
    log: [],
    payload: {
      level_card: 2,
      team_a: [ME_SID, PARTNER_SID],
      team_b: [OPP1_SID, OPP2_SID],
      hand_counts: {
        [ME_SID]: 8,
        [OPP1_SID]: 10,
        [PARTNER_SID]: 9,
        [OPP2_SID]: 11,
      },
      last_play: null,
      pass_streak: 0,
      rankings: [],
    },
  },
  {
    table_id: "t-guandan-1",
    game_type: "guandan",
    hand_id: "gd-h1",
    stage: "play",
    current_turn: { sid: OPP1_SID, deadline: "2026-06-19T10:10:50Z" },
    players,
    log: [
      {
        ts: "2026-06-19T10:10:30Z",
        sid: ME_SID,
        name: "你",
        action: "play",
        detail: "对子 A",
      },
    ],
    payload: {
      level_card: 2,
      team_a: [ME_SID, PARTNER_SID],
      team_b: [OPP1_SID, OPP2_SID],
      hand_counts: {
        [ME_SID]: 6,
        [OPP1_SID]: 10,
        [PARTNER_SID]: 9,
        [OPP2_SID]: 11,
      },
      last_play: {
        sid: ME_SID,
        combo_type: "pair",
        cards: [
          { rank: 14, suit: "S", code: "As" },
          { rank: 14, suit: "H", code: "Ah" },
        ],
      },
      pass_streak: 0,
      rankings: [],
    },
  },
  {
    table_id: "t-guandan-1",
    game_type: "guandan",
    hand_id: "gd-h1",
    stage: "play",
    current_turn: { sid: PARTNER_SID, deadline: "2026-06-19T10:11:15Z" },
    players,
    log: [
      {
        ts: "2026-06-19T10:10:30Z",
        sid: ME_SID,
        name: "你",
        action: "play",
        detail: "对子 A",
      },
      {
        ts: "2026-06-19T10:10:55Z",
        sid: OPP1_SID,
        name: "对手 A",
        action: "pass",
        detail: "",
      },
    ],
    payload: {
      level_card: 2,
      team_a: [ME_SID, PARTNER_SID],
      team_b: [OPP1_SID, OPP2_SID],
      hand_counts: {
        [ME_SID]: 6,
        [OPP1_SID]: 10,
        [PARTNER_SID]: 9,
        [OPP2_SID]: 11,
      },
      last_play: {
        sid: ME_SID,
        combo_type: "pair",
        cards: [
          { rank: 14, suit: "S", code: "As" },
          { rank: 14, suit: "H", code: "Ah" },
        ],
      },
      pass_streak: 1,
      rankings: [],
    },
  },
  {
    table_id: "t-guandan-1",
    game_type: "guandan",
    hand_id: "gd-h1",
    stage: "settling",
    current_turn: null,
    players: players.map((p) =>
      p.sid === ME_SID || p.sid === PARTNER_SID
        ? { ...p, status: "won" as const }
        : { ...p, status: "lost" as const }
    ),
    log: [
      {
        ts: "2026-06-19T10:10:30Z",
        sid: ME_SID,
        name: "你",
        action: "play",
        detail: "对子 A",
      },
      {
        ts: "2026-06-19T10:10:55Z",
        sid: OPP1_SID,
        name: "对手 A",
        action: "pass",
        detail: "",
      },
      {
        ts: "2026-06-19T10:11:20Z",
        sid: PARTNER_SID,
        name: "搭档",
        action: "play",
        detail: "炸弹 K",
      },
    ],
    payload: {
      level_card: 2,
      team_a: [ME_SID, PARTNER_SID],
      team_b: [OPP1_SID, OPP2_SID],
      hand_counts: {
        [ME_SID]: 0,
        [OPP1_SID]: 10,
        [PARTNER_SID]: 0,
        [OPP2_SID]: 11,
      },
      last_play: {
        sid: PARTNER_SID,
        combo_type: "bomb",
        cards: [
          { rank: 13, suit: "S", code: "Ks" },
          { rank: 13, suit: "H", code: "Kh" },
          { rank: 13, suit: "D", code: "Kd" },
          { rank: 13, suit: "C", code: "Kc" },
        ],
      },
      pass_streak: 0,
      rankings: [
        { sid: ME_SID, rank: 1 },
        { sid: PARTNER_SID, rank: 2 },
      ],
    },
  },
];

export const MOCK_GUANDAN_PRIVATE: PrivateState = {
  table_id: "t-guandan-1",
  hand_id: "gd-h1",
  hole: [
    { rank: 14, suit: "S", code: "As" },
    { rank: 14, suit: "H", code: "Ah" },
    { rank: 10, suit: "D", code: "Td" },
    { rank: 9, suit: "C", code: "9c" },
    { rank: 7, suit: "S", code: "7s" },
    { rank: 5, suit: "H", code: "5h" },
    { rank: 3, suit: "D", code: "3d" },
    { rank: 2, suit: "C", code: "2c" },
  ],
  legal_actions: [
    { action: "play", payload_schema: { cards: "card[]" } },
    { action: "pass" },
  ],
};

export const MOCK_GUANDAN_HAND_END: HandEnd = {
  table_id: "t-guandan-1",
  hand_id: "gd-h1",
  results: [
    {
      team: "A",
      outcome: "double_up",
      score_delta: 2,
    },
  ],
  next_hand_in: 5000,
};

export const MOCK_GUANDAN_SELF_SID = ME_SID;
