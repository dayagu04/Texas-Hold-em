"""Socket.IO 事件处理：连接、大厅、桌面操作。

按 API-CONTRACT.md 实现所有事件。

包结构（拆分进行中）：
- _core.py        sio 实例 + emit_error（无依赖，杜绝循环）
- state.py        共享运行时状态（SessionManager + 模块级 dict）
- scheduler.py    广播 / 计时器 / bot 循环 / 快照 / DB 记录
- connection.py   connect / disconnect / 重连 / 同名顶替 / 断线超时
- 大厅与桌面 handler 当前仍在本文件，将逐步抽出
"""
# import asyncio 仅为兼容测试 monkeypatch.setattr(sio_mod.asyncio, "sleep", ...)
# （asyncio 是单例模块，patch 后 connection.py 的 asyncio.sleep 同样生效）
import asyncio  # noqa: F401

from ..logger import log
from ._core import sio, emit_error
from . import state
from .scheduler import (
    _broadcast_table_state,
    _broadcast_lobby_update,
    _run_bot_loop,
    _maybe_auto_start,
    _destroy_table_if_no_humans,
    _cancel_auto_start_timer,
    _cancel_turn_timer,
    _snapshot_chips,
    _start_turn_timer,
    _record_hand_to_db,
    _auto_start_next_hand,
)
# 连接事件 handler（注册到 sio）+ re-export 供测试调用
from .connection import connect, disconnect, _handle_disconnect_timeout

# 兼容别名：旧代码与测试用 _emit_error
_emit_error = emit_error
# 兼容别名：模块级常量
TURN_TIMEOUT = state.TURN_TIMEOUT
# 兼容别名：main.py `from .sio import sio, sessions, _broadcast_lobby_update`
# sessions 指向同一 dict（生产中只就地增删、不重绑），供 cleanup 等只读使用
sessions = state.sessions



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

