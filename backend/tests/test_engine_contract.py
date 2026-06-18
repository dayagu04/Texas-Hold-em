"""测试 GameEngine 契约：验证 public_state 不含底牌。"""
import pytest
from backend.app.game.texas import TexasEngine


def test_engine_contract_no_hole_in_public():
    """硬约束：public_state 永不包含 hole 字段。"""
    engine = TexasEngine("test", "测试桌", small_blind=10)
    engine.add_player("p1", "Alice", 0)
    engine.add_player("p2", "Bob", 1)

    engine.start_hand()

    public = engine.public_state()

    # 验证：public_state 的任何嵌套结构都不含 "hole" 字段
    assert_no_hole_in_dict(public)


def assert_no_hole_in_dict(d: dict, path=""):
    """递归检查字典中不存在 'hole' 键。"""
    for k, v in d.items():
        current_path = f"{path}.{k}" if path else k
        assert k != "hole", f"发现 hole 字段在 {current_path}"
        if isinstance(v, dict):
            assert_no_hole_in_dict(v, current_path)
        elif isinstance(v, list):
            for i, item in enumerate(v):
                if isinstance(item, dict):
                    assert_no_hole_in_dict(item, f"{current_path}[{i}]")


def test_private_state_has_hole():
    """私有状态应包含 hole。"""
    engine = TexasEngine("test", "测试桌")
    engine.add_player("p1", "Alice", 0)
    engine.add_player("p2", "Bob", 1)
    engine.start_hand()

    private = engine.private_state("p1")
    assert "hole" in private
    assert len(private["hole"]) == 2


def test_texas_engine_can_start():
    """测试 can_start 条件。"""
    engine = TexasEngine("test", "测试桌")
    assert not engine.can_start()

    engine.add_player("p1", "Alice", 0)
    assert not engine.can_start()

    engine.add_player("p2", "Bob", 1)
    assert engine.can_start()


def test_texas_basic_flow():
    """测试德州基础流程不退化。"""
    engine = TexasEngine("test", "测试桌", initial_chips=1000)
    engine.add_player("p1", "Alice", 0)
    engine.add_player("p2", "Bob", 1)

    engine.start_hand()
    assert engine.hand_in_progress

    # Alice 行动
    ok, _ = engine.handle_action("p1", "fold", {})
    assert ok

    # Bob 获胜
    assert not engine.hand_in_progress
    assert engine.stage.value == "showdown"