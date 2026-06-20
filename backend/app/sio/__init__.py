"""Socket.IO 事件处理：连接、大厅、桌面操作。

按 API-CONTRACT.md 实现所有事件。

包结构（拆分进行中）：
- _core.py     sio 实例 + emit_error（无依赖，杜绝循环）
- state.py     共享运行时状态（SessionManager + 模块级 dict）
- 其余 handler 与辅助函数当前仍在本文件，将逐步抽出
"""
import asyncio
import random

from ..auth import verify_token
from ..logger import log
from .. import db
from ._core import sio, emit_error
from . import state

# 兼容别名：旧代码与测试用 _emit_error
_emit_error = emit_error
# 兼容别名：模块级常量
TURN_TIMEOUT = state.TURN_TIMEOUT
# 兼容别名：main.py `from .sio import sio, sessions, _broadcast_lobby_update`
# sessions 指向同一 dict（生产中只就地增删、不重绑），供 cleanup 等只读使用
sessions = state.sessions


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

    log(f"[connect] sid={sid}, has_token={bool(token)}")

    if not token:
        await sio.emit("connect_error", {"message": "AUTH_REQUIRED"}, room=sid)
        raise ConnectionRefusedError("AUTH_REQUIRED")

    payload = verify_token(token)
    if not payload:
        await sio.emit("connect_error", {"message": "INVALID_TOKEN"}, room=sid)
        raise ConnectionRefusedError("INVALID_TOKEN")

    name = payload["name"]
    log(f"[connect] verified, name={name}, name_to_sid_existing={name in state.name_to_sid}")

    # 同名顶替
    if name in state.name_to_sid:
        old_sid = state.name_to_sid[name]
        # 取消旧连接的离线计时器（重连场景）
        if old_sid in state.disconnect_timers:
            state.disconnect_timers[old_sid].cancel()
            del state.disconnect_timers[old_sid]

        # 恢复桌内状态
        old_sess = state.sessions.get(old_sid)
        if old_sess and old_sess.get("table_id"):
            # 重连：保留 table_id，更新 sid
            table_id = old_sess["table_id"]
            state.sessions.pop(old_sid, None)
            state.sessions[sid] = {"name": name, "table_id": table_id}
            state.name_to_sid[name] = sid

            # 重新加入房间
            await sio.enter_room(sid, table_id)
            engine = state.lobby.get_table(table_id)
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

            log(f"[connect] RECONNECT: old_sid={old_sid} -> new_sid={sid}, table={table_id}, name={name}")
            return

        # 非重连场景：同名顶替
        await sio.emit("kicked", {"reason": "同名用户登录"}, room=old_sid)
        await sio.disconnect(old_sid)
        state.sessions.pop(old_sid, None)

    state.name_to_sid[name] = sid
    state.sessions[sid] = {"name": name, "table_id": None}
    log(f"[connect] NEW SESSION: sid={sid}, name={name}")


@sio.event
async def disconnect(sid):
    """断线处理：保留座位 30s，超时自动 fold/pass。"""
    log(f"[disconnect] {sid}")
    sess = state.sessions.get(sid)
    if not sess:
        return

    table_id = sess.get("table_id")
    if table_id:
        # 启动 30s 计时器
        timer = asyncio.create_task(_handle_disconnect_timeout(sid, table_id))
        state.disconnect_timers[sid] = timer


async def _handle_disconnect_timeout(sid: str, table_id: str):
    """30s 后执行自动 fold/pass。"""
    try:
        await asyncio.sleep(30)

        # 检查是否已重连
        if sid in state.disconnect_timers:
            del state.disconnect_timers[sid]
        else:
            return  # 已重连，取消操作

        # 检查玩家是否仍在桌上
        sess = state.sessions.get(sid)
        if not sess or sess.get("table_id") != table_id:
            return

        engine = state.lobby.get_table(table_id)

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
        state.sessions.pop(sid, None)
        if name in state.name_to_sid and state.name_to_sid[name] == sid:
            del state.name_to_sid[name]

        if table_id:
            _destroy_table_if_no_humans(table_id)

        log(f"[timeout] {sid} session cleaned after disconnect")

    except asyncio.CancelledError:
        log(f"[timeout] {sid} reconnected, timer cancelled")
        pass



