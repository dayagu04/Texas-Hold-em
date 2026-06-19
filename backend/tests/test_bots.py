"""Bot 策略单元测试（M5 任务 A.1）。

覆盖 6 个 bot（3 玩法 × 2 难度）各 ≥ 3 条用例：
- 返回的 action 必须落在 legal_actions 范围内
- easy vs normal 行为存在可观测差异（多次采样统计频率）

依据 docs/features/003-m5-tuning-deploy.md §任务 A。
"""
import random

import pytest

from backend.app.game.texas.bot import decide_bot_action as texas_decide
from backend.app.game.texas.engine import Player as TexasPlayer
from backend.app.game.brag.bot import decide_bot_action as brag_decide
from backend.app.game.brag.engine import Player as BragPlayer
from backend.app.game.guandan.bot import decide_bot_action as guandan_decide
from backend.app.game.guandan.engine import Player as GuandanPlayer


# ---------------------------------------------------------------------------
# 通用工具
# ---------------------------------------------------------------------------
def _card(rank: int, suit: str) -> dict:
    return {"rank": rank, "suit": suit, "code": f"{rank}{suit}"}


def _legal(*actions: str) -> list[dict]:
    return [{"action": a, "payload_schema": {}} for a in actions]


def _legal_names(legal: list[dict]) -> set[str]:
    return {a["action"] for a in legal}


# ===========================================================================
# 德州扑克 Bot
# ===========================================================================
def _texas_state(hole, *, pot=100, current_bet=20, my_bet=0,
                 legal=("fold", "call", "raise", "all_in"), sid="bot1"):
    public = {
        "payload": {
            "pot": pot,
            "current_bet": current_bet,
            "player_bets": {sid: my_bet},
        }
    }
    private = {"hole": hole, "legal_actions": _legal(*legal)}
    return public, private


def _texas_player(level, *, chips=1000, sid="bot1"):
    return TexasPlayer(sid, "Bot", seat=0, chips=chips, is_bot=True, bot_level=level)


# ---- easy（≥3） ----
def test_texas_easy_returns_legal_action():
    """easy bot 强牌时返回的动作必须合法。"""
    player = _texas_player("easy")
    public, private = _texas_state([_card(14, "s"), _card(14, "h")])  # AA
    action, payload = texas_decide(player, public, private)
    assert action in _legal_names(private["legal_actions"])


def test_texas_easy_folds_trash_to_big_bet():
    """easy bot 极弱牌面对大额下注应弃牌。"""
    player = _texas_player("easy", chips=1000)
    # 7-2 off：最弱起手；to_call=300 > chips*0.1
    public, private = _texas_state(
        [_card(7, "d"), _card(2, "c")], pot=400, current_bet=300, my_bet=0
    )
    action, _ = texas_decide(player, public, private)
    assert action == "fold"


def test_texas_easy_checks_when_free():
    """easy bot 中等牌可免费过牌时应 check（不弃牌）。"""
    player = _texas_player("easy")
    public, private = _texas_state(
        [_card(11, "s"), _card(9, "d")], current_bet=0, my_bet=0,
        legal=("fold", "check", "raise", "all_in"),
    )
    action, _ = texas_decide(player, public, private)
    assert action in {"check", "raise"}
    assert action != "fold"


def test_texas_easy_no_hole_falls_back_to_check_or_call():
    """缺底牌时兜底为 check/call/fold，且合法。"""
    player = _texas_player("easy")
    public, private = _texas_state([], legal=("fold", "check"))
    action, _ = texas_decide(player, public, private)
    assert action in _legal_names(private["legal_actions"])


# ---- normal（≥3） ----
def test_texas_normal_returns_legal_action():
    """normal bot 返回的动作必须合法。"""
    player = _texas_player("normal")
    public, private = _texas_state([_card(13, "s"), _card(13, "h")])  # KK
    action, _ = texas_decide(player, public, private)
    assert action in _legal_names(private["legal_actions"])


