"""简单的AI机器人玩家逻辑。"""
import random
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .table import Table, Player


class PokerBot:
    """简单AI：根据牌力和底池大小做决策。"""

    def __init__(self, name: str):
        self.name = name
        self.personality = random.choice(['aggressive', 'conservative', 'balanced'])

    def decide_action(self, player: 'Player', table: 'Table') -> tuple[str, int]:
        """返回 (action, amount)"""
        # 计算牌力（简化版：根据底牌的点数）
        if not player.hole or len(player.hole) < 2:
            return ('check', 0)

        hand_strength = self._evaluate_hand_strength(player.hole)
        pot_odds = table.pot / max(table.current_bet, 1)
        to_call = table.current_bet - player.bet

        # 极弱牌：弃牌
        if hand_strength < 0.3 and to_call > player.chips * 0.1:
            return ('fold', 0)

        # 无需跟注
        if to_call == 0:
            # 强牌加注
            if hand_strength > 0.7 and random.random() < 0.6:
                raise_to = table.current_bet + table.big_blind * random.randint(2, 4)
                return ('raise', min(raise_to, player.chips + player.bet))
            return ('check', 0)

        # 需要跟注
        if to_call >= player.chips:
            # 全下决策
            if hand_strength > 0.6 or (pot_odds > 3 and hand_strength > 0.4):
                return ('allin', 0)
            return ('fold', 0)

        # 强牌
        if hand_strength > 0.8:
            if random.random() < 0.7:
                raise_to = table.current_bet + to_call * random.randint(2, 3)
                return ('raise', min(raise_to, player.chips + player.bet))
            return ('call', 0)

        # 中等牌
        if hand_strength > 0.5:
            if to_call < player.chips * 0.15:
                return ('call', 0)
            if pot_odds > 2:
                return ('call', 0)
            return ('fold', 0)

        # 弱牌
        if to_call < table.big_blind and pot_odds > 4:
            return ('call', 0)
        return ('fold', 0)

    def _evaluate_hand_strength(self, hole_cards) -> float:
        """简化的手牌评估：0-1之间。"""
        if len(hole_cards) < 2:
            return 0.0

        rank1, rank2 = hole_cards[0].rank, hole_cards[1].rank
        suit1, suit2 = hole_cards[0].suit, hole_cards[1].suit

        strength = 0.0

        # 对子
        if rank1 == rank2:
            strength = 0.5 + (rank1 / 28.0)  # AA=0.85, 22=0.57
            return min(strength, 1.0)

        # 同花
        if suit1 == suit2:
            strength += 0.1

        # 高牌
        high = max(rank1, rank2)
        low = min(rank1, rank2)
        strength += high / 28.0  # A=0.5, 2=0.07

        # 连牌
        if abs(rank1 - rank2) <= 2:
            strength += 0.05

        # 两张高牌
        if high >= 11 and low >= 10:  # JT+
            strength += 0.15

        return min(strength, 1.0)
