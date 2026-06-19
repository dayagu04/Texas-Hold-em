"""测试多局模式 next_hand_in 计算（#006 single/continuous/limited）。

驱动方式：2 人德州，preflop 一方 fold 即触发 _finish_hand（确定性，无需跑到摊牌）。
模式语义见 docs/features/006-hand-end-ui-multi-rounds.md §2.2。
"""
import pytest

from backend.app.game.texas.engine import TexasEngine
from backend.app.game.brag.engine import BragEngine


def _texas(game_mode="continuous", max_hands=None, players=2):
    e = TexasEngine("t", "x", small_blind=10, game_mode=game_mode, max_hands=max_hands)
    for i in range(players):
        e.add_player(f"p{i}", f"P{i}", seat=i)
    return e


def _play_one_hand_to_finish(engine):
    """开局并由当前行动者 fold，使 hand 结束。"""
    engine.start_hand()
    ok, err = engine.handle_action(engine.current_turn, "fold", {})
    assert ok, err
    assert engine.hand_in_progress is False


def test_single_mode():
    """single：打完一局 next_hand_in == 0（等手动 start_hand）。"""
    e = _texas(game_mode="single")
    _play_one_hand_to_finish(e)
    assert e.get_hand_end_payload()["next_hand_in"] == 0


def test_continuous_mode():
    """continuous：打完一局且人数足够 → next_hand_in == 5000。"""
    e = _texas(game_mode="continuous")
    _play_one_hand_to_finish(e)
    assert e.get_hand_end_payload()["next_hand_in"] == 5000


def test_limited_mode_not_full():
    """limited max_hands=3：打到第 2 局 → 未满,next_hand_in == 5000。"""
    e = _texas(game_mode="limited", max_hands=3)
    e.hands_played = 1  # 模拟已打 1 局,本局结束后为第 2 局
    _play_one_hand_to_finish(e)
    assert e.hands_played == 2
    assert e.get_hand_end_payload()["next_hand_in"] == 5000


def test_limited_mode_full():
    """limited max_hands=3：打满第 3 局 → next_hand_in == 0。"""
    e = _texas(game_mode="limited", max_hands=3)
    e.hands_played = 2  # 本局结束后为第 3 局,达到上限
    _play_one_hand_to_finish(e)
    assert e.hands_played == 3
    assert e.get_hand_end_payload()["next_hand_in"] == 0


def test_continuous_insufficient_players():
    """continuous：人数不足（can_start False）→ next_hand_in == 0。"""
    e = _texas(game_mode="continuous", players=2)
    _play_one_hand_to_finish(e)
    # 一方离桌,剩 1 人,下局无法开
    e.remove_player("p0")
    assert e._compute_next_hand_in() == 0


def test_default_mode_is_continuous():
    """向后兼容：不传 game_mode 默认 continuous。"""
    e = TexasEngine("t", "x", small_blind=10)
    e.add_player("p0", "P0", 0)
    e.add_player("p1", "P1", 1)
    assert e.game_mode == "continuous"
    _play_one_hand_to_finish(e)
    assert e.get_hand_end_payload()["next_hand_in"] == 5000


def test_brag_mode_fields():
    """三玩法兼容：brag 引擎同样支持 game_mode / next_hand_in 字段。"""
    e = BragEngine("t", "x", ante=10, game_mode="single")
    assert e.game_mode == "single"
    assert e.hands_played == 0
    assert e.next_hand_in == 0
