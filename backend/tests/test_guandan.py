"""测试掼蛋引擎：牌型识别 + 基础流程。"""
import pytest
from backend.app.game.guandan import GuandanEngine
from backend.app.game.guandan.combos import identify_combo, can_beat


def test_guandan_engine_basic():
    """测试掼蛋基础流程（4 人）。"""
    engine = GuandanEngine("test", "测试桌")
    engine.add_player("p0", "A0", 0)
    engine.add_player("p1", "B1", 1)
    engine.add_player("p2", "A2", 2)
    engine.add_player("p3", "B3", 3)

    assert engine.can_start()
    engine.start_hand()
    assert engine.hand_in_progress


def test_combo_single():
    """单张识别。"""
    combo = identify_combo([{"rank": 5, "suit": "s", "code": "5s"}])
    assert combo["type"] == "single"
    assert combo["rank"] == 5


def test_combo_pair():
    """对子识别。"""
    combo = identify_combo([
        {"rank": 7, "suit": "s", "code": "7s"},
        {"rank": 7, "suit": "h", "code": "7h"},
    ])
    assert combo["type"] == "pair"
    assert combo["rank"] == 7


def test_combo_trips():
    """三张识别。"""
    combo = identify_combo([
        {"rank": 9, "suit": "s", "code": "9s"},
        {"rank": 9, "suit": "h", "code": "9h"},
        {"rank": 9, "suit": "d", "code": "9d"},
    ])
    assert combo["type"] == "trips"
    assert combo["rank"] == 9


def test_combo_fullhouse():
    """三带二识别。"""
    combo = identify_combo([
        {"rank": 10, "suit": "s", "code": "Ts"},
        {"rank": 10, "suit": "h", "code": "Th"},
        {"rank": 10, "suit": "d", "code": "Td"},
        {"rank": 5, "suit": "s", "code": "5s"},
        {"rank": 5, "suit": "h", "code": "5h"},
    ])
    assert combo["type"] == "fullhouse"
    assert combo["rank"] == 10


def test_combo_straight():
    """顺子识别。"""
    combo = identify_combo([
        {"rank": 5, "suit": "s", "code": "5s"},
        {"rank": 6, "suit": "h", "code": "6h"},
        {"rank": 7, "suit": "d", "code": "7d"},
        {"rank": 8, "suit": "c", "code": "8c"},
        {"rank": 9, "suit": "s", "code": "9s"},
    ])
    assert combo["type"] == "straight"
    assert combo["rank"] == 9


def test_combo_bomb():
    """炸弹识别。"""
    combo = identify_combo([
        {"rank": 12, "suit": "s", "code": "Qs"},
        {"rank": 12, "suit": "h", "code": "Qh"},
        {"rank": 12, "suit": "d", "code": "Qd"},
        {"rank": 12, "suit": "c", "code": "Qc"},
    ])
    assert combo["type"] == "bomb"
    assert combo["rank"] == 12
    assert combo["bomb_size"] == 4


def test_combo_rocket():
    """火箭识别。"""
    combo = identify_combo([
        {"rank": 15, "suit": "J", "code": "JL"},
        {"rank": 16, "suit": "J", "code": "JB"},
        {"rank": 15, "suit": "J", "code": "JL"},
        {"rank": 16, "suit": "J", "code": "JB"},
    ])
    assert combo["type"] == "rocket"
    assert combo["rank"] == 16


def test_can_beat_single():
    """单张比较。"""
    a = {"type": "single", "rank": 8, "cards": []}
    b = {"type": "single", "rank": 6, "cards": []}
    assert can_beat(a, b)
    assert not can_beat(b, a)


def test_can_beat_bomb_over_single():
    """炸弹压单张。"""
    bomb = {"type": "bomb", "rank": 5, "bomb_size": 4, "cards": []}
    single = {"type": "single", "rank": 14, "cards": []}
    assert can_beat(bomb, single)


def test_can_beat_rocket_over_bomb():
    """火箭压炸弹。"""
    rocket = {"type": "rocket", "rank": 16, "cards": []}
    bomb = {"type": "bomb", "rank": 14, "bomb_size": 8, "cards": []}
    assert can_beat(rocket, bomb)