# ---- 大厅事件 ----
@sio.on('lobby:list')
async def lobby_list(sid, data):
    """推送完整大厅列表。"""
    tables = state.lobby.list_tables()
    await sio.emit("lobby:update", {"tables": tables}, room=sid)


@sio.on('lobby:create_table')
async def lobby_create_table(sid, data):
    """创建房间并自动入座 0 号位。"""
    sess = state.sessions.get(sid)
    log(f"[create_table] ENTRY: sid={sid}, name={sess.get('name') if sess else None}, has_session={sess is not None}, data={data}")
    if not sess:
        return

    name = data.get("name", "新房间")
    game_type = data.get("game_type", "texas")
    seats = data.get("seats", 6)
    initial_chips = data.get("initial_chips", 1000)
    small_blind = data.get("small_blind")
    ante = data.get("ante")
    bots = data.get("bots", [])
    game_mode = data.get("game_mode", "continuous")
    max_hands = data.get("max_hands")

    try:
        table_id = state.lobby.create_table(
            name=name,
            game_type=game_type,
            seats=seats,
            initial_chips=initial_chips,
            small_blind=small_blind,
            ante=ante,
            game_mode=game_mode,
            max_hands=max_hands,
        )
    except (ValueError, NotImplementedError) as e:
        await _emit_error(sid, "INVALID_ACTION", str(e), {"game_type": game_type})
        return

    engine = state.lobby.get_table(table_id)
    engine.add_player(sid, sess["name"], seat=0)
    sess["table_id"] = table_id
    await sio.enter_room(sid, table_id)

    # 添加 Bot：逐个隔离，单个 bot 配置错误（座位重复 / 掼蛋超 4 人等）
    # 不得阻断房主入座与 lobby:joined，否则前端永久卡"创建中"。
    for bot_spec in bots:
        bot_seat = bot_spec.get("seat")
        bot_level = bot_spec.get("level", "easy")
        bot_sid = f"bot_{table_id}_{bot_seat}"
        bot_name = f"Bot-{bot_level[:1].upper()}{bot_seat}"
        try:
            engine.add_player(bot_sid, bot_name, bot_seat, is_bot=True, bot_level=bot_level)
        except (ValueError, NotImplementedError) as e:
            log(f"[WARN create_table] skip bot seat={bot_seat}: {e}")

    _sid_rooms = [r for r, members in sio.manager.rooms.get('/', {}).items() if sid in members]
    log(f"[DEBUG] BEFORE emit lobby:joined: sid={sid}, table={table_id}, sid_rooms={_sid_rooms}, sess.connected={sid in state.sessions}")
    await sio.emit("lobby:joined", {"table_id": table_id, "your_seat": 0}, room=sid)
    log(f"[DEBUG] AFTER emit lobby:joined")
    await _broadcast_table_state(table_id)
    await _broadcast_lobby_update()


@sio.on('lobby:quick_match')
async def lobby_quick_match(sid, data):
    """快速匹配：自动选一个等待中未满的指定玩法房间并入座最小空位。"""
    sess = state.sessions.get(sid)
    if not sess:
        return

    game_type = data.get("game_type")
    if not game_type:
        return

    # 选房
    table_id = state.lobby.quick_match(game_type)
    if not table_id:
        # 无可加入房间，回 no_match
        await sio.emit("lobby:no_match", {"game_type": game_type}, room=sid)
        return

    # 命中 → 复用 join_table 逻辑（自动选最小空位）
    await lobby_join_table(sid, {"table_id": table_id, "seat": None, "spectate": False})


@sio.on('lobby:join_table')
async def lobby_join_table(sid, data):
    """加入已有房间。"""
    sess = state.sessions.get(sid)
    if not sess:
        return

    log(f"[join_table] ENTRY: sid={sid}, table_id={data.get('table_id')}, has_session={sess is not None}")

    table_id = data.get("table_id")
    seat = data.get("seat")
    spectate = data.get("spectate", False)

    engine = state.lobby.get_table(table_id)
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
        log(f"[join_table] STALE FOUND: old_sid={stale_sid}, new_sid={sid}, name={sess['name']}, seat={seat}")
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
    log(f"[join_table] NEW SEAT: sid={sid}, seat={seat}")
    await sio.emit("lobby:joined", {"table_id": table_id, "your_seat": seat}, room=sid)
    await _broadcast_table_state(table_id)
    await _broadcast_lobby_update()
    await _maybe_auto_start(table_id)


