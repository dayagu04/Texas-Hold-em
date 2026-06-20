"""Socket.IO 包：创建 sio 实例 + 注册所有事件 handler + re-export 兼容符号。

包结构：
- _core.py        sio AsyncServer 实例 + CORS + emit_error（无依赖，杜绝循环）
- state.py        共享运行时状态（SessionManager + 模块级 dict + lobby 引用）
- scheduler.py    广播 / 计时器 / bot 循环 / 快照 / DB 记录
- connection.py   connect / disconnect / 重连 / 同名顶替 / 断线超时
- lobby_events.py lobby:* (list / create / quick_match / join / leave)
- table_events.py table:* (sync / start_hand / set_ready / action / add_bot / remove_bot / chat)

依赖方向（无环）：
  connection / lobby_events / table_events  →  scheduler  →  _core / state / db
  各 handler 模块 import 时通过 @sio.on 注册到同一 sio 实例。

本文件只做三件事：import _core 拿到 sio；import 各 handler 模块触发注册；
re-export main.py 与测试依赖的符号。
"""
# import asyncio 仅为兼容测试 monkeypatch.setattr(sio_mod.asyncio, "sleep", ...)
# （asyncio 是单例模块，patch 后 connection.py 的 asyncio.sleep 同样生效）
import asyncio  # noqa: F401

from ._core import sio, emit_error
from . import state

# 导入各 handler 模块 → 触发 @sio.on 注册（顺序无关，互不依赖 handler 间符号）
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
from .connection import connect, disconnect, _handle_disconnect_timeout
from .lobby_events import (
    lobby_list,
    lobby_create_table,
    lobby_quick_match,
    lobby_join_table,
    lobby_leave_table,
)
from .table_events import (
    table_sync,
    table_start_hand,
    table_set_ready,
    table_action,
    table_add_bot,
    table_remove_bot,
    table_chat,
)

# ---- 兼容 re-export ----
# main.py: `from .sio import sio, sessions, _broadcast_lobby_update`
# sessions 指向 state.sessions 同一 dict（生产中只就地增删、不重绑），供 cleanup 只读
sessions = state.sessions
# 旧代码与测试用 _emit_error
_emit_error = emit_error
# 模块级常量
TURN_TIMEOUT = state.TURN_TIMEOUT

__all__ = [
    "sio",
    "sessions",
    "_broadcast_lobby_update",
    "_emit_error",
    # handler（测试直接调用 / 事件已注册）
    "connect", "disconnect", "_handle_disconnect_timeout",
    "lobby_list", "lobby_create_table", "lobby_quick_match",
    "lobby_join_table", "lobby_leave_table",
    "table_sync", "table_start_hand", "table_set_ready", "table_action",
    "table_add_bot", "table_remove_bot", "table_chat",
]
