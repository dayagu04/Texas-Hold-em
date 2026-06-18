# 任务交接

> 两个独立 agent 的工作清单。串联节点：**API 契约**和**数据形状**。

## 0. 协作约定

- 各自分支：后端 `feat/multi-game-backend`，前端 `feat/multi-game-frontend`。
- 集合事件：每个里程碑结束时跑一次"端到端冒烟"——前端连后端，能完成一局任意玩法（含 bot）。
- 如发现契约不够用：**先改 [API-CONTRACT.md](../design/API-CONTRACT.md)**，再 ping 另一端，最后写代码。
- 不要互相直接 import；前端只通过 [api.ts](../frontend/src/api.ts) / [socket.ts](../frontend/src/socket.ts)；后端只通过 [sio.py](../backend/app/sio.py) 暴露事件。

## 0.5 M3.5 联调修正（🔴 紧急，阻断前端真实联调）

> 后端已完成 M1-M3 单测，但实现偏离了 [API-CONTRACT.md](../design/API-CONTRACT.md)。以下两项必须修正后才能启动端到端联调。

### 问题 1：C→S 事件名不匹配 🔴 硬阻断

**现状**：后端 [sio.py](../backend/app/sio.py) 用 `@sio.event` 注册 handler，该装饰器按**函数名**注册事件：
```python
@sio.event
async def create_table(sid, data):  # 注册为 "create_table"
```

**契约要求**（[API-CONTRACT.md §2.2](../design/API-CONTRACT.md)）：C→S 事件名必须用**冒号**分隔，如 `lobby:create_table`。

**影响范围**：前端 `socket.emit('lobby:create_table', ...)` 发出后，后端无 handler 响应，所有 C→S 事件失效。

**修复方案**：改用 `@sio.on('事件名')` 显式注册。示例：
```python
@sio.on('lobby:create_table')  # ← 显式指定事件名
async def create_table(sid, data):
    ...
```

**需要修改的事件**（全部位于 [sio.py](../backend/app/sio.py)）：
- `lobby:list`、`lobby:create_table`、`lobby:join_table`、`lobby:leave_table`
- `table:action`、`table:start_hand`、`table:add_bot`、`table:remove_bot`、`table:chat`

**验收**：前端发 `socket.emit('lobby:create_table', {...})` 能收到 `lobby:joined` 回执。

---

### 问题 2：`table:hand_end` 事件缺失 🟡 功能缺口

**现状**：后端全仓搜不到任何 `emit('table:hand_end')`。一局结束时只广播 `table:state`，但 `state` 中无结算详情（赢家金额、摊牌、下局倒计时）。

**契约定义**（[API-CONTRACT.md §2.4 L154](../design/API-CONTRACT.md)）：
```ts
S→C: table:hand_end
{
  table_id: string;
  hand_id: string;
  results: HandResult[];     // 各玩法的结算对象数组
  next_hand_in: number;      // ms，0 表示等手动 start_hand
}
```

**影响**：前端结算浮层无法触发、赢家光晕不亮、无法显示下局倒计时。

**修复方案**：在各引擎的"一局结束"分支（德扑 showdown、炸金花最后比牌、掼蛋两人出完牌）调用：
```python
await sio.emit('table:hand_end', {
    'table_id': table_id,
    'hand_id': hand_id,
    'results': [...],  # 按玩法构造
    'next_hand_in': 5000  # 5s 后自动开下局，或 0 等手动
}, room=table_id)
```

**验收**：4 bot 打完一局德扑，前端能收到 `table:hand_end` 且 `results[0].winnings > 0`。

---

## 1. 后端 Agent 任务清单

### ~~M1 — GameEngine 抽象（基础设施）~~ ✅
### ~~M2 — 炸金花~~ ✅
### ~~M3 — 掼蛋~~ ✅

**注**：M1-M3 单测全绿，但需先完成 §0.5 的契约修正才能进入真实联调。

---