def test_texas_normal_folds_trash_facing_bet():
    """normal bot 垃圾牌面对下注基本弃牌（允许极低频 bluff）。"""
    player = _texas_player("normal", chips=1000)
    folds = 0
    for _ in range(200):
        public, private = _texas_state(
            [_card(7, "d"), _card(2, "c")], pot=200, current_bet=300, my_bet=0
        )
        action, _ = texas_decide(player, public, private)
        assert action in _legal_names(private["legal_actions"])
        if action == "fold":
            folds += 1
    # 设计上散牌 95% fold，5% bluff raise
    assert folds > 150


def test_texas_normal_raises_strong_hand_often():
    """normal bot 强牌（无需跟注）时高频加注。"""
    player = _texas_player("normal")
    raises = 0
    for _ in range(200):
        public, private = _texas_state(
            [_card(14, "s"), _card(14, "h")], current_bet=0, my_bet=0,
            legal=("fold", "check", "raise", "all_in"),
        )
        action, _ = texas_decide(player, public, private)
        assert action in _legal_names(private["legal_actions"])
        if action == "raise":
            raises += 1
    assert raises > 100  # 强牌 70% raise


# ---- easy vs normal 差异 ----
def test_texas_normal_more_aggressive_than_easy_on_strong_hand():
    """强牌免费回合：normal 加注频率 > easy。"""
    random.seed(1234)
    hole = [_card(14, "s"), _card(14, "h")]  # AA，strength=1.0

    def raise_rate(level):
        player = _texas_player(level)
        n = 400
        cnt = 0
        for _ in range(n):
            public, private = _texas_state(
                hole, current_bet=0, my_bet=0,
                legal=("fold", "check", "raise", "all_in"),
            )
            action, _ = texas_decide(player, public, private)
            if action == "raise":
                cnt += 1
        return cnt / n

    easy_rate = raise_rate("easy")    # 设计 ~0.6
    normal_rate = raise_rate("normal")  # 设计 ~0.8
    assert normal_rate > easy_rate


# ===========================================================================
# 炸金花 Bot
# ===========================================================================
def _brag_state(*, pot=100, current_bet=10, active_sids=("bot1", "p2"),
                looked=None, sid="bot1"):
    looked = looked or {}
    public = {
        "payload": {
            "pot": pot,
            "current_bet": current_bet,
            "looked": looked,
            "active_sids": list(active_sids),
        }
    }
    return public


def _brag_player(level, *, looked=False, sid="bot1", chips=1000):
    p = BragPlayer(sid, "Bot", seat=0, chips=chips, is_bot=True, bot_level=level)
    p.looked = looked
    return p


def _brag_private(hole, legal):
    return {"hole": hole, "legal_actions": _legal(*legal)}


# ---- easy（≥3） ----
def test_brag_easy_returns_legal_action():
    """easy bot 返回动作必须合法。"""
    player = _brag_player("easy")
    public = _brag_state()
    private = _brag_private(
        [_card(14, "s"), _card(13, "s"), _card(12, "s")],  # 同花顺 A-K-Q
        ("look", "fold", "call", "raise"),
    )
    action, _ = brag_decide(player, public, private)
    assert action in _legal_names(private["legal_actions"])


def test_brag_easy_looks_before_betting_on_pair():
    """easy bot 对子起手未看牌时应先看牌。"""
    player = _brag_player("easy", looked=False)
    public = _brag_state()
    private = _brag_private(
        [_card(10, "s"), _card(10, "h"), _card(5, "d")],  # 对 10
        ("look", "fold", "call", "raise"),
    )
    action, _ = brag_decide(player, public, private)
    assert action == "look"


def test_brag_easy_no_look_action_still_legal():
    """已看牌后（无 look 可选）返回动作仍合法。"""
    player = _brag_player("easy", looked=True)
    public = _brag_state()
    private = _brag_private(
        [_card(10, "s"), _card(10, "h"), _card(5, "d")],
        ("fold", "call", "raise", "compare"),
    )
    action, _ = brag_decide(player, public, private)
    assert action in _legal_names(private["legal_actions"])


def test_brag_easy_bad_hole_falls_back_legal():
    """异常底牌（非 3 张）兜底返回合法动作。"""
    player = _brag_player("easy")
    public = _brag_state()
    private = _brag_private([_card(5, "s")], ("fold", "call"))
    action, _ = brag_decide(player, public, private)
    assert action in _legal_names(private["legal_actions"])


