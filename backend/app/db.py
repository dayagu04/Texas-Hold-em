"""SQLite 持久化层。

封装连接、schema 初始化与所有读写函数。设计目标：

- 仅用标准库 sqlite3，无新依赖。
- 数据库文件 backend/poker.db，WAL 模式（并发读友好）。
- 存储紧凑：卡牌用 2 字符 code 串（"8d3s"），筹码/积分用整数，每局只记一条
  摘要（hands）+ 每人一条（hand_players），不记录逐 action。

并发策略：本项目为单进程异步服务，写入量极低（每局一次）。使用 thread-local
持久连接减少连接开销（对局结束广播时不再频繁开关连接）。WAL 模式下读写并发安全。
所有写入用一把进程级锁串行化 + _txn() 上下文管理器（提交/回滚），避免极端并发下的
"database is locked" 与异常时遗留未提交事务。
"""
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "poker.db"

# 写串行化锁（读不加锁，WAL 下并发读安全）
_write_lock = threading.Lock()

# Thread-local 持久连接
_local = threading.local()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    """获取当前线程的持久连接，首次访问时创建。读操作直接用，不关闭。"""
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        _local.conn = conn
    return conn


@contextmanager
def _txn():
    """写事务上下文：成功 commit，异常 rollback 后重新抛出。连接保持持久不关闭。

    调用方需自行持有 _write_lock。
    """
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    name TEXT PRIMARY KEY,
    points INTEGER NOT NULL DEFAULT 1000,
    avatar TEXT,
    avatar_version INTEGER NOT NULL DEFAULT 0,
    hands_played INTEGER NOT NULL DEFAULT 0,
    hands_won INTEGER NOT NULL DEFAULT 0,
    total_net INTEGER NOT NULL DEFAULT 0,
    created_at TEXT,
    allowed INTEGER NOT NULL DEFAULT 1,
    is_admin INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS hands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_id TEXT,
    game_type TEXT,
    ended_at TEXT,
    pot INTEGER,
    board TEXT
);
CREATE TABLE IF NOT EXISTS hand_players (
    hand_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    seat INTEGER,
    is_bot INTEGER NOT NULL DEFAULT 0,
    hole TEXT,
    total_bet INTEGER NOT NULL DEFAULT 0,
    net INTEGER NOT NULL DEFAULT 0,
    result TEXT,
    PRIMARY KEY (hand_id, name),
    FOREIGN KEY (hand_id) REFERENCES hands(id)
);
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
);
CREATE TABLE IF NOT EXISTS hand_actions (
    hand_id INTEGER NOT NULL,
    seq     INTEGER NOT NULL,
    sid     TEXT,
    name    TEXT,
    action  TEXT NOT NULL,
    payload TEXT,
    stage   TEXT,
    ts      TEXT,
    PRIMARY KEY (hand_id, seq),
    FOREIGN KEY (hand_id) REFERENCES hands(id)
);
CREATE INDEX IF NOT EXISTS idx_hp_name ON hand_players(name);
CREATE INDEX IF NOT EXISTS idx_ha_hand ON hand_actions(hand_id);
"""


def init_db():
    """连接 + 建表 + 启用 WAL。main.py 启动时调用一次。"""
    with _write_lock:
        with _txn() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.executescript(SCHEMA)
            # 旧库 ALTER 兜底：加 allowed / is_admin 列
            try:
                conn.execute("ALTER TABLE users ADD COLUMN allowed INTEGER NOT NULL DEFAULT 1")
            except sqlite3.OperationalError:
                pass  # 列已存在
            try:
                conn.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")
            except sqlite3.OperationalError:
                pass
    _migrate_json_once()
    _migrate_whitelist_once()


def _migrate_json_once():
    """若存在旧 user_profiles.json，把其中头像一次性导入 db（仅在用户无头像时）。"""
    json_path = Path(__file__).parent.parent / "user_profiles.json"
    if not json_path.exists():
        return
    try:
        import json
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return
    for name, prof in data.items():
        if name == "_comment" or not isinstance(prof, dict):
            continue
        avatar = prof.get("avatar")
        if not avatar:
            continue
        # 去掉可能带的 ?v= 版本串，存裸路径
        avatar = avatar.split("?")[0]
        row = get_user(name)
        if row is None:
            get_or_create_user(name)
        existing_path, _ = get_avatar(name)
        if not existing_path:
            set_avatar(name, avatar)


def _migrate_whitelist_once():
    """若 allowed_users.json 存在且未迁移过，将白名单导入 users 表并标记首个用户为管理员。"""
    json_path = Path(__file__).parent.parent / "allowed_users.json"
    if not json_path.exists():
        return

    # 检查迁移标记
    conn = _connect()
    try:
        row = conn.execute("SELECT value FROM meta WHERE key = ?", ("whitelist_migrated",)).fetchone()
        if row and row["value"] == "1":
            return  # 已迁移过
    except sqlite3.OperationalError:
        # meta 表可能还不存在（老数据库），创建后再试
        pass

    try:
        import json
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        names = data.get("allowed_users", [])
        if not names:
            return
    except Exception:
        return

    with _write_lock:
        with _txn() as conn:
            for i, name in enumerate(names):
                name = name.strip()
                if not name:
                    continue
                # upsert 用户，设置 allowed=1
                conn.execute(
                    "INSERT OR IGNORE INTO users (name, points, created_at, allowed, is_admin) "
                    "VALUES (?, 1000, ?, 1, 0)",
                    (name, _now()),
                )
                # 首个用户设为 admin
                if i == 0:
                    conn.execute("UPDATE users SET allowed = 1, is_admin = 1 WHERE name = ?", (name,))
                else:
                    conn.execute("UPDATE users SET allowed = 1 WHERE name = ?", (name,))
            # 写迁移标记
            conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", ("whitelist_migrated", "1"))



# ---- 用户 ----

def get_or_create_user(name: str) -> dict:
    """取用户行，不存在则插入（points=1000）。返回 dict。"""
    row = get_user(name)
    if row is not None:
        return row
    with _write_lock:
        with _txn() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO users (name, points, created_at) VALUES (?, ?, ?)",
                (name, 1000, _now()),
            )
    return get_user(name)


def get_user(name: str) -> dict | None:
    conn = _connect()
    row = conn.execute("SELECT * FROM users WHERE name = ?", (name,)).fetchone()
    return dict(row) if row else None


def set_avatar(name: str, path: str) -> int:
    """更新头像裸路径，avatar_version += 1，返回新 version。"""
    get_or_create_user(name)
    with _write_lock:
        with _txn() as conn:
            conn.execute(
                "UPDATE users SET avatar = ?, avatar_version = avatar_version + 1 WHERE name = ?",
                (path, name),
            )
            row = conn.execute(
                "SELECT avatar_version FROM users WHERE name = ?", (name,)
            ).fetchone()
            return row["avatar_version"] if row else 0


def get_avatar(name: str) -> tuple[str | None, int]:
    """返回 (裸路径或None, version)。"""
    conn = _connect()
    row = conn.execute(
        "SELECT avatar, avatar_version FROM users WHERE name = ?", (name,)
    ).fetchone()
    if not row:
        return None, 0
    return row["avatar"], row["avatar_version"]



# ---- 白名单管理 ----

def is_allowed(name: str) -> bool:
    """检查用户是否在白名单（allowed=1）。"""
    row = get_user(name)
    return bool(row and row.get("allowed"))


def is_admin(name: str) -> bool:
    """检查用户是否管理员（is_admin=1）。"""
    row = get_user(name)
    return bool(row and row.get("is_admin"))


def list_whitelist() -> list[dict]:
    """返回所有白名单用户（allowed=1），含 name/allowed/is_admin/created_at/points。"""
    conn = _connect()
    rows = conn.execute(
        "SELECT name, allowed, is_admin, created_at, points FROM users WHERE allowed = 1"
    ).fetchall()
    return [dict(r) for r in rows]


def set_allowed(name: str, allowed: bool, is_admin: bool | None = None) -> dict:
    """设置用户白名单状态，可选地更新 is_admin。返回更新后的用户字典。"""
    name = name.strip()
    if not name:
        raise ValueError("name 不能为空")
    with _write_lock:
        with _txn() as conn:
            # upsert 用户
            conn.execute(
                "INSERT OR IGNORE INTO users (name, points, created_at, allowed, is_admin) "
                "VALUES (?, 1000, ?, ?, 0)",
                (name, _now(), 1 if allowed else 0),
            )
            # 更新 allowed
            conn.execute("UPDATE users SET allowed = ? WHERE name = ?", (1 if allowed else 0, name))
            # 可选地更新 is_admin
            if is_admin is not None:
                conn.execute("UPDATE users SET is_admin = ? WHERE name = ?", (1 if is_admin else 0, name))
    return get_user(name)



# ---- 对局 ----

def record_hand(table_id: str, game_type: str, pot: int, board: str,
                players: list[dict], actions: list[dict] | None = None) -> int:
    """写入一局对局记录，并更新非 bot 玩家的积分/统计。

    players: list of dict {name, seat, is_bot, hole, total_bet, net, result}
    actions: 可选，逐 action 序列 list of dict
             {seq, sid, name, action, payload(dict|None), stage, ts?}
             局内动作序列，用于 #013 回放。单事务连同摘要一起写入。
    返回写入的 hand_id。整局用单次事务包裹。
    """
    import json as _json
    with _write_lock:
        with _txn() as conn:
            cur = conn.execute(
                "INSERT INTO hands (table_id, game_type, ended_at, pot, board) "
                "VALUES (?, ?, ?, ?, ?)",
                (table_id, game_type, _now(), int(pot or 0), board or ""),
            )
            hand_id = cur.lastrowid

            for p in players:
                conn.execute(
                    "INSERT OR REPLACE INTO hand_players "
                    "(hand_id, name, seat, is_bot, hole, total_bet, net, result) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        hand_id,
                        p["name"],
                        p.get("seat"),
                        1 if p.get("is_bot") else 0,
                        p.get("hole", ""),
                        int(p.get("total_bet", 0)),
                        int(p.get("net", 0)),
                        p.get("result"),
                    ),
                )
                if p.get("is_bot"):
                    continue
                # 真人：确保用户存在，并累计积分与统计
                conn.execute(
                    "INSERT OR IGNORE INTO users (name, points, created_at) VALUES (?, ?, ?)",
                    (p["name"], 1000, _now()),
                )
                net = int(p.get("net", 0))
                won = 1 if p.get("result") == "won" else 0
                conn.execute(
                    "UPDATE users SET points = points + ?, hands_played = hands_played + 1, "
                    "hands_won = hands_won + ?, total_net = total_net + ? WHERE name = ?",
                    (net, won, net, p["name"]),
                )

            # 逐 action 序列（#013 回放）：批量写入，payload 序列化为 JSON 串
            if actions:
                for a in actions:
                    payload = a.get("payload")
                    payload_str = _json.dumps(payload, ensure_ascii=False) if payload is not None else None
                    conn.execute(
                        "INSERT OR REPLACE INTO hand_actions "
                        "(hand_id, seq, sid, name, action, payload, stage, ts) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (
                            hand_id,
                            int(a["seq"]),
                            a.get("sid"),
                            a.get("name"),
                            a["action"],
                            payload_str,
                            a.get("stage"),
                            a.get("ts") or _now(),
                        ),
                    )

            return hand_id


def get_replay(hand_id: int) -> dict | None:
    """返回某局完整回放数据（#013）。对局不存在返回 None。

    结构对齐契约 §1.8 ReplayData：
      {hand_id, game_type, board, pot, ended_at, players[], actions[]}
    - players 含起手牌 hole（局已结束，无泄露风险）
    - actions 按 seq 升序；老局无记录则为空列表（不报错）
    - payload 反序列化为 dict（或 None）
    """
    import json as _json
    conn = _connect()
    hand = conn.execute(
        "SELECT id, game_type, board, pot, ended_at FROM hands WHERE id = ?",
        (hand_id,),
    ).fetchone()
    if not hand:
        return None

    player_rows = conn.execute(
        "SELECT name, seat, is_bot, hole FROM hand_players WHERE hand_id = ? ORDER BY seat",
        (hand_id,),
    ).fetchall()
    players = [
        {
            "name": r["name"],
            "seat": r["seat"],
            "is_bot": bool(r["is_bot"]),
            "hole": r["hole"] or "",
        }
        for r in player_rows
    ]

    action_rows = conn.execute(
        "SELECT seq, name, action, payload, stage, ts FROM hand_actions "
        "WHERE hand_id = ? ORDER BY seq ASC",
        (hand_id,),
    ).fetchall()
    actions = []
    for r in action_rows:
        payload = None
        if r["payload"]:
            try:
                payload = _json.loads(r["payload"])
            except (ValueError, TypeError):
                payload = None
        actions.append({
            "seq": r["seq"],
            "name": r["name"],
            "action": r["action"],
            "payload": payload,
            "stage": r["stage"],
            "ts": r["ts"],
        })

    return {
        "hand_id": hand["id"],
        "game_type": hand["game_type"],
        "board": hand["board"] or "",
        "pot": hand["pot"] or 0,
        "ended_at": hand["ended_at"],
        "players": players,
        "actions": actions,
    }


def hand_has_player(hand_id: int, name: str) -> bool:
    """检查某用户是否参与了某局（回放鉴权用）。"""
    conn = _connect()
    row = conn.execute(
        "SELECT 1 FROM hand_players WHERE hand_id = ? AND name = ? LIMIT 1",
        (hand_id, name),
    ).fetchone()
    return row is not None



def get_stats(name: str) -> dict:
    """返回 {points, hands_played, hands_won, total_net}。"""
    row = get_or_create_user(name)
    return {
        "points": row["points"],
        "hands_played": row["hands_played"],
        "hands_won": row["hands_won"],
        "total_net": row["total_net"],
    }


def get_history(name: str, limit: int = 20) -> list[dict]:
    """返回该用户最近 limit 局，每局含基本信息、自己的记录及同局所有玩家。"""
    if limit < 1:
        limit = 1
    conn = _connect()
    # 先取该用户参与的最近 N 局 hand_id（按结束时间倒序）
    hand_rows = conn.execute(
        "SELECT h.id, h.game_type, h.ended_at, h.pot, h.board "
        "FROM hands h JOIN hand_players hp ON hp.hand_id = h.id "
        "WHERE hp.name = ? ORDER BY h.ended_at DESC, h.id DESC LIMIT ?",
        (name, limit),
    ).fetchall()
    if not hand_rows:
        return []

    hand_ids = [r["id"] for r in hand_rows]
    placeholders = ",".join("?" * len(hand_ids))
    player_rows = conn.execute(
        f"SELECT hand_id, name, seat, is_bot, hole, total_bet, net, result "
        f"FROM hand_players WHERE hand_id IN ({placeholders}) ORDER BY seat",
        hand_ids,
    ).fetchall()

    by_hand: dict[int, list[dict]] = {}
    for pr in player_rows:
        by_hand.setdefault(pr["hand_id"], []).append({
            "name": pr["name"],
            "seat": pr["seat"],
            "is_bot": bool(pr["is_bot"]),
            "hole": pr["hole"],
            "total_bet": pr["total_bet"],
            "net": pr["net"],
            "result": pr["result"],
        })

    history = []
    for hr in hand_rows:
        all_players = by_hand.get(hr["id"], [])
        me = next((pl for pl in all_players if pl["name"] == name), None)
        history.append({
            "hand_id": hr["id"],
            "game_type": hr["game_type"],
            "ended_at": hr["ended_at"],
            "pot": hr["pot"],
            "board": hr["board"],
            "me": {
                "hole": me["hole"] if me else "",
                "total_bet": me["total_bet"] if me else 0,
                "net": me["net"] if me else 0,
                "result": me["result"] if me else None,
            },
            "players": all_players,
        })
    return history


# ---- 积分榜 ----

def get_leaderboard(metric: str = "points", limit: int = 10) -> list[dict]:
    """返回积分榜 Top N，按指定 metric 排序。

    metric: "points" | "net" | "winrate"
    limit: 1..50

    winrate 需 hands_played >= 10 才入榜。
    """
    metric = metric.lower()
    if metric not in ("points", "net", "winrate"):
        metric = "points"
    limit = max(1, min(limit, 50))

    conn = _connect()
    if metric == "points":
        order_by = "points DESC"
        where = ""
    elif metric == "net":
        order_by = "total_net DESC"
        where = ""
    else:  # winrate
        order_by = "(CAST(hands_won AS REAL) / hands_played) DESC"
        where = "WHERE hands_played >= 10"

    query = f"""
        SELECT name, avatar, points, hands_played, hands_won, total_net
        FROM users
        {where}
        ORDER BY {order_by}
        LIMIT ?
    """
    rows = conn.execute(query, (limit,)).fetchall()

    entries = []
    for i, r in enumerate(rows, start=1):
        winrate = round(r["hands_won"] / r["hands_played"], 2) if r["hands_played"] > 0 else 0.0
        entries.append({
            "rank": i,
            "name": r["name"],
            "avatar": r["avatar"],
            "points": r["points"],
            "hands_played": r["hands_played"],
            "hands_won": r["hands_won"],
            "total_net": r["total_net"],
            "winrate": winrate,
        })
    return entries
