/*
 * 类型桶 · 统一出口 + table:state / table:hand_end 的玩法判别联合。
 * 对齐 docs/API-CONTRACT.md §2.4。
 */
export * from "./common";
export * from "./texas";
export * from "./guandan";
export * from "./brag";

import type {
  ActionLog,
  CurrentTurn,
  GameType,
  PublicPlayer,
} from "./common";
import type { TexasPublic, TexasHandResult, TexasStage } from "./texas";
import type { GuandanPublic, GuandanHandResult, GuandanStage } from "./guandan";
import type { BragPublic, BragHandResult, BragStage } from "./brag";

/*
 * table:state —— 公开状态。payload 与 game_type 绑定，用判别联合保证类型安全：
 * 按 game_type narrow 后 payload 自动收窄到对应玩法的 *Public。
 */
interface TableStateBase {
  table_id: string;
  hand_id: string;
  current_turn: CurrentTurn | null;
  players: PublicPlayer[];
  log: ActionLog[];
}

export interface TexasTableState extends TableStateBase {
  game_type: Extract<GameType, "texas">;
  stage: TexasStage;
  payload: TexasPublic;
}

export interface GuandanTableState extends TableStateBase {
  game_type: Extract<GameType, "guandan">;
  stage: GuandanStage;
  payload: GuandanPublic;
}

export interface BragTableState extends TableStateBase {
  game_type: Extract<GameType, "brag">;
  stage: BragStage;
  payload: BragPublic;
}

export type TableState =
  | TexasTableState
  | GuandanTableState
  | BragTableState;

/* table:hand_end —— results 按玩法不同 */
export type HandResult =
  | TexasHandResult
  | GuandanHandResult
  | BragHandResult;

export interface HandEnd {
  table_id: string;
  hand_id: string;
  results: HandResult[];
  next_hand_in: number; // ms，0 表示等房主点开始
}
