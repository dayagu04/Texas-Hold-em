"""验证修正任务的脚本。

验证：
1. sio.py 的 9 个 C→S 事件使用 @sio.on() 显式注册
2. 三个引擎都有 get_hand_end_payload() 方法
3. sio.py 会在手牌结束时 emit table:hand_end
"""
import re
import ast


def verify_task_1():
    """验证任务 1：C→S 事件注册方式。"""
    print("=" * 60)
    print("任务 1：验证 C→S 事件注册")
    print("=" * 60)

    with open("app/sio.py", "r", encoding="utf-8") as f:
        content = f.read()

    expected_events = [
        "lobby:list",
        "lobby:create_table",
        "lobby:join_table",
        "lobby:leave_table",
        "table:start_hand",
        "table:action",
        "table:add_bot",
        "table:remove_bot",
        "table:chat",
    ]

    found_events = []
    for event in expected_events:
        pattern = rf"@sio\.on\(['\"]({event})['\"]\)"
        if re.search(pattern, content):
            found_events.append(event)
            print(f"✅ {event}")
        else:
            print(f"❌ {event} - 未找到 @sio.on() 注册")

    if len(found_events) == len(expected_events):
        print(f"\n✅ 任务 1 完成：所有 {len(expected_events)} 个事件已正确注册")
        return True
    else:
        print(f"\n❌ 任务 1 未完成：{len(expected_events) - len(found_events)} 个事件缺失")
        return False


def verify_task_2():
    """验证任务 2：table:hand_end 事件支持。"""
    print("\n" + "=" * 60)
    print("任务 2：验证 table:hand_end 支持")
    print("=" * 60)

    engines = [
        ("app/game/texas/engine.py", "TexasEngine"),
        ("app/game/brag/engine.py", "BragEngine"),
        ("app/game/guandan/engine.py", "GuandanEngine"),
    ]

    all_ok = True
    for path, name in engines:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()

        if "def get_hand_end_payload(self)" in content:
            print(f"✅ {name}: get_hand_end_payload() 方法已添加")
        else:
            print(f"❌ {name}: 缺少 get_hand_end_payload() 方法")
            all_ok = False

    # 验证 sio.py 会 emit table:hand_end
    with open("app/sio.py", "r", encoding="utf-8") as f:
        sio_content = f.read()

    if 'emit("table:hand_end"' in sio_content:
        print(f"✅ sio.py: 已添加 table:hand_end 事件发送")
    else:
        print(f"❌ sio.py: 缺少 table:hand_end 事件发送")
        all_ok = False

    if all_ok:
        print(f"\n✅ 任务 2 完成：所有引擎支持 hand_end，sio.py 会发送事件")
        return True
    else:
        print(f"\n❌ 任务 2 未完成：存在缺失项")
        return False


def verify_hand_end_payload_structure():
    """验证 hand_end payload 结构符合契约。"""
    print("\n" + "=" * 60)
    print("额外验证：hand_end payload 结构")
    print("=" * 60)

    # 检查 Texas
    with open("app/game/texas/engine.py", "r", encoding="utf-8") as f:
        texas_content = f.read()

    required_fields = ["table_id", "hand_id", "results", "next_hand_in"]
    all_ok = True

    for field in required_fields:
        if f'"{field}":' in texas_content:
            print(f"✅ payload 包含字段: {field}")
        else:
            print(f"❌ payload 缺少字段: {field}")
            all_ok = False

    if all_ok:
        print(f"\n✅ payload 结构符合 API-CONTRACT.md")
    else:
        print(f"\n⚠️  payload 结构可能不完整")

    return all_ok


if __name__ == "__main__":
    print("\n🔍 验证后端契约修正任务\n")

    task1_ok = verify_task_1()
    task2_ok = verify_task_2()
    payload_ok = verify_hand_end_payload_structure()

    print("\n" + "=" * 60)
    print("验证总结")
    print("=" * 60)

    if task1_ok and task2_ok:
        print("✅ 所有任务已完成，可以开始前后端联调")
    else:
        print("❌ 存在未完成的任务，需要继续修正")

    print("\n📋 下一步：")
    print("1. 启动后端：cd backend && uvicorn app.main:app --reload")
    print("2. 前端连接 localhost:8000")
    print("3. 创建 brag/guandan 桌 → 加 bot → 打完一局")
    print("4. 检查前端控制台是否收到 lobby:joined, table:state, table:hand_end")
