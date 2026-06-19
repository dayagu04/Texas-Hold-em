"""SQLite 持久化层。

封装连接、schema 初始化与所有读写函数。设计目标：

- 仅用标准库 sqlite3，无新依赖。
- 数据库文件 backend/poker.db，WAL 模式（并发读友好）。
- 存储紧凑：卡牌用 2 字符 code 串（"8d3s"），筹码/积分用整数，每局只记一条
  摘要（hands）+ 每人一条（hand_players），不记录逐 action。

并发策略：本项目为单进程异步服务，写入量极低（每局一次）。为简单且线程安全，
每次操作开短连接并 close。WAL 模式下读写并发安全。所有写入用一把进程级锁串行化，
避免极端并发下的 "database is locked"。
"""
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "poker.db"

# 写串行化锁（读不加锁，WAL 下并发读安全）
_write_lock = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    name TEXT PRIMARY KEY,
    points INTEGER NOT NULL DEFAULT 1000,
    avatar TEXT,
    avatar_version INTEGER NOT NULL DEFAULT 0,
    hands_played INTEGER NOT NULL DEFAULT 0,
    hands_won INTEGER NOT NULL DEFAULT 0,
    total_net INTEGER NOT NULL DEFAULT 0,
    created_at TEXT
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
CREATE INDEX IF NOT EXISTS idx_hp_name ON hand_players(name);
"""


def init_db():
    """连接 + 建表 + 启用 WAL。main.py 启动时调用一次。"""
    with _write_lock:
        conn = _connect()
        try:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.executescript(SCHEMA)
            conn.commit()
        finally:
            conn.close()
    _migrate_json_once()


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


# ---- 用户 ----

def get_or_create_user(name: str) -> dict:
    """取用户行，不存在则插入（points=1000）。返回 dict。"""
    row = get_user(name)
    if row is not None:
        return row
    with _write_lock:
        conn = _connect()
        try:
            conn.execute(
                "INSERT OR IGNORE INTO users (name, points, created_at) VALUES (?, ?, ?)",
                (name, 1000, _now()),
            )
            conn.commit()
        finally:
            conn.close()
    return get_user(name)


def get_user(name: str) -> dict | None:
    conn = _connect()
    try:
        row = conn.execute("SELECT * FROM users WHERE name = ?", (name,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def set_avatar(name: str, path: str) -> int:
    """更新头像裸路径，avatar_version += 1，返回新 version。"""
    get_or_create_user(name)
    with _write_lock:
        conn = _connect()
        try:
            conn.execute(
                "UPDATE users SET avatar = ?, avatar_version = avatar_version + 1 WHERE name = ?",
                (path, name),
            )
            conn.commit()
            row = conn.execute(
                "SELECT avatar_version FROM users WHERE name = ?", (name,)
            ).fetchone()
            return row["avatar_version"] if row else 0
        finally:
            conn.close()


def get_avatar(name: str) -> tuple[str | None, int]:
    """返回 (裸路径或None, version)。"""
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT avatar, avatar_version FROM users WHERE name = ?", (name,)
        ).fetchone()
        if not row:
            return None, 0
        return row["avatar"], row["avatar_version"]
    finally:
        conn.close()


# ---- 对局 ----

def record_hand(table_id: str, game_type: str, pot: int, board: str,
                players: list[dict]) -> int:
    """写入一局对局记录，并更新非 bot 玩家的积分/统计。

    players: list of dict {name, seat, is_bot, hole, total_bet, net, result}
    返回写入的 hand_id。整局用单次事务包裹。
    """
    with _write_lock:
        conn = _connect()
        try:
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
            conn.commit()
            return hand_id
        finally:
            conn.close()


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
    try:
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
    finally:
        conn.close()
