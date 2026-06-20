/*
 * 德州扑克牌型评估器 - 前端版本
 * 从 7 张牌（手牌 2 + 公牌 5）中选出最佳 5 张组合
 * 参考后端 backend/app/game/texas/evaluator.py
 */
import type { Card } from "../types";

const CATEGORY_NAMES: Record<number, string> = {
  8: "同花顺",
  7: "四条",
  6: "葫芦",
  5: "同花",
  4: "顺子",
  3: "三条",
  2: "两对",
  1: "一对",
  0: "高牌",
};

/** 给定点数集合，返回顺子的最高点；无顺子返回 null */
function straightHigh(ranks: Set<number>): number | null {
  // A-2-3-4-5 (wheel)
  if ([14, 2, 3, 4, 5].every((r) => ranks.has(r))) {
    return 5;
  }
  // 从 A(14) 向下检查连续 5 张
  for (let high = 14; high >= 5; high--) {
    if ([high, high - 1, high - 2, high - 3, high - 4].every((r) => ranks.has(r))) {
      return high;
    }
  }
  return null;
}

/** 评估恰好 5 张牌，返回可比较元组 [category, ...tiebreakers] */
function eval5(cards: Card[]): number[] {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const rankCounts: Record<number, number> = {};
  cards.forEach((c) => {
    rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
  });

  const suits = cards.map((c) => c.suit);
  const isFlush = new Set(suits).size === 1;
  const straight = straightHigh(new Set(ranks));

  // 按出现次数、再按点数排序
  const byCount = Object.entries(rankCounts)
    .map(([r, c]) => [Number(r), c] as [number, number])
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  const counts = byCount.map(([, c]) => c);
  const orderedRanks = byCount.map(([r]) => r);

  // 同花顺
  if (isFlush && straight) {
    return [8, straight];
  }
  // 四条
  if (counts[0] === 4) {
    return [7, orderedRanks[0], orderedRanks[1]];
  }
  // 葫芦
  if (counts[0] === 3 && counts[1] >= 2) {
    return [6, orderedRanks[0], orderedRanks[1]];
  }
  // 同花
  if (isFlush) {
    return [5, ...ranks];
  }
  // 顺子
  if (straight) {
    return [4, straight];
  }
  // 三条
  if (counts[0] === 3) {
    return [3, orderedRanks[0], ...orderedRanks.slice(1)];
  }
  // 两对
  if (counts[0] === 2 && counts[1] === 2) {
    return [2, orderedRanks[0], orderedRanks[1], orderedRanks[2]];
  }
  // 一对
  if (counts[0] === 2) {
    return [1, orderedRanks[0], ...orderedRanks.slice(1)];
  }
  // 高牌
  return [0, ...ranks];
}

/** 从 5~7 张牌中选出最强的 5 张组合 */
function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > arr.length) return [];

  const result: T[][] = [];
  for (let i = 0; i <= arr.length - k; i++) {
    const first = arr[i];
    const rest = combinations(arr.slice(i + 1), k - 1);
    rest.forEach((combo) => result.push([first, ...combo]));
  }
  return result;
}

function compareScore(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (b[i] || 0) - (a[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** 评估最佳 5 张牌组合 */
function evaluateBest(cards: Card[]): { score: number[]; best5: Card[] } {
  if (cards.length < 5) {
    throw new Error("需要至少 5 张牌");
  }

  let bestScore: number[] = [];
  let best5: Card[] = [];

  for (const combo of combinations(cards, 5)) {
    const score = eval5(combo);
    if (best5.length === 0 || compareScore(score, bestScore) > 0) {
      bestScore = score;
      best5 = combo;
    }
  }

  return { score: bestScore, best5 };
}

/** 获取牌型名称（带高点描述）*/
function getHandName(score: number[]): string {
  const category = score[0];
  const baseName = CATEGORY_NAMES[category];

  // 为常见牌型添加高点描述
  const rankName = (r: number) => {
    if (r === 14) return "A";
    if (r === 13) return "K";
    if (r === 12) return "Q";
    if (r === 11) return "J";
    return String(r);
  };

  switch (category) {
    case 8: // 同花顺
      return `${baseName} ${rankName(score[1])}高`;
    case 7: // 四条
      return `${baseName} ${rankName(score[1])}`;
    case 6: // 葫芦
      return `${baseName} ${rankName(score[1])}/${rankName(score[2])}`;
    case 5: // 同花
      return `${baseName} ${rankName(score[1])}高`;
    case 4: // 顺子
      return `${baseName} ${rankName(score[1])}高`;
    case 3: // 三条
      return `${baseName} ${rankName(score[1])}`;
    case 2: // 两对
      return `${baseName} ${rankName(score[1])}/${rankName(score[2])}`;
    case 1: // 一对
      return `${baseName} ${rankName(score[1])}`;
    case 0: // 高牌
      return `${baseName} ${rankName(score[1])}`;
    default:
      return baseName;
  }
}

/** 公开接口: 评估手牌+公牌组合，返回最佳 5 张 + 牌型名 */
export function evaluateBestHand(
  hole: Card[],
  community: Card[],
): { best5: Card[]; handRank: string } | null {
  if (hole.length === 0 || community.length === 0) {
    return null;
  }

  const allCards = [...hole, ...community];
  if (allCards.length < 5) {
    return null;
  }

  const { score, best5 } = evaluateBest(allCards);
  const handRank = getHandName(score);

  return { best5, handRank };
}

