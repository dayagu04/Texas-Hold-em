"""大厅事件：lobby:list / create_table / quick_match / join_table / leave_table。

依赖 _core(sio, emit_error) / state / scheduler。
"""
from ..logger import log
from ._core import sio, emit_error as _emit_error
from . import state
from .scheduler import (
    _broadcast_table_state,
    _broadcast_lobby_update,
    _maybe_auto_start,
    _destroy_table_if_no_humans,
)


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