### M1 — GameEngine 抽象（基础设施）
- [ ] 新建 [backend/app/game/engine.py](../backend/app/game/engine.py)：定义 `GameEngine` Protocol，参考 [ARCHITECTURE.md §3](../design/ARCHITECTURE.md)。
- [ ] 把现有 [backend/app/game/table.py](../backend/app/game/table.py) 重构为 `texas/engine.py`，把 [evaluator.py](../backend/app/game/evaluator.py) 迁入 `texas/`。
- [ ] 新建 [backend/app/lobby.py](../backend/app/lobby.py)：管理 `tables: dict[str, GameEngine]`，提供 `create / join / leave / list`。
- [ ] 重写 [backend/app/sio.py](../backend/app/sio.py) 按 [API-CONTRACT.md §2](../design/API-CONTRACT.md) 全部事件。
- [ ] 新增 `auth.py` JWT 签发与校验。
- [ ] 单测：`tests/test_engine_contract.py` 跑空引擎契约（占位）。

### M2 — 炸金花
- [ ] [backend/app/game/brag/](../backend/app/game/brag/) 全套：engine + evaluator + bot。
- [ ] 单测覆盖 [GAME-RULES.md §E B-01..03](../design/GAME-RULES.md)。

### M3 — 掼蛋
- [ ] [backend/app/game/guandan/](../backend/app/game/guandan/)：engine + combos + tribute + bot。
- [ ] 单测：所有牌型识别 + 四人完整一局打完。

### M4 — 重连与稳定性
- [ ] `connect` 钩子：按 token 中的 name 找回原 sid 状态，emit `table:state` + `table:private`。
- [ ] 30s 离线超时计时器，超时打 `auto-fold` / `auto-pass`。

### M5 — Bot 调优 + 部署
- [ ] 按 [AI-BOTS.md](../design/AI-BOTS.md) 实现 6 个 bot 类。
- [ ] `tests/test_bots.py` 通过。
- [ ] 写 `backend/Dockerfile` 与 `docker-compose.yml`（v1 可选，单文件即可）。

### 后端验收
1. `pytest backend/tests/` 全绿。
2. `/api/health` 返回 200。
3. 4 个 bot + 0 真人能跑完一局德扑（脚本压测）。
4. 同名顶替：旧连接收到 `kicked` 后桌内状态完整迁移。

---

## 2. 前端 Agent 任务清单

### ~~M1 — 骨架与主题~~ ✅
### ~~M2 — 登录 / 大厅~~ ✅（部分，等后端修正）
### ~~M3 — 牌桌~~ ✅（骨架，等后端修正）

**当前状态**：前端 `BragBoard`/`GuandanBoard` 已存在，`mock.ts` 仅回放 Texas。真实联调被 §0.5 的后端契约偏差阻断。前端可继续推进不依赖后端在线的 M4/M5 任务（动效、构建）。

---

### M1 — 骨架与主题
- [ ] 引入路由：建议 `react-router-dom@7`（在 [package.json](../frontend/package.json) 添加）。
- [ ] 引入动效：`framer-motion`。
- [ ] 建 [frontend/src/theme/tokens.css](../frontend/src/theme/tokens.css) 按 [UI-DESIGN.md §2](../design/UI-DESIGN.md)。
- [ ] 在 [tailwind.config.js](../frontend/tailwind.config.js) 暴露 token 为 utility（`bg-felt`, `text-gold` 等）。
- [ ] 重构 [frontend/src/types.ts](../frontend/src/types.ts) → `types/{common,texas,guandan,brag}.ts`，与 [API-CONTRACT.md](../design/API-CONTRACT.md) 对齐。
- [ ] 集中 socket 单例 [socket.ts](../frontend/src/socket.ts)，hook `useSocket` 改为消费此单例。
- [ ] 字典 [i18n/zh-CN.ts](../frontend/src/i18n/zh-CN.ts)。

### M2 — 登录 / 大厅
- [ ] [Login.tsx](../frontend/src/components/Login.tsx) 改造：post `/api/login`，存 token，跳 `/lobby`。
- [ ] [Lobby.tsx](../frontend/src/components/Lobby.tsx) 改造：响应 `lobby:update`，玩法 tag 渲染。
- [ ] [CreateTableModal.tsx](../frontend/src/components/CreateTableModal.tsx) 三步式表单（玩法 → 参数 → AI）。
- [ ] [BotPanel.tsx](../frontend/src/components/BotPanel.tsx)：在桌内房主调出，发 `table:add_bot` / `table:remove_bot`。

