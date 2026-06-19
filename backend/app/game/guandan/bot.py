"""掼蛋 Bot 策略（v1 简化版）。

- easy：贪小——开张出最小单张，跟牌用最小可压单张/对子。
- normal：成组出牌——开张优先甩对子（更快清手），跟牌保留大牌
  （若唯一可压牌过大且手牌仍多则过牌）。
"""
import random
from collections import Counter
from .combos import identify_combo, can_beat


def decide_bot_action(player, public_state: dict, private_state: dict) -> tuple[str, dict]:
    """Bot 决策函数，返回 (action, payload)。"""
    level = player.bot_level or "easy"
    legal_actions = private_state.get("legal_actions", [])
    if not legal_actions:
        return "pass", {}

    legal_map = {a["action"]: a for a in legal_actions}
    hole = private_state.get("hole", [])
    payload_data = public_state.get("payload", {})
    last_play = payload_data.get("last_play")

    if not hole or "play" not in legal_map:
        return "pass", {}

    # ---- 开张 ----
    if not last_play:
        if level == "normal":
            # 进阶：优先甩对子，成组清手更快
            pair = _find_pair(hole)
            if pair:
                return "play", {"cards": pair}
        # easy 或无对子：出最小单张
        return "play", {"cards": [_smallest(hole)]}

    # ---- 跟牌：尝试压过 ----
    combo_type = last_play["combo_type"]

    if combo_type == "single":
        last_rank = last_play["cards"][0]["rank"]
        candidates = sorted(
            (c for c in hole if c["rank"] > last_rank),
            key=lambda c: c["rank"],
        )
        if candidates:
            if level == "normal":
                # 进阶：保留大牌——唯一可压牌过大且手牌仍多时 pass
                if candidates[0]["rank"] >= 14 and len(hole) > 5 and "pass" in legal_map:
                    return "pass", {}
            return "play", {"cards": [candidates[0]]}

    elif combo_type == "pair":
        last_rank = last_play["cards"][0]["rank"]
        pair = _find_pair(hole, min_rank=last_rank)
        if pair:
            return "play", {"cards": pair}

    # 无法压过，pass
    if "pass" in legal_map:
        return "pass", {}

    # 没有 pass（开张），出最小单张
    return "play", {"cards": [_smallest(hole)]}


def _smallest(hole: list[dict]) -> dict:
    """返回最小点数的单张。"""
    return min(hole, key=lambda c: c["rank"])


def _find_pair(hole: list[dict], min_rank: int = 0) -> list[dict] | None:
    """找到点数严格大于 min_rank 的最小对子，返回两张牌；无则 None。"""
    counts = Counter(c["rank"] for c in hole)
    for rank in sorted(counts):
        if rank > min_rank and counts[rank] >= 2:
            return [c for c in hole if c["rank"] == rank][:2]
    return None
