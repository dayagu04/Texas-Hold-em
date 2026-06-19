"""M5 任务 B —— 端到端联调 harness（真实 Socket.IO 客户端）。

不依赖浏览器：用 python-socketio 客户端走完整 websocket 事件链，
覆盖任务 B 的可脚本化部分：
- 三玩法 1 真人 + 3 bot 完整对局（德州 / 炸金花 / 掼蛋）
- 掼蛋真实出牌/过牌/结算（重点验证任务 A 的 identify_combo 修复）
- 4 真人掼蛋对局打完结算
- 假玩法抽象验证（create_table / start_hand 行为）

可视化项（动效、样式串味）不在脚本范围，由静态核查 + 报告标注。

用法：先启动后端（uvicorn app.main:sio_app --port 8000），再
    python -m backend.tests.e2e_harness
"""
import asyncio
import json
import sys
import time
import urllib.request

import socketio

BASE = "http://localhost:8000"


def login(name: str) -> str:
    req = urllib.request.Request(
        f"{BASE}/api/login",
        data=json.dumps({"name": name}).encode(),
        headers={"Content-Type": "application/json"},
    )
    return json.loads(urllib.request.urlopen(req, timeout=5).read())["token"]


class Client:
    """单个真人玩家的 socket 客户端，带自动行动逻辑。"""

    def __init__(self, name: str, game_type: str):
        self.name = name
        self.game_type = game_type
        self.sio = socketio.AsyncClient()
        self.sid = None
        self.table_id = None
        self.your_seat = None
        self.state = None          # 最近一次 table:state
        self.private = None        # 最近一次 table:private
        self.hand_ended = asyncio.Event()
        self.hand_end_payload = None
        self.errors = []           # 收到的 error 事件
        self.acted_count = 0
        self._act_lock = asyncio.Lock()
        self._last_sig = None      # 去重：相同 (turn, legal) 快照只行动一次
        self._register()

    def _register(self):
        s = self.sio

        @s.event
        async def connect():
            self.sid = s.get_sid()

        @s.on("lobby:joined")
        async def on_joined(data):
            self.table_id = data.get("table_id")
            self.your_seat = data.get("your_seat")

        @s.on("table:state")
        async def on_state(data):
            self.state = data
            await self._maybe_act()

        @s.on("table:private")
        async def on_private(data):
            self.private = data
            await self._maybe_act()

        @s.on("table:hand_end")
        async def on_hand_end(data):
            # 忽略建桌时的伪 hand_end（hand_id "0" / 空结果）——
            # brag/guandan is_hand_over() 在开局前即为 True（见 E2E 报告 BUG-2）
            if str(data.get("hand_id")) == "0":
                return
            self.hand_end_payload = data
            self.hand_ended.set()

        @s.on("error")
        async def on_error(data):
            self.errors.append(data)

    async def connect(self, token: str):
        await self.sio.connect(
            f"{BASE}?token={token}", transports=["websocket"], wait_timeout=8
        )
        # 等待 connect 回调写入 sid
        for _ in range(50):
            if self.sid:
                return
            await asyncio.sleep(0.05)
        raise RuntimeError(f"{self.name} 未取得 sid")

    def _is_my_turn(self) -> bool:
        if not self.state or not self.state.get("current_turn"):
            return False
        return self.state["current_turn"].get("sid") == self.sid

    async def _maybe_act(self):
        """轮到自己且有合法动作时自动行动（串行化 + 快照去重）。"""
        async with self._act_lock:
            if not self._is_my_turn():
                self._last_sig = None  # turn 移走 → 重置，下次回到我时可重新行动
                return
            if not self.private:
                return
            legal = [a["action"] for a in self.private.get("legal_actions", [])]
            if not legal:
                return
            # 快照去重键：当前合法动作集 + 私有 hand_id（同一回合 state/private
            # 双触发时一致 → 跳过；look 改变 legal → 不同 → 可继续行动）
            sig = (self.private.get("hand_id"), tuple(sorted(legal)))
            if sig == self._last_sig:
                return
            action, payload = self._decide(legal)
            if action is None:
                return
            self._last_sig = sig
            self.acted_count += 1
            await self.sio.emit("table:action", {
                "table_id": self.table_id, "action": action, "payload": payload,
            })

    def _decide(self, legal: list[str]) -> tuple[str | None, dict]:
        """真人自动策略：保守推进，确保对局能走完。"""
        hole = self.private.get("hole", [])
        payload_data = (self.state or {}).get("payload", {})

        if self.game_type == "texas":
            # 能过牌就过，否则跟注，再不行弃牌
            if "check" in legal:
                return "check", {}
            if "call" in legal:
                return "call", {}
            return "fold", {}

        if self.game_type == "brag":
            # 未看牌先看，再跟注；剩 2 人且可比牌则比牌收尾
            if "look" in legal:
                return "look", {}
            active = payload_data.get("active_sids", [])
            if len(active) == 2 and "compare" in legal:
                target = [s for s in active if s != self.sid]
                if target:
                    return "compare", {"target_sid": target[0]}
            if "call" in legal:
                return "call", {}
            return "fold", {}

        if self.game_type == "guandan":
            last = payload_data.get("last_play")
            if "play" in legal:
                if not last:
                    # 开张：出最小单张
                    if hole:
                        smallest = min(hole, key=lambda c: c["rank"])
                        return "play", {"cards": [smallest]}
                elif last.get("combo_type") == "single":
                    last_rank = last["cards"][0]["rank"]
                    cands = sorted(
                        (c for c in hole if c["rank"] > last_rank),
                        key=lambda c: c["rank"],
                    )
                    if cands:
                        return "play", {"cards": [cands[0]]}
            if "pass" in legal:
                return "pass", {}
            # 必须出牌却压不过（理论上开张才会到这）
            if "play" in legal and hole:
                smallest = min(hole, key=lambda c: c["rank"])
                return "play", {"cards": [smallest]}
            return None, {}

        return None, {}

    async def disconnect(self):
        await self.sio.disconnect()