### M3 — 牌桌
- [ ] [TableShell.tsx](../frontend/src/components/TableShell.tsx)：通用容器（玩家列表、聊天、行动条挂载点）。
- [ ] [TexasBoard.tsx](../frontend/src/components/tables/TexasBoard.tsx)：把现有 [PokerTable.tsx](../frontend/src/components/PokerTable.tsx) 主体迁入。
- [ ] [BragBoard.tsx](../frontend/src/components/tables/BragBoard.tsx)：3 张暗牌 + 看牌动画。
- [ ] [GuandanBoard.tsx](../frontend/src/components/tables/GuandanBoard.tsx)：4 座位固定布局 + 多选出牌。
- [ ] 共用 [CardSprite.tsx](../frontend/src/components/CardSprite.tsx)、[ChipStack.tsx](../frontend/src/components/ChipStack.tsx)、[SeatCard.tsx](../frontend/src/components/SeatCard.tsx)。

### M4 — 动效与体验
- [ ] 发牌 / 翻牌 / 筹码飞入按 [UI-DESIGN.md §8](../design/UI-DESIGN.md) 实现。
- [ ] 倒计时进度条（5s 红色警告）。
- [ ] 断线重连提示横幅（"正在重连…")。
- [ ] aria-live 朗读关键事件。

### M5 — 联调
- [ ] 全屏适配 1280×800 至 1920×1080；ipad 横屏可用。
- [ ] 部署构建：`npm run build` → `dist/` 嵌入后端静态目录。

### 前端验收
1. 任意玩法可创建房间 + 加 1 个 bot + 完成一局。
2. 三种 board 切换无样式串味。
3. lighthouse 性能分 ≥ 85，无控制台错误。
4. 暗色对比度 AA 通过。

---

## 3. 联调前置条件（在进入 M5 共同验收前必须完成）

- [ ] 后端完成 §0.5 的两项契约修正（C→S 事件名 + `table:hand_end`）。
- [ ] 前端 `mock.ts` 或真实后端连接能跑通一局 brag/guandan（目前仅 Texas 通）。
- [ ] 前端发 `lobby:create_table`（冒号）能收到 `lobby:joined` 回执。
- [ ] 任意玩法打完一局能收到 `table:hand_end` 事件（前端控制台 log 验证）。

**验收路径**：前端连后端，创建一个 brag 桌 + 加 2 个 bot，打完一局，前端能正常显示结算浮层。

---

## 4. 共同验收（M5 末端，联调通过后执行）

- [ ] 端到端：4 真人玩家分别从 4 浏览器登录，玩一局掼蛋打完结算。
- [ ] 混合：1 真人 + 3 bot 玩炸金花，bot 不卡顿。
- [ ] 抽象：新增一个假玩法（占位，不实现 UI），仅靠后端和契约就能在大厅中创建并 `start_hand` 报错（`engine.can_start=False`）。
- [ ] 文档：每个 agent 在自己的代码内补 README 段落，指回 [docs/](.) 对应章节。

## 4. FAQ

**Q: API 契约里的事件名我觉得别扭，能改吗？**
A: 能。改了同步 ping 另一端在 [API-CONTRACT.md](../design/API-CONTRACT.md) 评审一行字"v1.0.1: rename …"，再写代码。

**Q: 后端还没好，前端怎么开发？**
A: 在 [frontend/src/socket.ts](../frontend/src/socket.ts) 写 mock 模式：开关 `VITE_MOCK=1` 时，由本地 reducer 模拟事件回放，用于 UI 调试。

**Q: 掼蛋规则太复杂，能不能砍？**
A: v1 已砍：固定打 2、关闭"过 A 升级"、关闭癞子、首局红心 4 先出。详见 [GAME-RULES.md §C](../design/GAME-RULES.md)。
