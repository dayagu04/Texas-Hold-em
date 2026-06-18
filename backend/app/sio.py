"""Socket.IO 事件处理：连接、登录、创建/加入牌桌、游戏操作。"""
import socketio
import asyncio
import uuid

from .auth import is_allowed
from .game.table import Table
from .game.bot import PokerBot

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

# 全局牌桌池
tables: dict[str, Table] = {}
# sid -> (username, table_id)
sessions: dict[str, tuple[str, str | None]] = {}
# 机器人池：sid -> PokerBot
bots: dict[str, PokerBot] = {}


@sio.event
async def connect(sid, environ):
    print(f"[connect] {sid}")


@sio.event
async def disconnect(sid):
    print(f"[disconnect] {sid}")
    if sid in sessions:
        username, table_id = sessions.pop(sid)
        if table_id and table_id in tables:
            t = tables[table_id]
            t.remove_player(sid)
            await sio.emit("table_update", t.serialize(), room=table_id)


@sio.event
async def login(sid, data):
    username = data.get("username", "").strip()
    if not username or not is_allowed(username):
        await sio.emit("login_result", {"ok": False, "error": "用户名不在白名单"}, room=sid)
        return
    sessions[sid] = (username, None)
    await sio.emit("login_result", {"ok": True, "username": username}, room=sid)
    # 发送当前大厅的桌子列表
    lobby = [{"id": t.id, "name": t.name, "seats": f"{len(t.players)}/{t.max_seats}"}
             for t in tables.values()]
    await sio.emit("lobby_update", {"tables": lobby}, room=sid)


@sio.event
async def create_table(sid, data):
    if sid not in sessions:
        return
    username, _ = sessions[sid]
    table_name = data.get("name", f"{username}的牌桌")
    table_id = f"t{len(tables) + 1}"
    t = Table(table_id, table_name)
    tables[table_id] = t
    await join_table(sid, {"table_id": table_id})


@sio.event
async def join_table(sid, data):
    if sid not in sessions:
        return
    username, old_table = sessions[sid]
    table_id = data.get("table_id")
    if table_id not in tables:
        await sio.emit("error", {"msg": "牌桌不存在"}, room=sid)
        return
    t = tables[table_id]
    if len(t.players) >= t.max_seats:
        await sio.emit("error", {"msg": "牌桌已满"}, room=sid)
        return
    if old_table:
        await sio.leave_room(sid, old_table)
        if old_table in tables:
            tables[old_table].remove_player(sid)
    t.take_seat(sid, username)
    await sio.enter_room(sid, table_id)
    sessions[sid] = (username, table_id)
    await sio.emit("table_update", t.serialize(sid), room=table_id)


@sio.event
async def start_hand(sid, data):
    if sid not in sessions:
        return
    _, table_id = sessions[sid]
    if not table_id or table_id not in tables:
        return
    t = tables[table_id]
    if t.hand_in_progress:
        await sio.emit("error", {"msg": "手牌进行中"}, room=sid)
        return
    ok = t.start_hand()
    if not ok:
        await sio.emit("error", {"msg": "玩家不足 2 人"}, room=sid)
        return
    await sio.emit("table_update", t.serialize(), room=table_id)
    # 向每位玩家单独推送底牌
    for p in t.seated_players():
        await sio.emit("table_update", t.serialize(p.sid), room=p.sid)
    # 触发机器人行动
    await _trigger_bot_actions(table_id)


@sio.event
async def player_action(sid, data):
    if sid not in sessions:
        return
    _, table_id = sessions[sid]
    if not table_id or table_id not in tables:
        return
    t = tables[table_id]
    action = data.get("action")
    amount = data.get("amount", 0)
    ok, err = t.apply_action(sid, action, amount)
    if not ok:
        await sio.emit("error", {"msg": err}, room=sid)
        return
    # 广播最新状态；每位玩家看到自己的底牌
    for p in t.seated_players():
        await sio.emit("table_update", t.serialize(p.sid), room=p.sid)
    # 观众看公共状态
    await sio.emit("table_update", t.serialize(), room=table_id)
    # 触发机器人行动
    await _trigger_bot_actions(table_id)


@sio.event
async def add_bot(sid, data):
    """添加AI机器人到牌桌。"""
    if sid not in sessions:
        return
    _, table_id = sessions[sid]
    if not table_id or table_id not in tables:
        return
    t = tables[table_id]
    if len(t.players) >= t.max_seats:
        await sio.emit("error", {"msg": "牌桌已满"}, room=sid)
        return

    # 创建机器人
    bot_names = ["Bot-Alpha", "Bot-Beta", "Bot-Gamma", "Bot-Delta", "Bot-Echo"]
    existing_names = {p.name for p in t.players.values()}
    bot_name = next((n for n in bot_names if n not in existing_names), f"Bot-{uuid.uuid4().hex[:4]}")

    bot_sid = f"bot_{uuid.uuid4().hex[:8]}"
    bot = PokerBot(bot_name)
    bots[bot_sid] = bot
    sessions[bot_sid] = (bot_name, table_id)

    t.take_seat(bot_sid, bot_name)
    await sio.emit("table_update", t.serialize(sid), room=table_id)
    print(f"[add_bot] {bot_name} 加入 {table_id}")


async def _trigger_bot_actions(table_id: str):
    """让所有该行动的机器人自动做决策。"""
    await asyncio.sleep(1)  # 模拟思考时间

    if table_id not in tables:
        return
    t = tables[table_id]

    while t.current_turn and t.current_turn in bots:
        bot = bots[t.current_turn]
        player = t.players[t.current_turn]
        action, amount = bot.decide_action(player, t)

        print(f"[bot_action] {bot.name}: {action} {amount}")
        ok, err = t.apply_action(t.current_turn, action, amount)
        if not ok:
            print(f"[bot_error] {err}")
            break

        # 广播更新
        for p in t.seated_players():
            await sio.emit("table_update", t.serialize(p.sid), room=p.sid)
        await sio.emit("table_update", t.serialize(), room=table_id)

        await asyncio.sleep(0.8)  # 机器人操作间隔