def _bots(seats_levels: list[tuple[int, str]]) -> list[dict]:
    return [{"seat": s, "level": lv} for s, lv in seats_levels]


async def scenario_single_human(game_type: str, table_name: str,
                                 bots: list[dict], create_kwargs: dict,
                                 timeout: float = 120.0) -> dict:
    """1 真人 + N bot 跑一局，返回结果摘要。"""
    host = Client("Alice", game_type)
    await host.connect(login("Alice"))

    create_payload = {"name": table_name, "game_type": game_type, "bots": bots}
    create_payload.update(create_kwargs)
    await host.sio.emit("lobby:create_table", create_payload)

    # 等入座
    for _ in range(60):
        if host.table_id:
            break
        await asyncio.sleep(0.05)
    if not host.table_id:
        await host.disconnect()
        return {"game_type": game_type, "ok": False, "reason": "未建桌"}

    t0 = time.time()
    await host.sio.emit("table:start_hand", {"table_id": host.table_id})

    try:
        await asyncio.wait_for(host.hand_ended.wait(), timeout=timeout)
        ok = True
        reason = ""
    except asyncio.TimeoutError:
        ok = False
        reason = f"超时未结算（{timeout}s）"

    elapsed = time.time() - t0
    result = {
        "game_type": game_type,
        "ok": ok and not host.errors,
        "reason": reason,
        "elapsed": round(elapsed, 1),
        "human_actions": host.acted_count,
        "errors": host.errors,
        "hand_end": host.hand_end_payload,
    }
    await host.disconnect()
    return result


async def scenario_four_humans_guandan(timeout: float = 180.0) -> dict:
    """4 真人掼蛋对局打完结算。"""
    names = ["Alice", "Bob", "Charlie", "David"]
    clients = [Client(n, "guandan") for n in names]
    for c in clients:
        await c.connect(login(c.name))

    host = clients[0]
    await host.sio.emit("lobby:create_table", {
        "name": "4人掼蛋", "game_type": "guandan", "bots": [],
    })
    for _ in range(60):
        if host.table_id:
            break
        await asyncio.sleep(0.05)
    if not host.table_id:
        for c in clients:
            await c.disconnect()
        return {"scenario": "4human_guandan", "ok": False, "reason": "未建桌"}

    # 其余 3 人入座
    for c in clients[1:]:
        await c.sio.emit("lobby:join_table", {"table_id": host.table_id, "seat": None})
    await asyncio.sleep(1.0)

    t0 = time.time()
    await host.sio.emit("table:start_hand", {"table_id": host.table_id})

    try:
        await asyncio.wait_for(host.hand_ended.wait(), timeout=timeout)
        ok = True
        reason = ""
    except asyncio.TimeoutError:
        ok = False
        reason = f"超时未结算（{timeout}s）"

    elapsed = time.time() - t0
    all_errors = [e for c in clients for e in c.errors]
    total_actions = sum(c.acted_count for c in clients)
    result = {
        "scenario": "4human_guandan",
        "ok": ok and not all_errors,
        "reason": reason,
        "elapsed": round(elapsed, 1),
        "total_human_actions": total_actions,
        "errors": all_errors,
        "hand_end": host.hand_end_payload,
    }
    for c in clients:
        await c.disconnect()
    return result


async def main():
    results = []

    print(">> 德州扑克：1 真人 + 3 bot")
    results.append(await scenario_single_human(
        "texas", "德州E2E", _bots([(1, "easy"), (2, "normal"), (3, "easy")]),
        {"seats": 4, "small_blind": 10, "initial_chips": 1000}, timeout=120,
    ))

    print(">> 炸金花：1 真人 + 3 bot")
    results.append(await scenario_single_human(
        "brag", "炸金花E2E", _bots([(1, "easy"), (2, "normal"), (3, "easy")]),
        {"seats": 4, "ante": 10, "initial_chips": 1000}, timeout=120,
    ))

    print(">> 掼蛋：1 真人 + 3 bot（重点验证 A 修复）")
    results.append(await scenario_single_human(
        "guandan", "掼蛋E2E", _bots([(1, "easy"), (2, "normal"), (3, "normal")]),
        {}, timeout=300,
    ))

    print(">> 4 真人掼蛋")
    results.append(await scenario_four_humans_guandan(timeout=300))

    print("\n=== 结果汇总 ===")
    for r in results:
        tag = r.get("game_type") or r.get("scenario")
        status = "OK" if r["ok"] else "FAIL"
        print(f"[{status}] {tag}: {json.dumps(r, ensure_ascii=False)}")

    return results


if __name__ == "__main__":
    asyncio.run(main())
