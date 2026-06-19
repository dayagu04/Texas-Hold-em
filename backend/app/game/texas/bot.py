"""德州扑克 Bot 策略。"""
import random


def decide_bot_action(player, public_state: dict, private_state: dict) -> tuple[str, dict]:
    """Bot 决策函数，返回 (action, payload)。

    level 从 player.bot_level 读取（'easy' | 'normal'）。
    """
    level = player.bot_level or "easy"
    legal_actions = private_state.get("legal_actions", [])
    if not legal_actions:
        return "check", {}

    hole = private_state.get("hole", [])
    if not hole or len(hole) < 2:
        # 兜底：优先 check / call
        for act in legal_actions:
            if act["action"] in ["check", "call"]:
                return act["action"], {}
        return "fold", {}

    hand_strength = _evaluate_hand_strength(hole)
    payload_data = public_state.get("payload", {})
    pot = payload_data.get("pot", 0)
    current_bet = payload_data.get("current_bet", 0)
    player_bets = payload_data.get("player_bets", {})
    to_call = current_bet - player_bets.get(player.sid, 0)

    if level == "easy":
        return _easy_strategy(hand_strength, to_call, player.chips, pot, legal_actions)
    else:
        return _normal_strategy(hand_strength, to_call, player.chips, pot, legal_actions)


def _easy_strategy(strength: float, to_call: int, chips: int,
                   pot: int, legal: list[dict]) -> tuple[str, dict]:
    """简单策略：阈值决策。"""
    legal_map = {a["action"]: a for a in legal}

    if strength < 0.3 and to_call > chips * 0.1:
        return "fold", {}

    if to_call == 0:
        if strength > 0.7 and random.random() < 0.6 and "raise" in legal_map:
            amount = 20 * random.randint(2, 4)
            return "raise", {"amount": amount}
        if "check" in legal_map:
            return "check", {}

    if to_call >= chips:
        pot_odds = pot / max(to_call, 1)
        if strength > 0.6 or (pot_odds > 3 and strength > 0.4):
            if "all_in" in legal_map:
                return "all_in", {}
        return "fold", {}

    if strength > 0.8:
        if random.random() < 0.7 and "raise" in legal_map:
            amount = to_call * random.randint(2, 3)
            return "raise", {"amount": amount}
        if "call" in legal_map:
            return "call", {}

    if strength > 0.5:
        pot_odds = pot / max(to_call, 1)
        if to_call < chips * 0.15 or pot_odds > 2:
            if "call" in legal_map:
                return "call", {}
        return "fold", {}

    pot_odds = pot / max(to_call, 1)
    if to_call < 20 and pot_odds > 4:
        if "call" in legal_map:
            return "call", {}
    return "fold", {}


def _normal_strategy(strength: float, to_call: int, chips: int,
                     pot: int, legal: list[dict]) -> tuple[str, dict]:
    """进阶策略：加入虚张声势。"""
    legal_map = {a["action"]: a for a in legal}

    if strength < 0.25 and to_call > chips * 0.1:
        if random.random() < 0.05 and "raise" in legal_map:
            amount = to_call * 2
            return "raise", {"amount": amount}
        return "fold", {}

    if to_call == 0:
        if strength > 0.65 and random.random() < 0.7 and "raise" in legal_map:
            amount = 30 * random.randint(2, 5)
            return "raise", {"amount": amount}
        if "check" in legal_map:
            return "check", {}

    pot_odds = pot / max(to_call, 1)
    if strength > 0.75:
        if "raise" in legal_map and random.random() < 0.8:
            amount = to_call * random.randint(2, 4)
            return "raise", {"amount": amount}
        if "call" in legal_map:
            return "call", {}

    if strength > 0.45:
        if to_call < chips * 0.2 or pot_odds > 2.5:
            if "call" in legal_map:
                return "call", {}
        return "fold", {}

    if pot_odds > 4 and "call" in legal_map:
        return "call", {}
    return "fold", {}


def _evaluate_hand_strength(hole: list[dict]) -> float:
    """简化的手牌评估：0-1 之间。"""
    if len(hole) < 2:
        return 0.0

    rank1, rank2 = hole[0]["rank"], hole[1]["rank"]
    suit1, suit2 = hole[0]["suit"], hole[1]["suit"]

    strength = 0.0

    if rank1 == rank2:
        strength = 0.5 + (rank1 / 28.0)
        return min(strength, 1.0)

    if suit1 == suit2:
        strength += 0.1

    high = max(rank1, rank2)
    low = min(rank1, rank2)
    strength += high / 28.0

    if abs(rank1 - rank2) <= 2:
        strength += 0.05

    if high >= 11 and low >= 10:
        strength += 0.15

    return min(strength, 1.0)
