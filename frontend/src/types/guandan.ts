/* 掼蛋专属类型 · 对齐 docs/API-CONTRACT.md §2.5 Guandan。 */
import type { Card } from "./common";

export type GuandanStage = "waiting" | "tribute" | "play" | "settling";

/* combo_type 由后端 combos.py 给出：single/pair/trips/full_house/straight/
 * tube_pair/plate/straight_flush/bomb/rocket（前端只透传展示，不做规则推断）。 */
export interface GuandanLastPlay {
  sid: string;
  combo_type: string;
  cards: Card[];
}

export interface GuandanRanking {
  sid: string;
  rank: 1 | 2 | 3 | 4;
}

export interface GuandanPublic {
  level_card: number; // 当前级牌，v1 = 2
  team_a: string[]; // sid，座位 0/2
  team_b: string[]; // 座位 1/3
  hand_counts: Record<string /* sid */, number>;
  last_play: GuandanLastPlay | null;
  pass_streak: number;
  rankings: GuandanRanking[]; // 已上岸者
}

/* table:hand_end → results（玩法专属，按队结算） */
export interface GuandanHandResult {
  team: "A" | "B";
  outcome: "double_up" | "first_third" | "first_fourth";
  score_delta: number;
}

/* 合法 actions：play { cards } | pass | hint(可选) */
export type GuandanActionName = "play" | "pass" | "hint";
