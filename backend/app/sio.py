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
# sid -> asyncio.Task (离线计时器)
disconnect_timers: dict[str, asyncio.Task] = {}
# table_id -> asyncio.Task (回合超时计时器)
turn_timers: dict[str, asyncio.Task] = {}
# table_id -> hand_id (已发送 hand_end 的 hand_id，避免重复发送)
hand_end_sent: dict[str, str] = {}

# 回合超时秒数（真人玩家未操作自动 fold/pass）
TURN_TIMEOUT = 30


async def _emit_error(sid: str, code: str, message: str, context: dict = None):
    """统一错误发送。"""
    payload = {"code": code, "message": message}
    if context:
        payload["context"] = context
    await sio.emit("error", payload, room=sid)


@sio.event
async def connect(sid, environ, auth=None):
    """连接握手：验证 token，处理同名顶替。

    token 读取优先级（前端 socket.io 走第一种）：
    1. socket.io auth 负载 auth={"token": ...}
    2. query string ?token=...
    3. HTTP Authorization: Bearer ...
    """
    token = None
    # 1) socket.io 客户端的 auth 负载（python-socketio 放在第三个参数）
    if isinstance(auth, dict):
        token = auth.get("token")

    # 2) query string fallback
    if not token:
        query = environ.get("QUERY_STRING", "")
        if "token=" in query:
            token = query.split("token=")[1].split("&")[0]

    # 3) HTTP Authorization header fallback
    if not token:
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
        # 取消旧连接的离线计时器（重连场景）
        if old_sid in disconnect_timers:
            disconnect_timers[old_sid].cancel()
            del disconnect_timers[old_sid]

        # 恢复桌内状态
        old_sess = sessions.get(old_sid)
        if old_sess and old_sess.get("table_id"):
            # 重连：保留 table_id，更新 sid
            table_id = old_sess["table_id"]
            sessions.pop(old_sid, None)
            sessions[sid] = {"name": name, "table_id": table_id}
            name_to_sid[name] = sid

            # 重新加入房间
            await sio.enter_room(sid, table_id)
            engine = lobby.get_table(table_id)
            if engine:
                # 更新引擎中的玩家 sid（如果引擎存储 sid）
                # 掼蛋/德扑/炸金花的引擎以 sid 为 key，需要迁移
                if old_sid in engine.players:
                    player = engine.players.pop(old_sid)
                    player.sid = sid
                    engine.players[sid] = player
                    # 如果 current_turn 是旧 sid，也要更新
                    if engine.current_turn == old_sid:
                        engine.current_turn = sid

                # 推送最新状态
                await sio.emit("table:state", engine.public_state(), room=sid)
                await sio.emit("table:private", engine.private_state(sid), room=sid)

            print(f"[reconnect] {old_sid} -> {sid} ({name})")
            return

        # 非重连场景：同名顶替
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
    sess = sessions.get(sid)
    if not sess:
        return

    table_id = sess.get("table_id")
    if table_id:
        # 启动 30s 计时器
        timer = asyncio.create_task(_handle_disconnect_timeout(sid, table_id))
        disconnect_timers[sid] = timer


async def _handle_disconnect_timeout(sid: str, table_id: str):
    """30s 后执行自动 fold/pass。"""
    try:
        await asyncio.sleep(30)

        # 检查是否已重连
        if sid in disconnect_timers:
            del disconnect_timers[sid]
        else:
            return  # 已重连，取消操作

        # 检查玩家是否仍在桌上
        sess = sessions.get(sid)
        if not sess or sess.get("table_id") != table_id:
            return

        engine = lobby.get_table(table_id)

        # 仅当有进行中的手牌且轮到该玩家时，才自动执行保守动作（fold/pass）
        if engine and engine.hand_in_progress and engine.current_turn == sid:
            # 自动执行最保守操作
            if engine.game_type == "texas":
                # 德扑：check 优先，否则 fold
                legal = engine.private_state(sid).get("legal_actions", [])
                action_names = [a["action"] for a in legal]
                if "check" in action_names:
                    engine.handle_action(sid, "check", {})
                elif "fold" in action_names:
                    engine.handle_action(sid, "fold", {})
            elif engine.game_type in ["brag", "guandan"]:
                # 炸金花/掼蛋：pass 或 fold
                legal = engine.private_state(sid).get("legal_actions", [])
                action_names = [a["action"] for a in legal]
                if "pass" in action_names:
                    engine.handle_action(sid, "pass", {})
                elif "fold" in action_names:
                    engine.handle_action(sid, "fold", {})

            await _broadcast_table_state(table_id)
            await _run_bot_loop(table_id)

        # hand 未开局：从引擎移除该 player，否则 engine.players 残留同名 player，
        # 玩家再以新 sid 加入时会出现两个同名 player（stale_sid bug 根因之一）。
        # hand 进行中时不能移除（上面已 auto-fold，移除会破坏牌局），维持现状。
        elif engine and not engine.hand_in_progress:
            engine.remove_player(sid)
            await _broadcast_table_state(table_id)

        # 清理 session：宽限期过后无论是否有进行中的手牌都要清，
        # 否则真人从"未开局/已结算"的桌断线会残留 orphan session，
        # 使该桌永远被判为"有真人"而无法被 cleanup 回收（死局残留根因）
        name = sess["name"]
        sessions.pop(sid, None)
        if name in name_to_sid and name_to_sid[name] == sid:
            del name_to_sid[name]

        print(f"[timeout] {sid} session cleaned after disconnect")

    except asyncio.CancelledError:
        print(f"[timeout] {sid} reconnected, timer cancelled")
        pass