# ---- normal（≥3） ----
def test_brag_normal_returns_legal_action():
    """normal bot 返回动作必须合法。"""
    player = _brag_player("normal")
    public = _brag_state()
    private = _brag_private(
        [_card(9, "s"), _card(9, "h"), _card(4, "d")],  # 对 9
        ("look", "fold", "call", "raise"),
    )
    action, _ = brag_decide(player, public, private)
    assert action in _legal_names(private["legal_actions"])


def test_brag_normal_looks_strong_hand_first():
    """normal bot 强牌（顺子+）未看牌时先看牌。"""
    player = _brag_player("normal", looked=False)
    public = _brag_state()
    private = _brag_private(
        [_card(7, "s"), _card(6, "h"), _card(5, "d")],  # 顺子
        ("look", "fold", "call", "raise"),
    )
    action, _ = brag_decide(player, public, private)
    assert action == "look"


def test_brag_normal_folds_trash_on_bad_pot_odds():
    """normal bot 散牌 + 差 pot odds 应弃牌。"""
    player = _brag_player("normal", looked=True)
    # 散牌 K-9-4，pot=10、current_bet=50 → pot_odds 很差
    public = _brag_state(pot=10, current_bet=50)
    private = _brag_private(
        [_card(13, "s"), _card(9, "h"), _card(4, "d")],
        ("fold", "call", "raise", "compare"),
    )
    action, _ = brag_decide(player, public, private)
    assert action == "fold"


# ---- easy vs normal 差异 ----
def test_brag_normal_folds_trash_more_than_easy():
    """散牌差赔率：normal 弃牌率 > easy（easy 看档位 50% 跟）。"""
    random.seed(99)
    hole = [_card(13, "s"), _card(9, "h"), _card(4, "d")]  # 散牌

    def fold_rate(level):
        n = 400
        cnt = 0
        for _ in range(n):
            player = _brag_player(level, looked=True)
            public = _brag_state(pot=10, current_bet=50)  # 差赔率
            private = _brag_private(hole, ("fold", "call", "raise", "compare"))
            action, _ = brag_decide(player, public, private)
            if action == "fold":
                cnt += 1
        return cnt / n

    easy_rate = fold_rate("easy")      # 散牌 ~50% fold
    normal_rate = fold_rate("normal")  # 差赔率 ~100% fold
    assert normal_rate > easy_rate


# ===========================================================================
# 掼蛋 Bot
# ===========================================================================
def _guandan_state(last_play=None):
    return {"payload": {"last_play": last_play}}


def _guandan_player(level, sid="bot1"):
    return GuandanPlayer(sid, "Bot", seat=0, is_bot=True, bot_level=level)


def _guandan_private(hole, *, can_pass=True):
    legal = ["play"]
    if can_pass:
        legal.append("pass")
    return {"hole": hole, "legal_actions": _legal(*legal)}


# ---- easy（≥3） ----
def test_guandan_easy_opens_smallest_single():
    """easy bot 开张出最小单张。"""
    player = _guandan_player("easy")
    public = _guandan_state(last_play=None)
    hole = [_card(9, "s"), _card(4, "h"), _card(4, "d"), _card(13, "c")]
    private = _guandan_private(hole, can_pass=False)
    action, payload = guandan_decide(player, public, private)
    assert action == "play"
    assert len(payload["cards"]) == 1
    assert payload["cards"][0]["rank"] == 4  # 最小


def test_guandan_easy_beats_single():
    """easy bot 跟单张时出最小可压牌。"""
    player = _guandan_player("easy")
    last = {"combo_type": "single", "cards": [_card(8, "s")]}
    public = _guandan_state(last_play=last)
    hole = [_card(5, "s"), _card(9, "h"), _card(13, "d")]
    private = _guandan_private(hole)
    action, payload = guandan_decide(player, public, private)
    assert action == "play"
    assert payload["cards"][0]["rank"] == 9  # 最小可压（>8）


