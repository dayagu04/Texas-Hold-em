"""炸金花 Bot 策略。"""
import random
from .evaluator import evaluate_brag_hand


def decide_bot_action(player, public_state: dict, private_state: dict) -> tuple[str, dict]:
    """Bot 决策函数，返回 (action, payload)。"""
    level = player.bot_level or "easy"
    legal_actions = private_state.get("legal_actions", [])
    if not legal_actions:
        return "fold", {}

    legal_map = {a["action"]: a for a in legal_actions}
    hole = private_state.get("hole", [])

    if not hole or len(hole) != 3:
        # 兜底
        if "fold" in legal_map:
            return "fold", {}
        return "call", {}

    # 评估手牌强度
    score = evaluate_brag_hand(hole)
    category = score[0]  # 0=散牌, 1=对子, 2=顺子, 3=同花, 4=同花顺, 5=豹子

    if level == "easy":
        return _easy_strategy(category, player, public_state, legal_map)
    else:
        return _normal_strategy(category, player, public_state, private_state, legal_map)


def _easy_strategy(category: int, player, public_state: dict, legal: dict) -> tuple[str, dict]:
    """简单策略：仅看牌型档位。"""
    payload_data = public_state.get("payload", {})
    looked = payload_data.get("looked", {})
    active_sids = payload_data.get("active_sids", [])

    # 散牌：50% fold / 50% call 一次后 fold
    if category == 0:
        if random.random() < 0.5:
            return "fold", {}
        if "call" in legal:
            return "call", {}
        return "fold", {}

    # 对子：一直 call
    if category == 1:
        if not player.looked and "look" in legal:
            return "look", {}
        if "call" in legal:
            return "call", {}
        return "fold", {}

    # 顺子 / 同花及以上：必看牌 + 适度加注
    if category >= 2:
        if not player.looked and "look" in legal:
            return "look", {}
        if category >= 4 and "raise" in legal and random.random() < 0.5:
            # 同花顺 / 豹子：50% 加注
            current_bet = public_state.get("payload", {}).get("current_bet", 10)
            return "raise", {"amount": current_bet * 2}
        if "call" in legal:
            return "call", {}
        return "fold", {}

    # 豹子：闷牌到底，最后 compare
    if category == 5:
        if len(active_sids) == 2 and "compare" in legal and player.looked:
            # 剩 2 人时主动 compare
            target = [sid for sid in active_sids if sid != player.sid][0]
            return "compare", {"target_sid": target}
        if "call" in legal:
            return "call", {}
        return "fold", {}

    return "call", {}


def _normal_strategy(category: int, player, public_state: dict,
                     private_state: dict, legal: dict) -> tuple[str, dict]:
    """进阶策略：跟踪 pot odds + 对手强度估计。"""
    payload_data = public_state.get("payload", {})
    pot = payload_data.get("pot", 0)
    current_bet = payload_data.get("current_bet", 10)
    looked = payload_data.get("looked", {})
    active_sids = payload_data.get("active_sids", [])

    multiplier = 2 if player.looked else 1
    to_call = current_bet * multiplier
    pot_odds = pot / max(to_call, 1) if to_call > 0 else 10

    # 散牌：根据 pot odds 判断是否值得博
    if category == 0:
        if pot_odds > 3 and random.random() < 0.3:
            if "call" in legal:
                return "call", {}
        return "fold", {}

    # 对子：中等牌，看 pot odds
    if category == 1:
        if not player.looked and "look" in legal:
            return "look", {}
        if pot_odds > 2 and "call" in legal:
            return "call", {}
        if pot_odds <= 2:
            return "fold", {}
        return "call", {}

    # 顺子 / 同花：强牌，主动加注
    if category >= 2:
        if not player.looked and "look" in legal:
            return "look", {}
        if "raise" in legal and random.random() < 0.7:
            return "raise", {"amount": current_bet * 2}
        if "call" in legal:
            return "call", {}

    # 同花顺 / 豹子：最强牌，仅剩 2 人时主动 compare
    if category >= 4:
        if len(active_sids) == 2 and "compare" in legal and player.looked:
            target = [sid for sid in active_sids if sid != player.sid][0]
            return "compare", {"target_sid": target}
        # 弱牌时 30% bluff raise
        if category < 2 and "raise" in legal and random.random() < 0.3:
            return "raise", {"amount": current_bet * 2}
        if "call" in legal:
            return "call", {}

    return "call", {}