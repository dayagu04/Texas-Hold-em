"""掼蛋 Bot 策略（v1 简化版）。"""
import random
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

    if not hole:
        return "pass", {}

    # 简化策略：出最小合法牌型
    if "play" not in legal_map:
        return "pass", {}

    # 尝试找最小单张
    if not last_play:
        # 开张：出最小单张
        ranks = sorted([c["rank"] for c in hole])
        smallest = [c for c in hole if c["rank"] == ranks[0]][0]
        return "play", {"cards": [smallest]}

    # 尝试压过
    last_combo = {"type": last_play["combo_type"], "cards": last_play["cards"]}

    # 简化：只尝试单张压单张
    if last_combo["type"] == "single":
        last_rank = last_play["cards"][0]["rank"]
        for c in hole:
            if c["rank"] > last_rank:
                return "play", {"cards": [c]}

    # 无法压过，pass
    if "pass" in legal_map:
        return "pass", {}

    # 没有 pass（开张），出最小单张
    ranks = sorted([c["rank"] for c in hole])
    smallest = [c for c in hole if c["rank"] == ranks[0]][0]
    return "play", {"cards": [smallest]}
