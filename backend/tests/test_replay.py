"""测试牌局回放 (#013)：引擎 action 序列累积 + db 往返 + 回放接口鉴权。"""
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app import db, auth
from backend.app.game.texas import TexasEngine
from backend.app.game.brag import BragEngine
from backend.app.game.guandan import GuandanEngine


@pytest.fixture
def temp_db(monkeypatch, tmp_path):
    """用临时 db，重置 thread-local 持久连接缓存，init_db 建表。"""
    db_path = tmp_path / "replay_test.db"
    monkeypatch.setattr(db, "DB_PATH", db_path)
    # 重置 thread-local 连接（否则仍指向真实库）
    if hasattr(db._local, "conn"):
        db._local.conn = None
    monkeypatch.setattr(auth, "SECRET", "test-secret-key-longer-than-32-bytes!")
    db.init_db()
    yield db_path
    # 清理：关闭并重置连接，避免污染后续测试
    if getattr(db._local, "conn", None) is not None:
        db._local.conn.close()
        db._local.conn = None


# ---- 引擎 action 序列累积 ----

def _play_texas_hand():
    """开一局 2 人德扑（1 真人 + 1 bot），打到结束，返回 engine。"""
    eng = TexasEngine("t1", "桌", small_blind=10, initial_chips=1000)
    eng.add_player("sidA", "Alice", seat=0)
    eng.add_player("bot1", "Bot", seat=1, is_bot=True, bot_level="easy")
    eng.start_hand()
    # 跟着打：当前行动者 call/check，直到结束
    for _ in range(50):
        if not eng.hand_in_progress:
            break
        turn = eng.current_turn
        if turn is None:
            break
        legal = [a["action"] for a in eng.private_state(turn).get("legal_actions", [])]
        act = "check" if "check" in legal else ("call" if "call" in legal else "fold")
        ok, _ = eng.handle_action(turn, act, {})
        if not ok:
            break
    return eng


def test_texas_action_log_accumulates(temp_db):
    """德扑：full_action_log 按 seq 递增，含 action/name/stage。"""
    eng = _play_texas_hand()
    log = eng.full_action_log
    assert len(log) > 0
    # seq 从 0 递增且连续
    assert [a["seq"] for a in log] == list(range(len(log)))
    # 每条含必要字段
    for a in log:
        assert a["action"] in ("fold", "check", "call", "raise", "all_in")
        assert "name" in a and "stage" in a


def test_brag_action_log_records_look(temp_db):
    """炸金花：look 动作被记录（提前 return 路径）。"""
    eng = BragEngine("b1", "桌", ante=10, initial_chips=1000)
    eng.add_player("sidA", "Alice", seat=0)
    eng.add_player("sidB", "Bob", seat=1)
    eng.start_hand()
    turn = eng.current_turn
    eng.handle_action(turn, "look", {})
    looks = [a for a in eng.full_action_log if a["action"] == "look"]
    assert len(looks) == 1
    assert looks[0]["seq"] == 0


def test_start_hand_resets_log(temp_db):
    """新局 start_hand 清空 full_action_log。"""
    eng = _play_texas_hand()
    assert len(eng.full_action_log) > 0
    if eng.can_start():
        eng.start_hand()
        assert eng.full_action_log == []


# ---- db 往返：record_hand(actions) → get_replay ----

