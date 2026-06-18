"""7 选 5 最优牌型评估。

返回一个可直接比较大小的元组：(category, tiebreakers...)
category 越大牌型越强：
  8 同花顺 / 7 四条 / 6 葫芦 / 5 同花 / 4 顺子
  3 三条 / 2 两对 / 1 一对 / 0 高牌
"""
from collections import Counter
from itertools import combinations

from .cards import Card

CATEGORY_NAMES = {
    8: "同花顺", 7: "四条", 6: "葫芦", 5: "同花",
    4: "顺子", 3: "三条", 2: "两对", 1: "一对", 0: "高牌",
}


def _straight_high(ranks: set[int]):
    """给定点数集合，返回顺子的最高点；无顺子返回 None。处理 A-2-3-4-5。"""
    if {14, 2, 3, 4, 5}.issubset(ranks):
        wheel = True
    else:
        wheel = False
    for high in range(14, 5, -1):
        if all(r in ranks for r in range(high, high - 5, -1)):
            return high
    return 5 if wheel else None


def _eval_5(cards: list[Card]) -> tuple:
    """评估恰好 5 张牌，返回可比较元组。"""
    ranks = sorted((c.rank for c in cards), reverse=True)
    rank_counts = Counter(ranks)
    suits = [c.suit for c in cards]
    is_flush = len(set(suits)) == 1
    straight_high = _straight_high(set(ranks))

    # 按出现次数、再按点数排序，便于葫芦/四条等比较
    by_count = sorted(rank_counts.items(), key=lambda x: (x[1], x[0]), reverse=True)
    counts = [c for _, c in by_count]
    ordered_ranks = [r for r, _ in by_count]

    if is_flush and straight_high:
        return (8, straight_high)
    if counts[0] == 4:
        return (7, ordered_ranks[0], ordered_ranks[1])
    if counts[0] == 3 and counts[1] >= 2:
        return (6, ordered_ranks[0], ordered_ranks[1])
    if is_flush:
        return (5, *ranks)
    if straight_high:
        return (4, straight_high)
    if counts[0] == 3:
        return (3, ordered_ranks[0], *ordered_ranks[1:])
    if counts[0] == 2 and counts[1] == 2:
        return (2, ordered_ranks[0], ordered_ranks[1], ordered_ranks[2])
    if counts[0] == 2:
        return (1, ordered_ranks[0], *ordered_ranks[1:])
    return (0, *ranks)


def evaluate_best(cards: list[Card]) -> tuple:
    """从 5~7 张牌中选出最强的 5 张组合，返回最大评估元组。"""
    best = None
    for combo in combinations(cards, 5):
        score = _eval_5(list(combo))
        if best is None or score > best:
            best = score
    return best
