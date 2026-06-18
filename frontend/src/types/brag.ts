/* 炸金花专属类型 · 对齐 docs/API-CONTRACT.md §2.5 Three-Card Brag。 */
import type { Card } from "./common";

export type BragStage = "waiting" | "betting" | "showdown";

export interface BragPublic {
  pot: number;
  ante: number;
  current_bet: number; // 未看牌的基础注
  looked: Record<string /* sid */, boolean>;
  active_sids: string[]; // 仍在局中
  last_raiser_sid: string | null;
  no_raise_rounds: number; // 用于触发强制摊牌
}

/* table:hand_end → results（玩法专属） */
export interface BragHandResult {
  sid: string;
  name: string;
  amount: number;
  hand?: string;
  cards?: Card[];
  revealed: boolean;
}

/* 合法 actions：look | call | raise { amount } | compare { target_sid } | fold */
export type BragActionName = "look" | "call" | "raise" | "compare" | "fold";
