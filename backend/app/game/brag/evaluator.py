"""炸金花 3 张牌型评估。

牌型由强到弱：
1. 豹子 Trips (AAA)
2. 同花顺 Straight Flush
3. 同花 Flush
4. 顺子 Straight (A-2-3 最小，A-K-Q 最大)
5. 对子 Pair
6. 散牌 High Card

返回可比较的元组 (category, tiebreakers...)
"""
from collections import Counter

CATEGORY_NAMES = {
    5: "豹子",
    4: "同花顺",
    3: "同花",
    2: "顺子",
    1: "对子",
    0: "散牌",
}


def evaluate_brag_hand(cards: list) -> tuple:
    """评估 3 张牌，返回可比较元组。

    cards: list[dict] 格式 [{"rank": int, "suit": str, "code": str}, ...]
    """
    if len(cards) != 3:
        raise ValueError("炸金花必须是 3 张牌")

    ranks = sorted([c["rank"] for c in cards], reverse=True)
    suits = [c["suit"] for c in cards]
    rank_counts = Counter(ranks)

    is_flush = len(set(suits)) == 1
    is_straight = _is_straight(ranks)

    # 豹子：三张同点
    if len(rank_counts) == 1:
        return (5, ranks[0])

    # 同花顺
    if is_flush and is_straight:
        high = _straight_high(ranks)
        return (4, high)

    # 同花
    if is_flush:
        return (3, *ranks)

    # 顺子
    if is_straight:
        high = _straight_high(ranks)
        return (2, high)

    # 对子
    if len(rank_counts) == 2:
        pair_rank = [r for r, cnt in rank_counts.items() if cnt == 2][0]
        kicker = [r for r, cnt in rank_counts.items() if cnt == 1][0]
        return (1, pair_rank, kicker)

    # 散牌
    return (0, *ranks)


def _is_straight(ranks: list[int]) -> bool:
    """判断是否是顺子。处理 A-2-3 特例。"""
    if ranks == [14, 3, 2]:  # A-2-3
        return True
    return ranks[0] - ranks[2] == 2 and len(set(ranks)) == 3


def _straight_high(ranks: list[int]) -> int:
    """返回顺子的最高点。A-2-3 返回 3（最小顺），A-K-Q 返回 14。"""
    if ranks == [14, 3, 2]:
        return 3  # A-2-3 最小顺
    return ranks[0]