@sio.on('lobby:leave_table')
async def lobby_leave_table(sid, data):
    """离桌（不退大厅）。"""
    sess = state.sessions.get(sid)
    if not sess:
        return

    table_id = data.get("table_id")
    engine = state.lobby.get_table(table_id)
    if engine:
        engine.remove_player(sid)
        await sio.leave_room(sid, table_id)
        await _broadcast_table_state(table_id)
        await _broadcast_lobby_update()

    sess["table_id"] = None
    _destroy_table_if_no_humans(table_id)


@sio.on('table:sync')
async def table_sync(sid, data):
    """前端牌桌页挂载后主动请求当前状态：对该 sid 定向重推一次 public + private。

    纯只读，无任何座位/入座副作用，天然幂等。修复"创建房间卡加载中"（广播时机竞争）。
    """
    sess = state.sessions.get(sid)
    if not sess:
        return

    table_id = data.get("table_id")
    engine = state.lobby.get_table(table_id)
    log(f"[table:sync] sid={sid}, table_id={table_id}, found={engine is not None}")
    if not engine:
        return

    # 防御性确保该 sid 在房间内（幂等，重复 enter 无害）
    await sio.enter_room(sid, table_id)

    # 定向重推 public 状态
    await sio.emit("table:state", engine.public_state(), room=sid)

    # 仅当该 sid 是真人玩家（在 engine.players 且非 bot）时才推 private
    player = engine.players.get(sid)
    if player is not None and not getattr(player, "is_bot", False):
        await sio.emit("table:private", engine.private_state(sid), room=sid)


# ---- 桌面事件 ----
@sio.on('table:start_hand')
async def table_start_hand(sid, data):
    """开始新一手。"""
    sess = state.sessions.get(sid)
    if not sess:
        return

    table_id = data.get("table_id")
    engine = state.lobby.get_table(table_id)
    if not engine:
        return

    # 用户手动开局：取消自动开下局定时器，避免重复开局（#006）
    _cancel_auto_start_timer(table_id)

    if not engine.can_start():
        await _emit_error(sid, "FORBIDDEN", "人数不足", {"table_id": table_id})
        return

    _snapshot_chips(table_id)  # 扣盲注/底注前快照，net 才能含盲注损失（零和）
    engine.start_hand()
    await _broadcast_table_state(table_id)
    await _run_bot_loop(table_id)


@sio.on('table:set_ready')
async def table_set_ready(sid, data):
    """玩家准备/取消准备。≥2 真人全部准备后自动开局（见 _maybe_auto_start）。"""
    sess = state.sessions.get(sid)
    if not sess:
        return
    table_id = data.get("table_id")
    ready = bool(data.get("ready", True))
    engine = state.lobby.get_table(table_id)
    if not engine:
        return
    player = engine.players.get(sid)
    if not player or getattr(player, "is_bot", False):
        return
    player.ready = ready
    log(f"[set_ready] sid={sid}, ready={ready}, table={table_id}")
    await _broadcast_table_state(table_id)
    await _maybe_auto_start(table_id)


@sio.on('table:action')
async def table_action(sid, data):
    """玩家行动。"""
    sess = state.sessions.get(sid)
    if not sess:
        return

    table_id = data.get("table_id")
    action = data.get("action")
    payload = data.get("payload", {})

    engine = state.lobby.get_table(table_id)
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
    sess = state.sessions.get(sid)
    if not sess:
        return

    table_id = data.get("table_id")
    seat = data.get("seat")
    level = data.get("level", "easy")

    engine = state.lobby.get_table(table_id)
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
    sess = state.sessions.get(sid)
    if not sess:
        return

    table_id = data.get("table_id")
    seat = data.get("seat")

    engine = state.lobby.get_table(table_id)
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
    import time
    sess = state.sessions.get(sid)
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
        "ts": int(time.time() * 1000),
    }, room=table_id)


# ---- 辅助函数 ----
def _cancel_turn_timer(table_id: str):
    """取消某桌的回合超时计时器（如有）。"""
    timer = state.turn_timers.pop(table_id, None)
    if timer and not timer.done():
        timer.cancel()


