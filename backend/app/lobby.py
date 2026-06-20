"""大厅：管理所有房间索引与生命周期。"""
from typing import Literal

from .game.engine import GameEngine
from .game.texas import TexasEngine
from .game.brag import BragEngine
from .game.guandan import GuandanEngine


class Lobby:
    """全局大厅，持有所有房间引擎。"""

    def __init__(self):
        self.tables: dict[str, GameEngine] = {}
        self._next_seq = 1  # 房间号自增序列，格式化为 6 位（000001）

    def create_table(
        self,
        name: str,
        game_type: Literal["texas", "guandan", "brag"],
        seats: int,
        initial_chips: int = 1000,
        small_blind: int | None = None,
        ante: int | None = None,
        spectatable: bool = True,
        game_mode: str = "continuous",
        max_hands: int | None = None,
    ) -> str:
        """创建房间，返回 table_id。"""
        # 简短自增房间号（000001、000002…），跳过偶发已占用号
        while f"{self._next_seq:06d}" in self.tables:
            self._next_seq += 1
        table_id = f"{self._next_seq:06d}"
        self._next_seq += 1

        if game_type == "texas":
            engine = TexasEngine(
                table_id=table_id,
                name=name,
                small_blind=small_blind or 10,
                initial_chips=initial_chips,
                max_seats=seats,
                game_mode=game_mode,
                max_hands=max_hands,
            )
        elif game_type == "guandan":
            engine = GuandanEngine(
                table_id=table_id,
                name=name,
                game_mode=game_mode,
                max_hands=max_hands,
            )
        elif game_type == "brag":
            engine = BragEngine(
                table_id=table_id,
                name=name,
                ante=ante or 10,
                initial_chips=initial_chips,
                max_seats=seats,
                game_mode=game_mode,
                max_hands=max_hands,
            )
        else:
            raise ValueError(f"未知玩法: {game_type}")

        self.tables[table_id] = engine
        return table_id

    def get_table(self, table_id: str) -> GameEngine | None:
        return self.tables.get(table_id)

    def remove_table(self, table_id: str) -> None:
        self.tables.pop(table_id, None)

    def cleanup_empty(self, active_sids: set[str]) -> list[str]:
        """清理无真人在座的房间（死局回收）。

        判定"无真人"：遍历房间 players，只要有任意一个 **非 bot** 玩家的 sid
        仍在 `active_sids`（当前活跃 socket 会话）中，即视为有真人，**保留**。
        否则（全 bot / 空桌 / 真人均已离线）删除。

        参数:
            active_sids: 当前活跃的真人 socket sid 集合（来自 sio.sessions）。
        返回:
            被清理掉的 table_id 列表。
        """
        removed: list[str] = []
        for tid, engine in list(self.tables.items()):
            players = getattr(engine, "players", {}) or {}
            has_live_human = any(
                (not getattr(p, "is_bot", False)) and p.sid in active_sids
                for p in players.values()
            )
            if not has_live_human:
                self.tables.pop(tid, None)
                removed.append(tid)
        return removed

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

    def quick_match(self, game_type: str) -> str | None:
        """快速匹配：选一个等待中未满的指定玩法房间，返回 table_id 或 None。

        优先选 seats_taken 最多的未满房间（更快凑齐开局）。
        """
        candidates = []
        for tid, engine in self.tables.items():
            if engine.game_type != game_type:
                continue
            state = engine.public_state()
            players = state.get("players", [])
            seats_taken = len(players)
            status = "waiting" if state.get("stage") == "waiting" else "playing"

            # 筛选: waiting 且未满
            if status == "waiting" and seats_taken < engine.max_players:
                candidates.append((tid, seats_taken))

        if not candidates:
            return None

        # 选 seats_taken 最多的(更快凑齐)
        candidates.sort(key=lambda x: x[1], reverse=True)
        return candidates[0][0]


# 全局单例
lobby = Lobby()