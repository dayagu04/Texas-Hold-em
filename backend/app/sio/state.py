"""共享运行时状态。

封装散落的模块级 dict（sessions / name_to_sid / 各类计时器 / 快照等），
为将来换 Redis 留接口。当前阶段以模块级实例 + dict 暴露，让旧代码 `state.sessions[...]`
风格平滑过渡。

handler 模块统一通过 `from . import state` 后用 `state.sessions` 等访问，
确保测试可通过 monkeypatch.setattr(state, ...) 注入替身。
"""
from ..lobby import lobby  # 大厅单例（可被测试 monkeypatch 替换）

# sid -> {name, table_id | None}
sessions: dict[str, dict] = {}
# name -> sid (同名顶替)
name_to_sid: dict[str, str] = {}
# sid -> asyncio.Task (离线计时器)
disconnect_timers: dict = {}
# table_id -> asyncio.Task (回合超时计时器)
turn_timers: dict = {}
# table_id -> asyncio.Task (多局模式自动开下局计时器 #006)
auto_start_timers: dict = {}
# table_id -> hand_id (已发送 hand_end 的 hand_id，避免重复发送)
hand_end_sent: dict[str, str] = {}
# table_id -> {sid: chips}  开局时筹码快照，用于结算净输赢（net = 结束时 chips - 快照）
chips_snapshots: dict[str, dict[str, int]] = {}

# 回合超时秒数（真人玩家未操作自动 fold/pass）
TURN_TIMEOUT = 30


class SessionManager:
    """会话状态访问封装。

    当前直接操作模块级 dict，为将来换 Redis 等后端预留统一接口。
    """

    def get_session(self, sid: str) -> dict | None:
        return sessions.get(sid)

    def set_session(self, sid: str, data: dict) -> None:
        sessions[sid] = data

    def delete_session(self, sid: str) -> dict | None:
        return sessions.pop(sid, None)

    def get_sid_by_name(self, name: str) -> str | None:
        return name_to_sid.get(name)

    def bind_name(self, name: str, sid: str) -> None:
        name_to_sid[name] = sid

    def unbind_name(self, name: str) -> None:
        name_to_sid.pop(name, None)


# 单例
session_manager = SessionManager()
