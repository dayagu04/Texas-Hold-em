# Bug: 加入旧房间后开始游戏看不到下注按钮

> **报告**: 2026-06-19 用户反馈
> **影响**: 玩家以新 sid 加入残留旧 player 的房间后,开始游戏轮到自己时看不到任何下注按钮 → 牌局完全卡死
> **优先级**: 🔴 P0(阻断核心玩法)

## 1. 现象

1. 用户登录 → 创建房间(seat=0,房主)
2. 关闭页面 → 后端 30s disconnect 超时(session 已清,但 engine.players 里旧 player 残留)
3. 用户重新打开/刷新前端 → 新 socket(新 sid)
4. 看到大厅里"自己之前的桌"还在 → 点"加入"
5. 点"开始游戏" → 进入 preflop,但**没有任何下注按钮显示**(fold/check/call/raise 全无)
6. 等待 30s 超时被自动 fold/pass,无法操作

## 2. 根因(前后端协同 bug)

### 2.1 后端: `lobby_join_table` 没处理"同名残留"

[backend/app/sio.py:248-286](../../backend/app/sio.py#L248):

```python
@sio.on('lobby:join_table')
async def lobby_join_table(sid, data):
    ...
    # 自动选座
    if seat is None:
        taken_seats = {p["seat"] for p in engine.public_state()["players"]}
        available = [s for s in range(engine.max_players) if s not in taken_seats]
        seat = available[0]

    engine.add_player(sid, sess["name"], seat)  # ← 直接加新 player,不检查同名残留
```

**残留来源**: [sio.py:178-186](../../backend/app/sio.py#L178) disconnect 超时只清 `sessions` 和 `name_to_sid`,**不动 `engine.players`**。注释说"hand 没在进行就不 fold",但也没把 player 从引擎移除。

**结果**: engine.players 里有两个同名 player:
- seat=0,sid=旧 sid(已失效) — 被引擎选为 SB,`current_turn=旧 sid`
- seat=1,sid=新 sid — 当前真实玩家

### 2.2 前端: `mySid` 推断按 name 找,匹配到残留旧 player

[frontend/src/components/TablePage.tsx:44-45](../../frontend/src/components/TablePage.tsx#L44):

```ts
const mySid =
  state.players.find((p) => p.name === name)?.sid ?? "sid-me";
```

按 `name` 查找,`Array.find` 返回**第一个**匹配 → 命中 seat=0 的旧 player → mySid = 旧 sid。

### 2.3 协同效应(为什么"看似一切正常但没按钮")

| 项 | 真实值 | 计算结果 | 期望 |
|----|--------|----------|------|
| 后端 `current_turn` | 旧 sid (seat=0) | — | — |
| 后端 emit `table:private` 给 | 旧 sid 的 socket(不存在,黑洞) + 新 sid 的 socket | 新 sid 收到 priv | priv 应给真实玩家 |
| 新 sid 收到的 `priv.legal_actions` | `[]`(因为他不是 current_turn) | 空数组 | 应有 fold/call/raise |
| 前端 `mySid` 推断 | 旧 sid(name 匹配优先) | 旧 sid | 新 sid |
| 前端 `isMyTurn = currentTurn === mySid` | 旧 sid === 旧 sid | **true** | 应为 true(走真实 sid) |
| 前端渲染 `legalActions.map(...)` | `[].map` | 空 | 4-5 个按钮 |

**最终**: `isMyTurn=true` 触发底部 footer 显示,但按钮区为空 → 用户看到一片空白。

## 3. 修复方案

### 3.1 后端(主修复)

**任务 A**: `lobby_join_table` 在分座位前检查同名残留,走重连而不是新增。

**任务 B**: disconnect 超时清理时,无论 hand 是否在进行,把 player 从 `engine.players` 移除(若 hand 在进行则保留座位但标记 sitting_out / folded 由现有逻辑处理)。

### 3.2 前端(防御性修复)

**任务 C**: `mySid` 改用 socket.id 推断,不再用 name 匹配(消除同名残留误判)。

## 4. 验收

1. 创建桌 → 关闭页面 → 30s+ 后重新打开 → 加入同一桌 → 点开始游戏 → **能看到下注按钮**
2. 4 个 bot + 1 真人,真人重连后点开始,真人轮到时按钮正常显示
3. 后端单测: 同名玩家 disconnect 超时后再 join,engine.players 里只有 1 个该 name 的 player

## 5. 关联

- 同源问题: [005 死局清理](./005-start-button-seat-fix-cleanup.md) 处理了"无人房间"清理,但没处理"同名残留 player"
- 重连机制: [sio.py:75-110](../../backend/app/sio.py#L75)(connect 钩子)处理的是"显式重连同 socket 路径",join_table 是另一条路径,需对称
