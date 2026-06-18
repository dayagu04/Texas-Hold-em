"""GameEngine 抽象：所有玩法引擎的统一契约。

引擎是纯状态机，不直接调用网络层（sio.emit）。
网络事件由 sio.py 调用引擎方法后，再根据 public_state / private_state 广播。
"""
from typing import Protocol, Literal


class GameEngine(Protocol):
    """所有玩法引擎必须实现的接口。"""

    game_type: Literal["texas", "guandan", "brag"]
    min_players: int
    max_players: int

    def add_player(
        self,
        sid: str,
        name: str,
        seat: int,
        is_bot: bool = False,
        bot_level: str | None = None
    ) -> None:
        """添加玩家到指定座位。bot_level 为 'easy' | 'normal' 或 None。"""
        ...

    def remove_player(self, sid: str) -> None:
        """移除玩家（离桌或断线）。"""
        ...

    def can_start(self) -> bool:
        """当前是否满足开局条件（人数 >= min_players）。"""
        ...

    def start_hand(self) -> None:
        """开始新的一手/一局。发牌、初始化回合状态。"""
        ...

    def handle_action(self, sid: str, action: str, payload: dict) -> tuple[bool, str]:
        """处理玩家行动。返回 (是否成功, 错误信息)。"""
        ...

    def public_state(self) -> dict:
        """返回公开状态（所有人可见）。

        **硬约束**：不得包含任何玩家的底牌（hole）字段。
        """
        ...

    def private_state(self, sid: str) -> dict:
        """返回特定玩家的私有状态（仅该玩家可见）。

        包含：hole（底牌）、legal_actions（当前可用操作）。
        """
        ...

    def is_hand_over(self) -> bool:
        """当前一手/一局是否已结束。"""
        ...

    def next_bot_action(self) -> tuple[str, str, dict] | None:
        """若当前回合是 Bot，返回 (sid, action, payload)；否则返回 None。

        由 sio.py 调度循环调用，用于驱动 Bot 自动行动。
        """
        ...
