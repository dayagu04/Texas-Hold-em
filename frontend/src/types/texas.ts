/* 德州扑克专属类型 · 对齐 docs/API-CONTRACT.md §2.5 Texas Hold'em。 */
import type { Card } from "./common";

/* stage 语义见契约 */
export type TexasStage =
  | "waiting"
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown";

export interface SidePot {
  amount: number;
  eligible_sids: string[];
}

export interface TexasPublic {
  pot: number;
  side_pots: SidePot[];
  current_bet: number;
  min_raise: number;
  community: Card[];
  button_seat: number;
  player_bets: Record<string /* sid */, number>; // 本街已下注
}

/* table:hand_end → results（玩法专属） */
export interface TexasHandResult {
  sid: string;
  name: string;
  amount: number;
  hand?: string;
  cards?: Card[];
}

/* 合法 actions：fold | check | call | raise | all_in；raise payload { amount } */
export type TexasActionName = "fold" | "check" | "call" | "raise" | "all_in";
