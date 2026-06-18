"""扑克牌与牌堆定义。"""
import random
from dataclasses import dataclass

# 花色：黑桃 s / 红心 h / 方块 d / 梅花 c
SUITS = ["s", "h", "d", "c"]
# 点数 2-14，14 表示 A
RANKS = list(range(2, 15))

RANK_LABELS = {
    11: "J", 12: "Q", 13: "K", 14: "A",
}


@dataclass(frozen=True)
class Card:
    rank: int  # 2-14
    suit: str  # s/h/d/c

    @property
    def code(self) -> str:
        """返回如 'As'、'Th'、'2c' 的简码。"""
        label = RANK_LABELS.get(self.rank, "T" if self.rank == 10 else str(self.rank))
        return f"{label}{self.suit}"

    def to_dict(self) -> dict:
        return {"rank": self.rank, "suit": self.suit, "code": self.code}


class Deck:
    """一副 52 张牌，可洗牌与发牌。"""

    def __init__(self, seed=None):
        self._rng = random.Random(seed)
        self.cards: list[Card] = [Card(r, s) for s in SUITS for r in RANKS]
        self.shuffle()

    def shuffle(self) -> None:
        self._rng.shuffle(self.cards)

    def deal(self, n: int = 1) -> list[Card]:
        dealt = self.cards[:n]
        self.cards = self.cards[n:]
        return dealt
