"""调度与广播辅助。

bot 循环 / 回合超时 / 自动开下局 / 筹码快照 / DB 记录触发 / 状态广播。

依赖方向：scheduler → _core(sio) / state / db，不 import 任何 handler 模块，
避免循环依赖。handler 模块从这里 import 广播与调度函数。
"""
import asyncio
import random

from ..logger import log
from .. import db
from ._core import sio
from . import state


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

        # 逐 action 序列（#013 回放）：引擎内存里累积的 full_action_log
        actions = getattr(engine, "full_action_log", None)

        db.record_hand(table_id, game_type, pot, board, players_data, actions=actions)
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

