"""Bot 压力测试脚本（M5 任务 A.2）。

场景：4 个 bot 跑完整对局，三玩法各连续 10 局，验证：
- 引擎不崩溃（无未捕获异常）
- 每局正常结束（hand_in_progress 收敛为 False）
- 不卡顿（行动步数有上限保护，超限即判失败）
- bot 决策始终落在 legal_actions 内（非法时走与生产一致的兜底）

直接运行：
    python -m backend.tests.stress_test_bots
也可作为 pytest 用例运行（test_stress_* 函数）。

依据 docs/features/003-m5-tuning-deploy.md §任务 A.2。
"""
import sys

from backend.app.game.texas.engine import TexasEngine
from backend.app.game.brag.engine import BragEngine
from backend.app.game.guandan.engine import GuandanEngine

# 单局行动步数上限：远超正常对局所需，触顶即视为卡死
MAX_STEPS = 5000


def _legal_names(engine, sid) -> list[str]:
    legal = engine.private_state(sid).get("legal_actions", [])
    return [a["action"] for a in legal]


def _fallback_action(engine, sid) -> tuple[str, dict] | None:
    """bot 给出非法动作时的兜底（与 sio.py 生产逻辑一致）。

    只用零成本的保守动作（check/pass/fold），不含 call——call 在
    筹码不足时会被引擎拒绝，无法作为可靠兜底。
    """
    names = _legal_names(engine, sid)
    for act in ("check", "pass", "fold"):
        if act in names:
            return act, {}
    return None


def play_one_hand(engine) -> int:
    """驱动一手牌直到结束，返回所用步数。

    bot 行动非法时回退到保守动作；若连兜底都无法推进则判失败。
    """
    steps = 0
    while engine.hand_in_progress and steps < MAX_STEPS:
        steps += 1
        bot = engine.next_bot_action()
        if bot is None:
            # 当前回合不是 bot（本场景全是 bot，正常不会发生）
            if engine.current_turn is None:
                break
            raise AssertionError(
                f"current_turn={engine.current_turn} 非 bot，但全员应为 bot"
            )

        sid, action, payload = bot

        # 断言 bot 决策合法
        legal = _legal_names(engine, sid)
        if action not in legal:
            raise AssertionError(
                f"bot {sid} 返回非法动作 {action!r}，legal={legal}"
            )

        ok, err = engine.handle_action(sid, action, payload)
        if not ok:
            # 决策被引擎拒绝（如金额不足）→ 兜底，与生产一致
            fb = _fallback_action(engine, sid)
            if fb is None:
                raise AssertionError(
                    f"bot {sid} 动作 {action!r} 失败({err})，且无兜底动作"
                )
            ok2, err2 = engine.handle_action(sid, fb[0], fb[1])
            if not ok2:
                raise AssertionError(
                    f"bot {sid} 兜底 {fb[0]!r} 仍失败：{err2}"
                )

    if steps >= MAX_STEPS:
        raise AssertionError(f"单局超过 {MAX_STEPS} 步未结束，疑似卡死")

    assert not engine.hand_in_progress, "一手牌结束后 hand_in_progress 应为 False"
    return steps


def _make_texas() -> TexasEngine:
    e = TexasEngine("stress-texas", "压测-德州", small_blind=10, initial_chips=1000)
    for i, lvl in enumerate(["easy", "normal", "easy", "normal"]):
        e.add_player(f"bot{i}", f"Bot{i}", seat=i, is_bot=True, bot_level=lvl)
    return e


def _make_brag() -> BragEngine:
    e = BragEngine("stress-brag", "压测-炸金花", ante=10, initial_chips=1000)
    for i, lvl in enumerate(["easy", "normal", "easy", "normal"]):
        e.add_player(f"bot{i}", f"Bot{i}", seat=i, is_bot=True, bot_level=lvl)
    return e


def _make_guandan() -> GuandanEngine:
    e = GuandanEngine("stress-guandan", "压测-掼蛋")
    for i, lvl in enumerate(["easy", "normal", "easy", "normal"]):
        e.add_player(f"bot{i}", f"Bot{i}", seat=i, is_bot=True, bot_level=lvl)
    return e


def run_scenario(name: str, make_engine, hands: int = 10) -> dict:
    """连续跑 `hands` 局，返回统计。同一引擎复用以模拟真实多局。"""
    engine = make_engine()
    total_steps = 0
    for hand_no in range(1, hands + 1):
        if not engine.can_start():
            # 德扑/炸金花筹码耗尽 → 重置一张新桌继续压测
            engine = make_engine()
        engine.start_hand()
        steps = play_one_hand(engine)
        total_steps += steps
    return {"scenario": name, "hands": hands, "total_steps": total_steps}


SCENARIOS = [
    ("texas", _make_texas),
    ("brag", _make_brag),
    ("guandan", _make_guandan),
]


# ---- pytest 入口 ----
def test_stress_texas_10_hands():
    run_scenario("texas", _make_texas, hands=10)


def test_stress_brag_10_hands():
    run_scenario("brag", _make_brag, hands=10)


def test_stress_guandan_10_hands():
    run_scenario("guandan", _make_guandan, hands=10)


# ---- 脚本入口 ----
def main() -> int:
    print("=== Bot 压力测试：4 bot × 三玩法 × 10 局 ===\n")
    failed = False
    for name, make in SCENARIOS:
        try:
            stats = run_scenario(name, make, hands=10)
            print(f"[OK]  {name:<8} 10 局完成，累计 {stats['total_steps']} 步")
        except Exception as exc:  # noqa: BLE001 — 压测需捕获所有异常
            failed = True
            print(f"[FAIL] {name:<8} {type(exc).__name__}: {exc}")
    print("\n=== 全部通过 ===" if not failed else "\n=== 存在失败 ===")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