def test_guandan_easy_passes_when_cannot_beat():
    """easy bot 无法压过时 pass。"""
    player = _guandan_player("easy")
    last = {"combo_type": "single", "cards": [_card(14, "s")]}  # A，最大
    public = _guandan_state(last_play=last)
    hole = [_card(5, "s"), _card(9, "h"), _card(13, "d")]
    private = _guandan_private(hole)
    action, _ = guandan_decide(player, public, private)
    assert action == "pass"


def test_guandan_easy_action_always_legal():
    """easy bot 多场景返回动作均合法。"""
    player = _guandan_player("easy")
    for last in (None, {"combo_type": "single", "cards": [_card(7, "s")]}):
        public = _guandan_state(last_play=last)
        hole = [_card(6, "s"), _card(10, "h"), _card(10, "d")]
        private = _guandan_private(hole, can_pass=last is not None)
        action, _ = guandan_decide(player, public, private)
        assert action in _legal_names(private["legal_actions"])


# ---- normal（≥3） ----
def test_guandan_normal_opens_pair_when_available():
    """normal bot 开张优先甩对子（与 easy 出单张不同）。"""
    player = _guandan_player("normal")
    public = _guandan_state(last_play=None)
    hole = [_card(9, "s"), _card(4, "h"), _card(4, "d"), _card(13, "c")]
    private = _guandan_private(hole, can_pass=False)
    action, payload = guandan_decide(player, public, private)
    assert action == "play"
    assert len(payload["cards"]) == 2  # 对子
    assert payload["cards"][0]["rank"] == 4


def test_guandan_normal_opens_single_without_pair():
    """normal bot 无对子时退化为出最小单张。"""
    player = _guandan_player("normal")
    public = _guandan_state(last_play=None)
    hole = [_card(9, "s"), _card(4, "h"), _card(7, "d"), _card(13, "c")]
    private = _guandan_private(hole, can_pass=False)
    action, payload = guandan_decide(player, public, private)
    assert action == "play"
    assert len(payload["cards"]) == 1
    assert payload["cards"][0]["rank"] == 4


def test_guandan_normal_beats_pair_with_pair():
    """normal bot 跟对子时用最小可压对子。"""
    player = _guandan_player("normal")
    last = {"combo_type": "pair", "cards": [_card(6, "s"), _card(6, "h")]}
    public = _guandan_state(last_play=last)
    hole = [_card(9, "s"), _card(9, "h"), _card(4, "d"), _card(4, "c")]
    private = _guandan_private(hole)
    action, payload = guandan_decide(player, public, private)
    assert action == "play"
    assert len(payload["cards"]) == 2
    assert payload["cards"][0]["rank"] == 9  # 4 对压不过 6，9 对可以


def test_guandan_normal_action_always_legal():
    """normal bot 多场景返回动作均合法。"""
    player = _guandan_player("normal")
    for last in (None, {"combo_type": "single", "cards": [_card(7, "s")]},
                 {"combo_type": "pair", "cards": [_card(11, "s"), _card(11, "h")]}):
        public = _guandan_state(last_play=last)
        hole = [_card(6, "s"), _card(10, "h"), _card(10, "d")]
        private = _guandan_private(hole, can_pass=last is not None)
        action, _ = guandan_decide(player, public, private)
        assert action in _legal_names(private["legal_actions"])


# ---- easy vs normal 差异 ----
def test_guandan_easy_vs_normal_opening_differs():
    """同一手牌开张：easy 出单张、normal 甩对子 —— 行为可观测差异。"""
    public = _guandan_state(last_play=None)
    hole = [_card(9, "s"), _card(4, "h"), _card(4, "d"), _card(13, "c")]

    easy_action, easy_payload = guandan_decide(
        _guandan_player("easy"), public, _guandan_private(hole, can_pass=False)
    )
    normal_action, normal_payload = guandan_decide(
        _guandan_player("normal"), public, _guandan_private(hole, can_pass=False)
    )

    assert len(easy_payload["cards"]) == 1
    assert len(normal_payload["cards"]) == 2
    assert len(easy_payload["cards"]) != len(normal_payload["cards"])
