/*
 * 紧凑卡牌串解析（个人中心对局历史用）。
 * 后端 history 的 hole/board 是连续 2 字符卡牌 code：rank 字符 + suit 字符。
 *   例 "8d3s" = 8♦ 3♠，"AhKsQc" = A♥ K♠ Q♣。
 *   rank：2-9 / T(10) / J Q K A；suit：s h d c（小写）。
 * 产出 CardSprite 可直接消费的 Card[]（suit 归一为大写以匹配 Suit 类型，
 * CardSprite 内部再 toLowerCase，故大小写均可渲染）。
 */
import type { Card, Suit } from "../types";

const RANK_MAP: Record<string, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

const VALID_SUITS: Suit[] = ["S", "H", "D", "C", "J"];

export function parseCards(s: string): Card[] {
  if (!s) return [];
  const out: Card[] = [];
  for (let i = 0; i + 1 < s.length; i += 2) {
    const rankChar = s[i].toUpperCase();
    const suitChar = s[i + 1];
    const rank = RANK_MAP[rankChar] ?? 0;
    const upperSuit = suitChar.toUpperCase() as Suit;
    const suit: Suit = VALID_SUITS.includes(upperSuit) ? upperSuit : "S";
    out.push({ rank, suit, code: `${s[i]}${suitChar}` });
  }
  return out;
}