def _destroy_table_if_no_humans(table_id: str):
    """若该桌已无真人玩家,销毁该桌并清理所有计时器/记录。"""
    engine = state.lobby.get_table(table_id)
    if not engine:
        return

    # 检查是否还有非 bot 玩家
    has_human = any(
        not getattr(p, "is_bot", False)
        for p in engine.players.values()
    )
    if has_human:
        return

    log(f"[destroy_table] table={table_id} has no humans, cleaning up")

    # 取消所有该桌的计时器
    _cancel_turn_timer(table_id)
    _cancel_auto_start_timer(table_id)

    # 清掉记录
    state.hand_end_sent.pop(table_id, None)

    # 从大厅移除
    state.lobby.remove_table(table_id)

    # 广播大厅更新
    asyncio.create_task(_broadcast_lobby_update())


async def _start_turn_timer(table_id: str, sid: str, timeout: int = state.TURN_TIMEOUT):
    """启动回合超时计时器：真人玩家 timeout 秒未操作则自动 fold/pass。"""
    # 取消旧计时器（每次广播都会重置，避免叠加）
    _cancel_turn_timer(table_id)

    async def timeout_handler():
        try:
            await asyncio.sleep(timeout)
        except asyncio.CancelledError:
            return

        engine = state.lobby.get_table(table_id)
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

        log(f"⏱️  [timeout] {sid} auto-{action} after {timeout}s")
        ok, err = engine.handle_action(sid, action, {})
        if not ok:
            log(f"⏱️  [timeout] {sid} auto-{action} 失败: {err}")
            return

        state.turn_timers.pop(table_id, None)
        await _broadcast_table_state(table_id)
        await _run_bot_loop(table_id)

    state.turn_timers[table_id] = asyncio.create_task(timeout_handler())


def _snapshot_chips(table_id: str):
    """开局时快照各玩家筹码，供结算净输赢使用（net = 结束时 chips - 开局时 chips）。"""
    engine = state.lobby.get_table(table_id)
    if not engine:
        return
    # 对有 chips 属性的引擎（德扑、炸金花）快照；掼蛋无 chips
    if hasattr(list(engine.players.values())[0] if engine.players else None, "chips"):
        state.chips_snapshots[table_id] = {
            p.sid: p.chips for p in engine.players.values()
        }
    else:
        # 掼蛋等无筹码引擎：快照空 dict（后续走排名逻辑）
        state.chips_snapshots[table_id] = {}


def _record_hand_to_db(engine):
    """结算后记录本局到数据库（手牌刚结束时调用一次）。

    对德扑/炸金花：净输赢 = 结束时 chips - 开局快照 chips
    对掼蛋：净输赢 = 从 rankings/team score_delta 派生（v1 不持久化积分，记 0）
    """
    try:
        table_id = engine.id
        game_type = engine.game_type
        pot = getattr(engine, "pot", 0)  # 掼蛋无 pot 属性

        # 公共牌：德扑/炸金花有 community（Card 列表），掼蛋无
        board = ""
        if hasattr(engine, "community") and engine.community:
            board = "".join(c.code for c in engine.community)

        snapshot = state.chips_snapshots.get(table_id, {})
        players_data = []

        for p in engine.players.values():
            # 底牌：开局时的 hole（现在可能为空，因部分引擎修改了 hole）
            # 对德扑/炸金花，结束时 hole 保留；对掼蛋，结束时 hole 已出空
            # 为准确记录起手牌，此处用结束时 hole（若已打完为空串）
            hole = ""
            if hasattr(p, "hole") and p.hole:
                hole = "".join(c.code if hasattr(c, "code") else "" for c in p.hole)

            # 总下注：德扑/炸金花有 total_bet，掼蛋无
            total_bet = getattr(p, "total_bet", 0)

            # 净输赢：优先用 chips 差值；掼蛋等无 chips 引擎记 0（积分走 team rank）
            net = 0
            if p.sid in snapshot:
                net = p.chips - snapshot[p.sid]

            # 结果：德扑/炸金花有 folded 属性；掼蛋用 rank 派生
            result = None
            if getattr(p, "folded", False):
                result = "folded"
            elif net > 0:
                result = "won"
            elif hasattr(p, "rank") and p.rank:
                # 掼蛋：1、2 名视为赢（保守起见用 rank <= 2）
                result = "won" if p.rank <= 2 else "lost"
            else:
                result = "lost" if net < 0 else "even"

            players_data.append({
                "name": p.name,
                "seat": p.seat,
                "is_bot": p.is_bot,
                "hole": hole,
                "total_bet": total_bet,
                "net": net,
                "result": result,
            })

        db.record_hand(table_id, game_type, pot, board, players_data)
        state.chips_snapshots.pop(table_id, None)  # 清理快照
    except Exception as e:
        log(f"[db] record_hand failed for table={engine.id}: {e}")


