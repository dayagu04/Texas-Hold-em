#!/usr/bin/env python3
"""
测试掼蛋和炸金花的回放功能（验收要求：三玩法都能记录）
"""
import asyncio
import socketio
import httpx

BASE_URL = "http://localhost:8000"

async def test_game_replay(game_type: str, seats: int, token: str):
    """测试特定玩法的回放"""
    print(f"\n### 测试 {game_type.upper()} 回放")

    sio = socketio.AsyncClient()
    table_id = None
    hand_id = None
    hand_ended = asyncio.Event()

    @sio.on("lobby:joined")
    async def on_joined(data):
        nonlocal table_id
        table_id = data["table_id"]
        print(f"✓ 创建 {game_type} 房间: {table_id}")

    @sio.on("table:state")
    async def on_state(data):
        nonlocal hand_id
        if not hand_id:
            hand_id = data["hand_id"]
            print(f"✓ 游戏开始，hand_id: {hand_id}")

    @sio.on("table:hand_end")
    async def on_end(data):
        print(f"✓ 游戏结束")
        hand_ended.set()

    await sio.connect(BASE_URL, auth={"token": token})

    # 创建房间（全 bot）
    config = {
        "name": f"{game_type}_test",
        "game_type": game_type,
        "seats": seats,
    }

    # 添加 bots
    bots = [{"seat": i, "level": "easy"} for i in range(1, seats)]
    config["bots"] = bots

    if game_type == "texas":
        config["initial_chips"] = 1000
        config["small_blind"] = 10
    elif game_type == "brag":
        config["initial_chips"] = 1000
        config["ante"] = 10

    await sio.emit("lobby:create_table", config)
    await asyncio.sleep(1)

    if not table_id:
        print(f"✗ {game_type} 房间创建失败")
        await sio.disconnect()
        return None

    # 开始游戏
    await sio.emit("table:start_hand", {"table_id": table_id})

    # 等待游戏结束（bot 自动玩）
    try:
        await asyncio.wait_for(hand_ended.wait(), timeout=10.0)
    except asyncio.TimeoutError:
        print(f"✗ {game_type} 游戏未结束（超时）")
        await sio.disconnect()
        return None

    await sio.disconnect()

    # 验证回放
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{BASE_URL}/api/hand/{hand_id}/replay",
            headers={"Authorization": f"Bearer {token}"}
        )

        if resp.status_code == 200:
            replay = resp.json()
            action_count = len(replay["actions"])
            print(f"✓ {game_type} 回放获取成功，记录了 {action_count} 个动作")

            if action_count > 0:
                # 显示前几个动作
                for action in replay["actions"][:3]:
                    payload_str = f", payload: {action['payload']}" if action['payload'] else ""
                    print(f"  - {action['name']} {action['action']}{payload_str}")
                return action_count
            else:
                print(f"✗ {game_type} 回放 actions 为空")
                return 0
        else:
            print(f"✗ {game_type} 回放接口返回 {resp.status_code}")
            return None

async def main():
    print("=== 测试三种玩法的回放记录 ===")

    # 登录
    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{BASE_URL}/api/login", json={"name": "admin"})
        token = resp.json()["token"]

    # 测试三种玩法
    results = {}
    results["texas"] = await test_game_replay("texas", 2, token)
    results["guandan"] = await test_game_replay("guandan", 4, token)
    results["brag"] = await test_game_replay("brag", 2, token)

    # 总结
    print("\n=== 测试结果总结 ===")
    for game_type, count in results.items():
        if count and count > 0:
            print(f"✓ {game_type}: {count} 个动作已记录")
        else:
            print(f"✗ {game_type}: 回放记录失败")

    all_passed = all(count and count > 0 for count in results.values())
    if all_passed:
        print("\n✓ 三种玩法的回放功能全部正常")
    else:
        print("\n✗ 部分玩法回放功能异常")

if __name__ == "__main__":
    asyncio.run(main())
