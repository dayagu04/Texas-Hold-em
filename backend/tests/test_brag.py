"""测试炸金花引擎：覆盖 GAME-RULES.md §E B-01 / B-02 / B-03。"""
import pytest
from backend.app.game.brag import BragEngine
from backend.app.game.brag.evaluator import evaluate_brag_hand


def test_brag_engine_basic():
    """测试炸金花基础流程。"""
    engine = BragEngine("test", "测试桌", ante=10, initial_chips=1000)
    engine.add_player("p1", "Alice", 0)
    engine.add_player("p2", "Bob", 1)

    assert engine.can_start()
    engine.start_hand()
    assert engine.hand_in_progress

    # 庄家后第一位行动（button=0 → 首发是 seat 1 = Bob）
    assert engine.current_turn == "p2"
    ok, _ = engine.handle_action("p2", "fold", {})
    assert ok
    assert not engine.hand_in_progress


def test_b01_look_doubles_bet():
    """B-01: 看牌后 raise 自动 ×2。"""
    engine = BragEngine("test", "测试桌", ante=10, initial_chips=1000)
    engine.add_player("p1", "Alice", 0)
    engine.add_player("p2", "Bob", 1)
    engine.add_player("p3", "Carol", 2)
    engine.start_hand()

    # button=0 → 首发 seat 1 = Bob
    assert engine.current_turn == "p2"

    # Bob 看牌
    ok, _ = engine.handle_action("p2", "look", {})
    assert ok
    assert engine.players["p2"].looked

    # Bob raise 20（因为看了牌，实际支付 40）
    pot_before = engine.pot
    ok, _ = engine.handle_action("p2", "raise", {"amount": 20})
    assert ok
    paid = engine.pot - pot_before
    assert paid == 40  # 看牌后 × 2


def test_b02_compare_tie_initiator_loses():
    """B-02: compare 平局发起方判负。"""
    engine = BragEngine("test", "测试桌", ante=10, initial_chips=1000)
    engine.add_player("p1", "Alice", 0)
    engine.add_player("p2", "Bob", 1)
    engine.start_hand()

    # 手动设置相同牌型（都是散牌 K-Q-J）
    from backend.app.game.cards import Card
    engine.players["p1"].hole = [Card(13, "s"), Card(12, "h"), Card(11, "d")]  # K-Q-J
    engine.players["p2"].hole = [Card(13, "c"), Card(12, "d"), Card(11, "s")]  # K-Q-J

    # button=0 → 首发 p2(Bob)
    assert engine.current_turn == "p2"

    # Bob 看牌 + call（不推进，仍然是 Bob 回合）
    engine.handle_action("p2", "look", {})
    assert engine.current_turn == "p2"
    engine.handle_action("p2", "call", {})

    # 现在轮到 Alice
    assert engine.current_turn == "p1"
    engine.handle_action("p1", "look", {})
    assert engine.current_turn == "p1"

    # Alice compare Bob（平局 → Alice 判负）
    ok, _ = engine.handle_action("p1", "compare", {"target_sid": "p2"})
    assert ok
    assert engine.players["p1"].folded
    assert not engine.players["p2"].folded


def test_b03_only_two_players_no_raise():
    """B-03: 仅剩 2 人时 raise 不可用。"""
    engine = BragEngine("test", "测试桌", ante=10, initial_chips=1000)
    engine.add_player("p1", "Alice", 0)
    engine.add_player("p2", "Bob", 1)
    engine.start_hand()

    # button=0 → 首发 p2(Bob)
    assert engine.current_turn == "p2"

    # Bob 尝试 raise（2 人局禁止）
    ok, err = engine.handle_action("p2", "raise", {"amount": 20})
    assert not ok
    assert "禁止加注" in err


def test_evaluator_trips():
    """测试豹子识别。"""
    score = evaluate_brag_hand([
        {"rank": 14, "suit": "s", "code": "As"},
        {"rank": 14, "suit": "h", "code": "Ah"},
        {"rank": 14, "suit": "d", "code": "Ad"},
    ])
    assert score[0] == 5  # 豹子
    assert score[1] == 14  # AAA


def test_evaluator_straight_flush():
    """测试同花顺。"""
    score = evaluate_brag_hand([
        {"rank": 7, "suit": "s", "code": "7s"},
        {"rank": 6, "suit": "s", "code": "6s"},
        {"rank": 5, "suit": "s", "code": "5s"},
    ])
    assert score[0] == 4  # 同花顺
    assert score[1] == 7  # 高点 7


def test_evaluator_wheel_straight():
    """测试 A-2-3 最小顺。"""
    score = evaluate_brag_hand([
        {"rank": 14, "suit": "s", "code": "As"},
        {"rank": 2, "suit": "h", "code": "2h"},
        {"rank": 3, "suit": "d", "code": "3d"},
    ])
    assert score[0] == 2  # 顺子
    assert score[1] == 3  # A-2-3 最小顺，high=3