# ---- 大厅事件 ----
@sio.on('lobby:list')
async def lobby_list(sid, data):
    """推送完整大厅列表。"""
    tables = lobby.list_tables()
    await sio.emit("lobby:update", {"tables": tables}, room=sid)


@sio.on('lobby:create_table')
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
        await _emit_error(sid, "INVALID_ACTION", str(e), {"game_type": game_type})
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


@sio.on('lobby:join_table')
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
        await _emit_error(sid, "TABLE_NOT_FOUND", "房间不存在", {"table_id": table_id})
        return

    if spectate:
        # v1: 观战模式暂不实现座位分配，直接进房间
        sess["table_id"] = table_id
        await sio.enter_room(sid, table_id)
        await sio.emit("lobby:joined", {"table_id": table_id, "your_seat": None}, room=sid)
        await sio.emit("table:state", engine.public_state(), room=sid)
        return

    # 同名残留处理：玩家断线超时后再以新 sid 加入同桌时，engine.players 里可能
    # 还留着旧 sid 的同名 player（disconnect 超时仅在 hand 进行中才动引擎）。
    # 直接 add_player 会产生两个同名 player，导致 current_turn 指向失效旧 sid、
    # 真实玩家收到 legal_actions=[]。这里改为迁移旧 player 到新 sid（沿用旧座位）。
    stale_sid = next(
        (osid for osid, p in engine.players.items()
         if not getattr(p, "is_bot", False) and p.name == sess["name"]),
        None,
    )
    if stale_sid is not None and stale_sid != sid:
        player = engine.players.pop(stale_sid)
        player.sid = sid
        engine.players[sid] = player
        if engine.current_turn == stale_sid:
            engine.current_turn = sid
        seat = player.seat
        sess["table_id"] = table_id
        await sio.enter_room(sid, table_id)
        await sio.emit("lobby:joined", {"table_id": table_id, "your_seat": seat}, room=sid)
        await _broadcast_table_state(table_id)
        await _broadcast_lobby_update()
        return

    # 自动选座
    if seat is None:
        taken_seats = {p["seat"] for p in engine.public_state()["players"]}
        available = [s for s in range(engine.max_players) if s not in taken_seats]
        if not available:
            await _emit_error(sid, "SEAT_TAKEN", "房间已满", {"table_id": table_id})
            return
        seat = available[0]

    engine.add_player(sid, sess["name"], seat)
    sess["table_id"] = table_id
    await sio.enter_room(sid, table_id)
    await sio.emit("lobby:joined", {"table_id": table_id, "your_seat": seat}, room=sid)
    await _broadcast_table_state(table_id)
    await _broadcast_lobby_update()


@sio.on('lobby:leave_table')
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
@sio.on('table:start_hand')
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
        await _emit_error(sid, "FORBIDDEN", "人数不足", {"table_id": table_id})
        return

    engine.start_hand()
    await _broadcast_table_state(table_id)
    await _run_bot_loop(table_id)


@sio.on('table:action')
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
        await _emit_error(sid, "INVALID_ACTION", err, {"action": action, "table_id": table_id})
        return

    await _broadcast_table_state(table_id)
    await _run_bot_loop(table_id)


@sio.on('table:add_bot')
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


@sio.on('table:remove_bot')
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


@sio.on('table:chat')
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
def _cancel_turn_timer(table_id: str):
    """取消某桌的回合超时计时器（如有）。"""
    timer = turn_timers.pop(table_id, None)
    if timer and not timer.done():
        timer.cancel()


async def _start_turn_timer(table_id: str, sid: str, timeout: int = TURN_TIMEOUT):
    """启动回合超时计时器：真人玩家 timeout 秒未操作则自动 fold/pass。"""
    # 取消旧计时器（每次广播都会重置，避免叠加）
    _cancel_turn_timer(table_id)

    async def timeout_handler():
        try:
            await asyncio.sleep(timeout)
        except asyncio.CancelledError:
            return

        engine = lobby.get_table(table_id)
        # 已不是该玩家回合 / 手牌已结束 → 放弃
        if not engine or not engine.hand_in_progress or engine.current_turn != sid:
            return

        # 选择最保守的合法动作：能 check/pass 就不弃牌，否则 fold
        legal = [a["action"] for a in engine.private_state(sid).get("legal_actions", [])]
        if "check" in legal:
            action = "check"
        elif "pass" in legal:
            action = "pass"
        else:
            action = "fold"

        print(f"⏱️  [timeout] {sid} auto-{action} after {timeout}s", flush=True)
        ok, err = engine.handle_action(sid, action, {})
        if not ok:
            print(f"⏱️  [timeout] {sid} auto-{action} 失败: {err}", flush=True)
            return

        turn_timers.pop(table_id, None)
        await _broadcast_table_state(table_id)
        await _run_bot_loop(table_id)

    turn_timers[table_id] = asyncio.create_task(timeout_handler())


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

    # 回合超时计时器：仅对真人当前行动者启动，bot 由 _run_bot_loop 驱动
    if engine.hand_in_progress and engine.current_turn:
        current = engine.players.get(engine.current_turn)
        if current and not current.is_bot:
            await _start_turn_timer(table_id, engine.current_turn)
        else:
            _cancel_turn_timer(table_id)
    else:
        _cancel_turn_timer(table_id)

    # 如果手牌刚结束且尚未发送 hand_end，emit table:hand_end
    if engine.is_hand_over() and hasattr(engine, 'get_hand_end_payload'):
        current_hand_id = str(engine.hand_id)
        if hand_end_sent.get(table_id) != current_hand_id:
            hand_end_payload = engine.get_hand_end_payload()
            await sio.emit("table:hand_end", hand_end_payload, room=table_id)
            hand_end_sent[table_id] = current_hand_id


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