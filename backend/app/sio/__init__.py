"""Socket.IO 事件处理：连接、大厅、桌面操作。

按 API-CONTRACT.md 实现所有事件。

包结构（拆分进行中）：
- _core.py        sio 实例 + emit_error（无依赖，杜绝循环）
- state.py        共享运行时状态（SessionManager + 模块级 dict）
- scheduler.py    广播 / 计时器 / bot 循环 / 快照 / DB 记录
- connection.py   connect / disconnect / 重连 / 同名顶替 / 断线超时
- lobby_events.py lobby:* (list / create / quick_match / join / leave)
- 桌面 handler 当前仍在本文件，将抽出为 table_events.py
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
# 大厅事件 handler（注册到 sio）+ re-export 供测试调用
from .lobby_events import (
    lobby_list,
    lobby_create_table,
    lobby_quick_match,
    lobby_join_table,
    lobby_leave_table,
)

# 兼容别名：旧代码与测试用 _emit_error
_emit_error = emit_error
# 兼容别名：模块级常量
TURN_TIMEOUT = state.TURN_TIMEOUT
# 兼容别名：main.py `from .sio import sio, sessions, _broadcast_lobby_update`
# sessions 指向同一 dict（生产中只就地增删、不重绑），供 cleanup 等只读使用
sessions = state.sessions



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

