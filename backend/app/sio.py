"""Socket.IO 事件处理：连接、大厅、桌面操作。

按 API-CONTRACT.md 实现所有事件。
"""
import socketio
import asyncio
import random

from .auth import verify_token
from .lobby import lobby

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

# sid -> {name, table_id | None}
sessions: dict[str, dict] = {}
# name -> sid (同名顶替)
name_to_sid: dict[str, str] = {}


@sio.event
async def connect(sid, environ):
    """连接握手：验证 token，处理同名顶替。"""
    auth = environ.get("HTTP_SEC_WEBSOCKET_PROTOCOL") or ""
    # Socket.IO 客户端会在 auth 对象里传 token
    # 从 query string 或 auth header 读取
    query = environ.get("QUERY_STRING", "")
    token = None
    if "token=" in query:
        token = query.split("token=")[1].split("&")[0]

    if not token:
        # 尝试从 HTTP headers 读 (Socket.IO 握手时可能在此)
        auth_header = environ.get("HTTP_AUTHORIZATION", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if not token:
        await sio.emit("connect_error", {"message": "AUTH_REQUIRED"}, room=sid)
        raise ConnectionRefusedError("AUTH_REQUIRED")

    payload = verify_token(token)
    if not payload:
        await sio.emit("connect_error", {"message": "INVALID_TOKEN"}, room=sid)
        raise ConnectionRefusedError("INVALID_TOKEN")

    name = payload["name"]

    # 同名顶替
    if name in name_to_sid:
        old_sid = name_to_sid[name]
        await sio.emit("kicked", {"reason": "同名用户登录"}, room=old_sid)
        await sio.disconnect(old_sid)
        sessions.pop(old_sid, None)

    name_to_sid[name] = sid
    sessions[sid] = {"name": name, "table_id": None}
    print(f"[connect] {sid} ({name})")


@sio.event
async def disconnect(sid):
    """断线处理：保留座位 30s，超时自动 fold/pass。"""
    print(f"[disconnect] {sid}")
    sess = sessions.pop(sid, None)
    if not sess:
        return

    name = sess["name"]
    if name in name_to_sid and name_to_sid[name] == sid:
        del name_to_sid[name]

    table_id = sess.get("table_id")
    if table_id:
        # TODO: M4 实现 30s 计时器
        pass


# ---- 大厅事件 ----
@sio.event
async def lobby_list(sid, data):
    """推送完整大厅列表。"""
    tables = lobby.list_tables()
    await sio.emit("lobby:update", {"tables": tables}, room=sid)


@sio.event
async def lobby_create_table(sid, data):
    """创建房间并自动入座 0 号位。"""
    sess = sessions.get(sid)
    if not sess:
        return

    name = data.get("name", "新房间")
    game_type = data.get("game_type", "texas")
    seats = data.get("seats", 6)
    initial_chips = data.get("initial_chips", 1000)
    small_blind = data.get("small_blind")
    ante = data.get("ante")
    bots = data.get("bots", [])

    try:
        table_id = lobby.create_table(
            name=name,
            game_type=game_type,
            seats=seats,
            initial_chips=initial_chips,
            small_blind=small_blind,
            ante=ante,
        )
    except (ValueError, NotImplementedError) as e:
        await sio.emit("error", {"code": "INVALID_ACTION", "message": str(e)}, room=sid)
        return

    engine = lobby.get_table(table_id)
    engine.add_player(sid, sess["name"], seat=0)
    sess["table_id"] = table_id
    await sio.enter_room(sid, table_id)

    # 添加 Bot
    for bot_spec in bots:
        bot_seat = bot_spec.get("seat")
        bot_level = bot_spec.get("level", "easy")
        bot_sid = f"bot_{table_id}_{bot_seat}"
        bot_name = f"Bot-{bot_level[:1].upper()}{bot_seat}"
        engine.add_player(bot_sid, bot_name, bot_seat, is_bot=True, bot_level=bot_level)

    await sio.emit("lobby:joined", {"table_id": table_id, "your_seat": 0}, room=sid)
    await _broadcast_table_state(table_id)
    await _broadcast_lobby_update()


@sio.event
async def lobby_join_table(sid, data):
    """加入已有房间。"""
    sess = sessions.get(sid)
    if not sess:
        return

    table_id = data.get("table_id")
    seat = data.get("seat")
    spectate = data.get("spectate", False)

    engine = lobby.get_table(table_id)
    if not engine:
        await sio.emit("error", {"code": "TABLE_NOT_FOUND", "message": "房间不存在"}, room=sid)
        return

    if spectate:
        # v1: 观战模式暂不实现座位分配，直接进房间
        sess["table_id"] = table_id
        await sio.enter_room(sid, table_id)
        await sio.emit("lobby:joined", {"table_id": table_id, "your_seat": None}, room=sid)
        await sio.emit("table:state", engine.public_state(), room=sid)
        return

    # 自动选座
    if seat is None:
        taken_seats = {p["seat"] for p in engine.public_state()["players"]}
        available = [s for s in range(engine.max_players) if s not in taken_seats]
        if not available:
            await sio.emit("error", {"code": "SEAT_TAKEN", "message": "房间已满"}, room=sid)
            return
        seat = available[0]

    engine.add_player(sid, sess["name"], seat)
    sess["table_id"] = table_id
    await sio.enter_room(sid, table_id)
    await sio.emit("lobby:joined", {"table_id": table_id, "your_seat": seat}, room=sid)
    await _broadcast_table_state(table_id)
    await _broadcast_lobby_update()


@sio.event
async def lobby_leave_table(sid, data):
    """离桌（不退大厅）。"""
    sess = sessions.get(sid)
    if not sess:
        return

    table_id = data.get("table_id")
    engine = lobby.get_table(table_id)
    if engine:
        engine.remove_player(sid)
        await sio.leave_room(sid, table_id)
        await _broadcast_table_state(table_id)
        await _broadcast_lobby_update()

    sess["table_id"] = None


# ---- 桌面事件 ----
@sio.event
async def table_start_hand(sid, data):
    """开始新一手。"""
    sess = sessions.get(sid)
    if not sess:
        return

    table_id = data.get("table_id")
    engine = lobby.get_table(table_id)
    if not engine:
        return

    if not engine.can_start():
        await sio.emit("error", {"code": "FORBIDDEN", "message": "人数不足"}, room=sid)
        return

    engine.start_hand()
    await _broadcast_table_state(table_id)
    await _run_bot_loop(table_id)


@sio.event
async def table_action(sid, data):
    """玩家行动。"""
    sess = sessions.get(sid)
    if not sess:
        return

    table_id = data.get("table_id")
    action = data.get("action")
    payload = data.get("payload", {})

    engine = lobby.get_table(table_id)
    if not engine:
        return

    ok, err = engine.handle_action(sid, action, payload)
    if not ok:
        await sio.emit("error", {"code": "INVALID_ACTION", "message": err}, room=sid)
        return

    await _broadcast_table_state(table_id)
    await _run_bot_loop(table_id)


@sio.event
async def table_add_bot(sid, data):
    """添加 Bot。"""
    sess = sessions.get(sid)
    if not sess:
        return

    table_id = data.get("table_id")
    seat = data.get("seat")
    level = data.get("level", "easy")

    engine = lobby.get_table(table_id)
    if not engine:
        return

    bot_sid = f"bot_{table_id}_{seat}"
    bot_name = f"Bot-{level[:1].upper()}{seat}"
    engine.add_player(bot_sid, bot_name, seat, is_bot=True, bot_level=level)
    await _broadcast_table_state(table_id)
    await _broadcast_lobby_update()


@sio.event
async def table_remove_bot(sid, data):
    """移除 Bot。"""
    sess = sessions.get(sid)
    if not sess:
        return

    table_id = data.get("table_id")
    seat = data.get("seat")

    engine = lobby.get_table(table_id)
    if not engine:
        return

    # 找到该座位的 bot sid
    for p in engine.public_state()["players"]:
        if p["seat"] == seat and p.get("is_bot"):
            engine.remove_player(p["sid"])
            break

    await _broadcast_table_state(table_id)
    await _broadcast_lobby_update()


@sio.event
async def table_chat(sid, data):
    """聊天。"""
    sess = sessions.get(sid)
    if not sess:
        return

    table_id = data.get("table_id")
    text = data.get("text", "").strip()

    if not text or len(text) > 200:
        return

    await sio.emit("table:chat", {
        "sid": sid,
        "name": sess["name"],
        "text": text,
        "ts": "",  # TODO: 添加时间戳
    }, room=table_id)


# ---- 辅助函数 ----
async def _broadcast_table_state(table_id: str):
    """广播桌面状态。"""
    engine = lobby.get_table(table_id)
    if not engine:
        return

    public = engine.public_state()
    await sio.emit("table:state", public, room=table_id)

    # 给每个真人玩家发私有状态
    for p in public["players"]:
        if not p.get("is_bot"):
            private = engine.private_state(p["sid"])
            await sio.emit("table:private", private, room=p["sid"])


async def _broadcast_lobby_update():
    """广播大厅更新。"""
    tables = lobby.list_tables()
    await sio.emit("lobby:update", {"tables": tables})


async def _run_bot_loop(table_id: str):
    """循环执行 Bot 行动。"""
    engine = lobby.get_table(table_id)
    if not engine:
        return

    # 拟人延迟
    await asyncio.sleep(random.uniform(1.5, 4.0))

    while True:
        bot_action = engine.next_bot_action()
        if not bot_action:
            break

        bot_sid, action, payload = bot_action
        ok, err = engine.handle_action(bot_sid, action, payload)
        if not ok:
            print(f"[bot_error] {bot_sid} {action}: {err}")
            break

        await _broadcast_table_state(table_id)
        await asyncio.sleep(random.uniform(1.0, 2.5))