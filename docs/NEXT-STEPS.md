# 下一阶段工作指令

> **当前时间**：2026-06-19  
> **当前分支**：`feat/multi-game-backend` (后端), `feat/multi-game-frontend` (前端)  
> **当前阶段**：M3.5 联调修正（M1-M3 已完成但未联调验证）

---

## 🎯 核心判断

**进度不在"做新玩法"，而是卡在联调阻断**

- 后端 M1-M3 单测 22 条全绿 ✅
- 前端三个 board 组件已存在 ✅
- **但**两边从未对过真实数据形状，后端有 2 处契约偏差阻断联调 🔴

**优先级**：修正契约偏差 > 联调验证 > 继续 M4/M5

---

## ✅ 后端 Agent：契约修正已完成（2026-06-19）

### ~~任务 1：修正 C→S 事件名（硬阻断）~~ ✅

**位置**：[backend/app/sio.py](../backend/app/sio.py)

**问题**：用 `@sio.event` 按函数名注册（如 `create_table`），但契约要求冒号分隔（`lobby:create_table`）。

**修改**：改用 `@sio.on('事件名')` 显式注册。

**需要改的 handler**：
```python
# 改前
@sio.event
async def create_table(sid, data):

# 改后
@sio.on('lobby:create_table')
async def create_table(sid, data):
```

**完整列表**（9 个 handler）：
- `lobby:list`
- `lobby:create_table`
- `lobby:join_table`
- `lobby:leave_table`
- `table:action`
- `table:start_hand`
- `table:add_bot`
- `table:remove_bot`
- `table:chat`

**验收**：启动后端，前端 `socket.emit('lobby:create_table', {...})` 能收到 `lobby:joined` 回执。

---

### ~~任务 2：补充 `table:hand_end` 事件（功能缺口）~~ ✅

**问题**：一局结束时只 emit `table:state`，前端收不到结算详情（赢家金额、摊牌、下局倒计时）。

**契约定义**（[API-CONTRACT.md §2.4](./API-CONTRACT.md)）：
```python
await sio.emit('table:hand_end', {
    'table_id': table_id,
    'hand_id': hand_id,
    'results': [
        {'seat': 0, 'winnings': 200, 'cards': [...], 'rank': 'Full House'},
        # ... 其他玩家
    ],
    'next_hand_in': 5000  # ms，5s 后自动开下局；0 表示等手动 start_hand
}, room=table_id)
```

**需要改的位置**（3 个引擎）：
- [backend/app/game/texas/engine.py](../backend/app/game/texas/engine.py) showdown 后
- [backend/app/game/brag/engine.py](../backend/app/game/brag/engine.py) 比牌结算后
- [backend/app/game/guandan/engine.py](../backend/app/game/guandan/engine.py) 两人出完牌后

**建议**：在各引擎的 `_end_hand()` 或 `_showdown()` 方法末尾，构造 `results` 数组后 emit。

**验收**：4 bot 打完一局德扑，用 `socket.on('table:hand_end')` 能收到事件且 `results[0].winnings > 0`。

---

### 任务 3（可选，M4）：补充 30s 超时自动落子

**现状**：[sio.py](../backend/app/sio.py) 有 `disconnect_timers` 和同名顶替，但没有"超时 30s 自动 fold/pass"逻辑。

**HANDOFF M4 要求**：玩家轮到但 30s 未操作 → 自动 `auto-fold`（德扑/炸金花）或 `auto-pass`（掼蛋）。

**优先级**：低于任务 1/2（不阻断联调，但 M4 需要）。

---

## 🟢 前端 Agent：继续推进（不依赖后端在线的部分）

### 可以继续做的（不阻断）

1. **M4 动效**：发牌/翻牌/筹码飞入（[UI-DESIGN.md §8](./UI-DESIGN.md)）、倒计时 5s 红色警告、aria-live。
2. **M5 构建**：`npm run build` → `dist/` 嵌入后端静态目录的脚本。
3. **mock.ts 补全**：把 brag/guandan 的事件回放补进 [frontend/src/transport/mock.ts](../frontend/src/transport/mock.ts)，方便离线 UI 调试。

### 需要等后端修正的

4. **真实联调**：后端完成任务 1/2 后，前端连后端跑一局 brag/guandan，验证 `BragBoard`/`GuandanBoard` 消费的字段与后端 emit 的一致。
5. **结算浮层**：依赖 `table:hand_end` 事件（后端任务 2）。

**建议优先级**：先做 1-3，后端修完后立即做 4-5。

---

## ✅ 联调验收路径（后端任务 1/2 完成后执行）

### 最小验证（5 分钟）
1. 后端启动，前端 `npm run dev` 连 `localhost:8000`。
2. 登录 → 创建 brag 桌 → 加 2 个 bot → 打完一局。
3. 检查前端控制台：
   - 收到 `lobby:joined` ✅
   - 收到 `table:state` ✅
   - 收到 `table:hand_end` ✅
   - 结算浮层显示赢家金额 ✅

### 完整验证（M5 共同验收）
详见 [HANDOFF.md §4](./HANDOFF.md)。

---

## 📊 当前进度总结

| 里程碑 | 后端 | 前端 | 联调状态 |
|--------|------|------|----------|
| M1 引擎抽象 | ✅ | ✅ | ✅ 契约已修正 |
| M2 炸金花 | ✅ | ✅ (骨架) | 🟡 待联调验证 |
| M3 掼蛋 | ✅ | ✅ (骨架) | 🟡 待联调验证 |
| M4 重连 | 🟡 (部分) | 🟡 (壳) | - |
| M5 联调 | ⏸️ 等 M3.5 | ⏸️ 等 M3.5 | - |

**解除阻断后的推进路径**：
1. 后端修正 2 处契约偏差（~1-2 小时）
2. 前端连后端跑最小验证（~30 分钟）
3. 并行推进 M4/M5（后端补超时逻辑 + 前端动效/构建）
4. M5 末端完整联调（4 真人 + 3 种玩法各一局）

---

## 🔗 相关文档

- [API-CONTRACT.md](./API-CONTRACT.md) — 契约定义（修改任何字段必须先改此文档）
- [HANDOFF.md](./HANDOFF.md) — 完整任务清单（已更新 §0.5 联调修正）
- [PRD.md](./PRD.md) — 产品需求（里程碑表）
- [ARCHITECTURE.md](./ARCHITECTURE.md) — 技术架构

---

**PM 签发**：2026-06-19  
**下次同步**：后端完成契约修正后，通知前端启动联调验证
