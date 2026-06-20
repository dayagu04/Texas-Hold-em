"""连接生命周期事件：connect / disconnect / 重连 / 同名顶替 / 断线超时。

依赖 _core(sio) / state / scheduler，不被其他 handler 依赖。
"""
import asyncio

from ..auth import verify_token
from ..logger import log
from ._core import sio
from . import state
from .scheduler import (
    _broadcast_table_state,
    _run_bot_loop,
    _destroy_table_if_no_humans,
)


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
