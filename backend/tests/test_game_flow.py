#!/usr/bin/env python3
"""
M5 完整游戏流程联调测试
测试创建房间 → 游戏 → 结束 → 回放
"""
import asyncio
import socketio
import httpx
import json

BASE_URL = "http://localhost:8000"

async def main():
    print("=== M5 完整游戏流程联调测试 ===\n")

    # 1. 登录两个用户
    print("### 登录测试用户")
    async with httpx.AsyncClient() as client:
        resp1 = await client.post(f"{BASE_URL}/api/login", json={"name": "admin"})
        admin_token = resp1.json()["token"]
        print(f"✓ admin 登录成功")

        resp2 = await client.post(f"{BASE_URL}/api/login", json={"name": "alice"})
        alice_token = resp2.json()["token"]
        print(f"✓ alice 登录成功")

    # 2. 连接 Socket.IO
    print("\n### Socket.IO 连接")
    sio_admin = socketio.AsyncClient()
    sio_alice = socketio.AsyncClient()

    admin_table_id = None
    game_started = asyncio.Event()
    hand_ended = asyncio.Event()
    hand_id = None

    @sio_admin.on("lobby:joined")
    async def on_admin_joined(data):
        nonlocal admin_table_id
        admin_table_id = data["table_id"]
        print(f"✓ admin 加入房间: {admin_table_id}")

    @sio_admin.on("table:state")
    async def on_admin_state(data):
        nonlocal hand_id
        if data.get("stage") == "preflop" and not game_started.is_set():
            hand_id = data["hand_id"]
            print(f"✓ 游戏开始，hand_id: {hand_id}")
            game_started.set()

    @sio_admin.on("table:hand_end")
    async def on_hand_end(data):
        print(f"✓ 游戏结束")
        hand_ended.set()

    @sio_alice.on("lobby:joined")
    async def on_alice_joined(data):
        print(f"✓ alice 加入房间: {data['table_id']}")

    await sio_admin.connect(BASE_URL, auth={"token": admin_token})
    print("✓ admin Socket.IO 连接成功")

    await sio_alice.connect(BASE_URL, auth={"token": alice_token})
    print("✓ alice Socket.IO 连接成功")

    # 3. 创建房间
    print("\n### 创建房间")
    await sio_admin.emit("lobby:create_table", {
        "name": "M5测试房间",
        "game_type": "texas",
        "seats": 2,
        "initial_chips": 1000,
        "small_blind": 10,
        "bots": [{"seat": 1, "level": "easy"}]  # 添加一个 bot
    })

    await asyncio.sleep(1)

    if not admin_table_id:
        print("✗ 房间创建失败")
        return

    print(f"✓ 房间创建成功: {admin_table_id}")

    # 4. 开始游戏
    print("\n### 开始游戏")
    await sio_admin.emit("table:start_hand", {"table_id": admin_table_id})

    try:
        await asyncio.wait_for(game_started.wait(), timeout=5.0)
    except asyncio.TimeoutError:
        print("✗ 游戏未开始（超时）")
        return

    # 5. 简单操作：admin fold
    print("\n### 执行游戏操作")
    await asyncio.sleep(1)
    await sio_admin.emit("table:action", {
        "table_id": admin_table_id,
        "action": "fold",
        "payload": {}
    })
    print("✓ admin 弃牌")

    try:
        await asyncio.wait_for(hand_ended.wait(), timeout=5.0)
    except asyncio.TimeoutError:
        print("✗ 游戏未结束（超时）")
        return

    await sio_admin.disconnect()
    await sio_alice.disconnect()

    # 6. 验证回放接口
    print("\n### 验证回放接口")
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{BASE_URL}/api/hand/{hand_id}/replay",
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        if resp.status_code == 200:
            replay = resp.json()
            print(f"✓ 回放数据获取成功")
            print(f"  - hand_id: {replay['hand_id']}")
            print(f"  - game_type: {replay['game_type']}")
            print(f"  - pot: {replay['pot']}")
            print(f"  - actions 数量: {len(replay['actions'])}")

            if len(replay['actions']) > 0:
                print(f"✓ 回放记录了 {len(replay['actions'])} 个动作")
                for i, action in enumerate(replay['actions'][:3]):  # 显示前3个
                    print(f"    {i}. {action['name']} {action['action']} (stage: {action['stage']})")
            else:
                print("✗ 回放 actions 为空")
        else:
            print(f"✗ 回放接口返回 {resp.status_code}: {resp.text}")

    print("\n=== 完整流程测试完成 ===")

if __name__ == "__main__":
    asyncio.run(main())
