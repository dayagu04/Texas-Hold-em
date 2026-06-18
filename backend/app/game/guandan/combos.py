"""掼蛋牌型识别与比较。

牌型（由弱到强）：
- 单张 Single (1)
- 对子 Pair (2)
- 三张 Trips (3)
- 三带二 FullHouse (5)
- 顺子 Straight (≥5)
- 三连对 TubePair (≥6，偶数)
- 钢板 Plate (≥6，偶数，3+3+...)
- 同花顺 StraightFlush (≥5)
- 炸弹 Bomb (4-10 张同点)
- 火箭 Rocket (4 王)

比较：同型同张数比关键点；炸弹/火箭可压一切非更大炸。
v1 简化：级牌（2）不作癞子，仅识别为普通牌。
"""
from collections import Counter


def identify_combo(cards: list[dict], level_card: int = 2) -> dict | None:
    """识别牌型，返回 {type, rank, cards} 或 None。

    cards: [{"rank": int, "suit": str, "code": str}, ...]
    level_card: 当前级别牌（v1 固定为 2）
    """
    if not cards:
        return None

    n = len(cards)
    ranks = [c["rank"] for c in cards]
    suits = [c["suit"] for c in cards]
    rank_counts = Counter(ranks)

    # 火箭：4 王
    if n == 4 and all(r in [15, 16] for r in ranks):
        return {"type": "rocket", "rank": 16, "cards": cards}

    # 炸弹：4-10 张同点
    if n >= 4 and len(rank_counts) == 1:
        return {"type": "bomb", "rank": ranks[0], "cards": cards, "bomb_size": n}

    # 同花顺：≥5 张同花顺子
    if n >= 5 and len(set(suits)) == 1 and _is_straight_seq(ranks):
        high = _straight_high(ranks)
        return {"type": "straight_flush", "rank": high, "cards": cards}

    # 单张
    if n == 1:
        return {"type": "single", "rank": ranks[0], "cards": cards}

    # 对子
    if n == 2 and len(rank_counts) == 1:
        return {"type": "pair", "rank": ranks[0], "cards": cards}

    # 三张
    if n == 3 and len(rank_counts) == 1:
        return {"type": "trips", "rank": ranks[0], "cards": cards}

    # 三带二
    if n == 5 and sorted(rank_counts.values()) == [2, 3]:
        trips_rank = [r for r, cnt in rank_counts.items() if cnt == 3][0]
        return {"type": "fullhouse", "rank": trips_rank, "cards": cards}

    # 顺子：≥5 张连续
    if n >= 5 and len(rank_counts) == n and _is_straight_seq(ranks):
        high = _straight_high(ranks)
        return {"type": "straight", "rank": high, "cards": cards}

    # 三连对：≥6 张，偶数，全是对子
    if n >= 6 and n % 2 == 0 and all(cnt == 2 for cnt in rank_counts.values()):
        if _is_straight_seq(list(rank_counts.keys())):
            high = max(rank_counts.keys())
            return {"type": "tube_pair", "rank": high, "cards": cards}

    # 钢板：≥6 张，偶数，全是三张
    if n >= 6 and n % 3 == 0 and all(cnt == 3 for cnt in rank_counts.values()):
        if _is_straight_seq(list(rank_counts.keys())):
            high = max(rank_counts.keys())
            return {"type": "plate", "rank": high, "cards": cards}

    return None


def can_beat(combo_a: dict, combo_b: dict) -> bool:
    """判断 combo_a 能否压过 combo_b。"""
    if not combo_b:
        return True  # 开张

    # 火箭压一切
    if combo_a["type"] == "rocket":
        return True
    if combo_b["type"] == "rocket":
        return False

    # 炸弹逻辑
    if combo_a["type"] == "bomb":
        if combo_b["type"] != "bomb" and combo_b["type"] != "straight_flush":
            return True  # 炸弹压非炸非同花顺
        if combo_b["type"] == "bomb":
            # 炸弹比张数，再比点数
            if combo_a["bomb_size"] != combo_b["bomb_size"]:
                return combo_a["bomb_size"] > combo_b["bomb_size"]
            return combo_a["rank"] > combo_b["rank"]
        if combo_b["type"] == "straight_flush":
            # v1 简化序：5 张同花顺 > 5 炸，但 < 6 炸
            sf_size = len(combo_b["cards"])
            return combo_a["bomb_size"] > sf_size
        return False

    if combo_b["type"] == "bomb":
        return False  # 非炸不能压炸

    # 同花顺逻辑
    if combo_a["type"] == "straight_flush":
        if combo_b["type"] != "straight_flush" and combo_b["type"] != "bomb":
            return True  # 同花顺压非炸非同花顺
        if combo_b["type"] == "straight_flush":
            # 同型同张数比高点
            if len(combo_a["cards"]) != len(combo_b["cards"]):
                return False
            return combo_a["rank"] > combo_b["rank"]
        if combo_b["type"] == "bomb":
            # v1 简化：5 张同花顺 > 5 炸，但 < 6 炸
            return len(combo_a["cards"]) > combo_b["bomb_size"]
        return False

    if combo_b["type"] == "straight_flush":
        return False

    # 同型同张数
    if combo_a["type"] != combo_b["type"]:
        return False
    if len(combo_a["cards"]) != len(combo_b["cards"]):
        return False

    # 比关键点
    return combo_a["rank"] > combo_b["rank"]


def _is_straight_seq(ranks: list[int]) -> bool:
    """判断是否连续（处理 A 可作 1）。"""
    unique = sorted(set(ranks))
    if len(unique) != len(ranks):
        return False  # 有重复

    # 普通顺子
    if unique[-1] - unique[0] == len(unique) - 1:
        return True

    # A-2-3-4-5 (14, 2, 3, 4, 5)
    if 14 in unique and 2 in unique:
        # 检查 2-3-4-5-A 是否连续
        temp = [r if r != 14 else 1 for r in unique]
        temp = sorted(temp)
        return temp[-1] - temp[0] == len(temp) - 1

    return False


def _straight_high(ranks: list[int]) -> int:
    """返回顺子最高点。A-2-3-4-5 返回 5（A 作 1）。"""
    unique = sorted(set(ranks))
    if 14 in unique and 2 in unique and unique == sorted([14, 2, 3, 4, 5]):
        return 5  # A-2-3-4-5，A 作 1，high=5
    return max(unique)