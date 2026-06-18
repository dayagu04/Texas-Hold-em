"""大厅：管理所有房间索引与生命周期。"""
import uuid
from typing import Literal

from .game.engine import GameEngine
from .game.texas import TexasEngine
from .game.brag import BragEngine
from .game.guandan import GuandanEngine


class Lobby:
    """全局大厅，持有所有房间引擎。"""

    def __init__(self):
        self.tables: dict[str, GameEngine] = {}

    def create_table(
        self,
        name: str,
        game_type: Literal["texas", "guandan", "brag"],
        seats: int,
        initial_chips: int = 1000,
        small_blind: int | None = None,
        ante: int | None = None,
        spectatable: bool = True,
    ) -> str:
        """创建房间，返回 table_id。"""
        table_id = f"t_{uuid.uuid4().hex[:8]}"

        if game_type == "texas":
            engine = TexasEngine(
                table_id=table_id,
                name=name,
                small_blind=small_blind or 10,
                initial_chips=initial_chips,
                max_seats=seats,
            )
        elif game_type == "guandan":
            engine = GuandanEngine(
                table_id=table_id,
                name=name,
            )
        elif game_type == "brag":
            engine = BragEngine(
                table_id=table_id,
                name=name,
                ante=ante or 10,
                initial_chips=initial_chips,
                max_seats=seats,
            )
        else:
            raise ValueError(f"未知玩法: {game_type}")

        self.tables[table_id] = engine
        return table_id

    def get_table(self, table_id: str) -> GameEngine | None:
        return self.tables.get(table_id)

    def remove_table(self, table_id: str) -> None:
        self.tables.pop(table_id, None)

    def list_tables(self) -> list[dict]:
        """返回大厅列表格式（符合 API 契约）。"""
        result = []
        for tid, engine in self.tables.items():
            state = engine.public_state()
            players = state.get("players", [])
            result.append({
                "id": tid,
                "name": engine.name,
                "game_type": engine.game_type,
                "seats_taken": len(players),
                "seats_total": engine.max_players,
                "has_bots": any(p.get("is_bot") for p in players),
                "status": "waiting" if state.get("stage") == "waiting" else "playing",
                "spectatable": True,  # v1 默认可观战
            })
        return result


# 全局单例
lobby = Lobby()