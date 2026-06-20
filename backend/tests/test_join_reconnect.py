"""测试同名残留 player 处理（#bugfix-stale-player-no-actions 后端部分）。

根因：玩家断线超时后再以新 sid 加入同桌，engine.players 里残留旧 sid 的同名
player，导致 current_turn 指向失效旧 sid、真实玩家收到 legal_actions=[]。

覆盖：
  - lobby_join_table 迁移同名残留 player 到新 sid（沿用旧座位）
  - 无残留时走自动选座
  - disconnect 超时在 hand 未开局时从引擎移除 player
"""
import asyncio

import pytest

from backend.app import sio as sio_mod
from backend.app.lobby import Lobby


@pytest.fixture
def fresh_state(monkeypatch):
    """每个用例用全新 lobby / sessions，并把网络调用替换为 no-op。

    状态已迁入 sio.state 子模块，monkeypatch 目标相应改为 sio_mod.state.X。
    """
    lobby = Lobby()
    monkeypatch.setattr(sio_mod.state, "lobby", lobby)
    monkeypatch.setattr(sio_mod.state, "sessions", {})
    monkeypatch.setattr(sio_mod.state, "name_to_sid", {})
    monkeypatch.setattr(sio_mod.state, "disconnect_timers", {})
    monkeypatch.setattr(sio_mod.state, "turn_timers", {})

    async def _noop(*args, **kwargs):
        return None

    # sio.emit / enter_room / leave_room：避免真正发网络包
    monkeypatch.setattr(sio_mod.sio, "emit", _noop)
    monkeypatch.setattr(sio_mod.sio, "enter_room", _noop)
    monkeypatch.setattr(sio_mod.sio, "leave_room", _noop)
    return lobby


def _names_in(engine):
    return [p.name for p in engine.players.values()]


def test_join_replaces_stale_player(fresh_state):
    """同名残留：新 sid 加入应迁移旧 player，不新增；座位沿用旧 player。"""
    lobby = fresh_state
    table_id = lobby.create_table(name="t", game_type="texas", seats=6)
    engine = lobby.get_table(table_id)

    # sid_A 在 seat=0，模拟断线后引擎里仍残留（disconnect 超时未清的旧 player）
    engine.add_player("sid_A", "Alice", seat=0)
    # 模拟引擎已把残留旧 sid 选为当前行动者
    engine.current_turn = "sid_A"

    # 新 sid_B 用同 name 加入
    sio_mod.state.sessions["sid_B"] = {"name": "Alice", "table_id": None}
    asyncio.run(sio_mod.lobby_join_table("sid_B", {"table_id": table_id}))

    alice_players = [p for p in engine.players.values() if p.name == "Alice"]
    assert len(alice_players) == 1
    assert "sid_A" not in engine.players
    assert "sid_B" in engine.players
    assert engine.players["sid_B"].sid == "sid_B"
    assert engine.players["sid_B"].seat == 0
    # current_turn 同步迁移到新 sid
    assert engine.current_turn == "sid_B"
    assert sio_mod.state.sessions["sid_B"]["table_id"] == table_id


def test_join_assigns_new_seat_when_no_stale(fresh_state):
    """无同名残留：不同 name 加入走自动选座，落在下一个空位。"""
    lobby = fresh_state
    table_id = lobby.create_table(name="t", game_type="texas", seats=6)
    engine = lobby.get_table(table_id)
    engine.add_player("sid_A", "Alice", seat=0)

    sio_mod.state.sessions["sid_B"] = {"name": "Bob", "table_id": None}
    asyncio.run(sio_mod.lobby_join_table("sid_B", {"table_id": table_id}))

    assert "sid_B" in engine.players
    assert engine.players["sid_B"].name == "Bob"
    assert engine.players["sid_B"].seat == 1
    # 两人都在，无误删
    assert len(engine.players) == 2


def test_disconnect_cleanup_removes_player_when_idle(fresh_state, monkeypatch):
    """hand 未开局（WAITING）时 disconnect 超时应从引擎移除 player。"""
    lobby = fresh_state
    table_id = lobby.create_table(name="t", game_type="texas", seats=6)
    engine = lobby.get_table(table_id)
    engine.add_player("sid_A", "Alice", seat=0)

    sio_mod.state.sessions["sid_A"] = {"name": "Alice", "table_id": table_id}
    sio_mod.state.name_to_sid["Alice"] = "sid_A"
    # 标记计时器存在，让超时逻辑认为尚未重连
    sio_mod.state.disconnect_timers["sid_A"] = object()

    # 跳过真实 30s 等待
    async def _instant_sleep(*args, **kwargs):
        return None

    monkeypatch.setattr(sio_mod.asyncio, "sleep", _instant_sleep)

    assert engine.hand_in_progress is False
    asyncio.run(sio_mod._handle_disconnect_timeout("sid_A", table_id))

    assert "sid_A" not in engine.players
    assert "sid_A" not in sio_mod.state.sessions
    assert "Alice" not in sio_mod.state.name_to_sid