def test_record_and_get_replay_roundtrip(temp_db):
    """record_hand 写入 actions，get_replay 按 seq 升序返回，payload 反序列化为 dict。"""
    players = [
        {"name": "Alice", "seat": 0, "is_bot": False, "hole": "AsKd",
         "total_bet": 30, "net": 30, "result": "won"},
        {"name": "Bob", "seat": 1, "is_bot": False, "hole": "2c3h",
         "total_bet": 30, "net": -30, "result": "lost"},
    ]
    actions = [
        {"seq": 0, "sid": "sidA", "name": "Alice", "action": "call",
         "payload": {"amount": 10}, "stage": "preflop"},
        {"seq": 1, "sid": "sidB", "name": "Bob", "action": "check",
         "payload": None, "stage": "preflop"},
        {"seq": 2, "sid": "sidA", "name": "Alice", "action": "raise",
         "payload": {"amount": 50}, "stage": "flop"},
    ]
    hand_id = db.record_hand("t1", "texas", 60, "AsKdQh", players, actions=actions)

    replay = db.get_replay(hand_id)
    assert replay is not None
    assert replay["hand_id"] == hand_id
    assert replay["game_type"] == "texas"
    assert replay["board"] == "AsKdQh"
    assert replay["pot"] == 60
    # players 含起手牌
    alice = next(p for p in replay["players"] if p["name"] == "Alice")
    assert alice["hole"] == "AsKd"
    # actions 按 seq 升序，payload 是 dict
    assert [a["seq"] for a in replay["actions"]] == [0, 1, 2]
    assert replay["actions"][0]["payload"] == {"amount": 10}
    assert replay["actions"][1]["payload"] is None
    assert replay["actions"][2]["action"] == "raise"
    # 回放 action 不含 sid（契约：展示用 name）
    assert "sid" not in replay["actions"][0]


def test_get_replay_old_hand_empty_actions(temp_db):
    """老局（record_hand 未传 actions）→ get_replay 返回 actions:[]，不报错。"""
    players = [
        {"name": "Alice", "seat": 0, "is_bot": False, "hole": "AsKd",
         "total_bet": 10, "net": 10, "result": "won"},
    ]
    hand_id = db.record_hand("t1", "texas", 10, "", players)  # 不传 actions
    replay = db.get_replay(hand_id)
    assert replay is not None
    assert replay["actions"] == []


def test_get_replay_nonexistent_returns_none(temp_db):
    """不存在的 hand_id → get_replay 返回 None。"""
    assert db.get_replay(99999) is None


# ---- 接口鉴权 ----

def test_replay_endpoint_participant_ok(temp_db):
    """参与者能拉到回放数据。"""
    players = [
        {"name": "Alice", "seat": 0, "is_bot": False, "hole": "AsKd",
         "total_bet": 10, "net": 10, "result": "won"},
        {"name": "Bob", "seat": 1, "is_bot": False, "hole": "2c3h",
         "total_bet": 10, "net": -10, "result": "lost"},
    ]
    actions = [
        {"seq": 0, "sid": "sidA", "name": "Alice", "action": "call",
         "payload": {"amount": 10}, "stage": "preflop"},
    ]
    hand_id = db.record_hand("t1", "texas", 20, "AsKdQh", players, actions=actions)

    client = TestClient(app)
    token = auth.create_token("Alice")
    resp = client.get(f"/api/hand/{hand_id}/replay",
                       headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["hand_id"] == hand_id
    assert len(data["actions"]) == 1


def test_replay_endpoint_non_participant_403(temp_db):
    """非参与者 → 403 FORBIDDEN。"""
    players = [
        {"name": "Alice", "seat": 0, "is_bot": False, "hole": "AsKd",
         "total_bet": 10, "net": 10, "result": "won"},
    ]
    hand_id = db.record_hand("t1", "texas", 10, "", players)

    client = TestClient(app)
    token = auth.create_token("Carol")  # 未参与
    resp = client.get(f"/api/hand/{hand_id}/replay",
                      headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403
    assert resp.json()["detail"]["error"]["code"] == "FORBIDDEN"


def test_replay_endpoint_nonexistent_404(temp_db):
    """不存在的 hand_id → 404 HAND_NOT_FOUND。"""
    client = TestClient(app)
    token = auth.create_token("Alice")
    resp = client.get("/api/hand/99999/replay",
                      headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404
    assert resp.json()["detail"]["error"]["code"] == "HAND_NOT_FOUND"