async def _broadcast_table_state(table_id: str):
    engine = state.lobby.get_table(table_id)
    if not engine:
        return

    public = engine.public_state()
    log(f"[broadcast] table={table_id}, current_turn={engine.current_turn}, stage={public.get('stage')}")
    await sio.emit("table:state", public, room=table_id)

    # 给每个真人玩家发私有状态
    for p in public["players"]:
        if not p.get("is_bot"):
            private = engine.private_state(p["sid"])
            log(f"[broadcast] -> private to sid={p['sid']}, name={p['name']}")
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
        if state.hand_end_sent.get(table_id) != current_hand_id:
            hand_end_payload = engine.get_hand_end_payload()
            await sio.emit("table:hand_end", hand_end_payload, room=table_id)
            state.hand_end_sent[table_id] = current_hand_id

            # 记录本局到数据库（每局只记一次，由 state.hand_end_sent 去重保证）
            _record_hand_to_db(engine)

            # 多局模式（#006）：next_hand_in > 0 时启动自动开下局定时器
            if hand_end_payload.get("next_hand_in", 0) > 0:
                _cancel_auto_start_timer(table_id)
                state.auto_start_timers[table_id] = asyncio.create_task(
                    _auto_start_next_hand(table_id, hand_end_payload["next_hand_in"])
                )


def _cancel_auto_start_timer(table_id: str):
    """取消某桌的自动开下局计时器（如有）。"""
    timer = state.auto_start_timers.pop(table_id, None)
    if timer and not timer.done():
        timer.cancel()


async def _auto_start_next_hand(table_id: str, delay_ms: int):
    """多局模式：delay_ms 后自动开下一局（人数足够且无进行中手牌时）。"""
    try:
        await asyncio.sleep(delay_ms / 1000.0)
        engine = state.lobby.get_table(table_id)
        if engine and engine.can_start() and not engine.hand_in_progress:
            _snapshot_chips(table_id)  # 扣盲注/底注前快照（零和）
            engine.start_hand()
            await _broadcast_table_state(table_id)
            await _run_bot_loop(table_id)
    except asyncio.CancelledError:
        pass
    finally:
        state.auto_start_timers.pop(table_id, None)


async def _broadcast_lobby_update():
    """广播大厅更新。"""
    tables = state.lobby.list_tables()
    await sio.emit("lobby:update", {"tables": tables})


async def _maybe_auto_start(table_id: str):
    """≥2 真人且全部真人已准备时,自动开局。1 真人场景不自动开(走手动按钮)。"""
    engine = state.lobby.get_table(table_id)
    if not engine or engine.hand_in_progress:
        return
    humans = [p for p in engine.players.values() if not getattr(p, "is_bot", False)]
    if len(humans) < 2:
        return  # 仅 1 真人:保留手动开始
    if not all(getattr(p, "ready", False) for p in humans):
        return  # 还有真人没准备
    if not engine.can_start():
        return
    log(f"[auto_start] table={table_id}, humans={len(humans)} all ready, starting")
    _cancel_auto_start_timer(table_id)
    _snapshot_chips(table_id)  # 扣盲注/底注前快照（零和）
    engine.start_hand()
    await _broadcast_table_state(table_id)
    await _run_bot_loop(table_id)


async def _run_bot_loop(table_id: str):
    """循环执行 Bot 行动。"""
    engine = state.lobby.get_table(table_id)
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
            log(f"[bot_error] {bot_sid} {action}: {err}")
            break

        await _broadcast_table_state(table_id)
        await asyncio.sleep(random.uniform(1.0, 2.5))