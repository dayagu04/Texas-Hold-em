"""测试死局清理：lobby.cleanup_empty（功能需求 #005 任务 C）。

安全红线：只删无真人在座的房间，正在玩的真人局绝不误删。
"""
import pytest

from backend.app.lobby import Lobby


def _make_lobby_with_table(game_type="texas", **kw):
    lobby = Lobby()
    if game_type == "guandan":
        tid = lobby.create_table(name="t", game_type="guandan", seats=4)
    else:
        tid = lobby.create_table(name="t", game_type=game_type, seats=6, **kw)
    return lobby, tid


def test_cleanup_removes_all_bot_table():
    """全 bot 房间（无真人）应被清理。"""
    lobby, tid = _make_lobby_with_table("texas")
    engine = lobby.get_table(tid)
    engine.add_player("bot_1", "Bot1", 0, is_bot=True, bot_level="easy")
    engine.add_player("bot_2", "Bot2", 1, is_bot=True, bot_level="normal")

    removed = lobby.cleanup_empty(active_sids=set())
    assert tid in removed
    assert lobby.get_table(tid) is None


def test_cleanup_removes_empty_table():
    """空桌（无任何玩家）应被清理。"""
    lobby, tid = _make_lobby_with_table("brag", ante=10)

    removed = lobby.cleanup_empty(active_sids=set())
    assert tid in removed
    assert lobby.get_table(tid) is None


def test_cleanup_keeps_table_with_live_human():
    """有活跃真人在座的房间绝不能被清理。"""
    lobby, tid = _make_lobby_with_table("texas")
    engine = lobby.get_table(tid)
    engine.add_player("human_sid", "Alice", 0)  # 真人
    engine.add_player("bot_1", "Bot1", 1, is_bot=True, bot_level="easy")

    # human_sid 在活跃会话中
    removed = lobby.cleanup_empty(active_sids={"human_sid"})
    assert tid not in removed
    assert lobby.get_table(tid) is not None


def test_cleanup_removes_table_with_offline_human():
    """真人已离线（sid 不在 active_sids）→ 视为死局，清理。"""
    lobby, tid = _make_lobby_with_table("texas")
    engine = lobby.get_table(tid)
    engine.add_player("human_sid", "Alice", 0)
    engine.add_player("bot_1", "Bot1", 1, is_bot=True, bot_level="easy")

    # 真人 sid 不在活跃集合（断线）
    removed = lobby.cleanup_empty(active_sids={"someone_else"})
    assert tid in removed
    assert lobby.get_table(tid) is None


def test_cleanup_mixed_tables():
    """多桌混合：仅清死局，保留真人局，返回正确的 id 列表。"""
    lobby = Lobby()
    # 死局 1：全 bot
    dead1 = lobby.create_table(name="dead1", game_type="texas", seats=6)
    lobby.get_table(dead1).add_player("b0", "B0", 0, is_bot=True, bot_level="easy")
    # 死局 2：空桌
    dead2 = lobby.create_table(name="dead2", game_type="brag", seats=6, ante=10)
    # 真人局：有活跃真人
    live = lobby.create_table(name="live", game_type="texas", seats=6)
    lobby.get_table(live).add_player("alice", "Alice", 0)
    lobby.get_table(live).add_player("b1", "B1", 1, is_bot=True, bot_level="normal")

    removed = lobby.cleanup_empty(active_sids={"alice"})

    assert set(removed) == {dead1, dead2}
    assert lobby.get_table(live) is not None
    assert lobby.get_table(dead1) is None
    assert lobby.get_table(dead2) is None


def test_cleanup_empty_lobby_returns_empty_list():
    """无任何房间时返回空列表，不报错。"""
    lobby = Lobby()
    assert lobby.cleanup_empty(active_sids=set()) == []
