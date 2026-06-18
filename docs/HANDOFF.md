# 任务交接

> 两个独立 agent 的工作清单。串联节点：**API 契约**和**数据形状**。

## 0. 协作约定

- 各自分支：后端 `feat/multi-game-backend`，前端 `feat/multi-game-frontend`。
- 集合事件：每个里程碑结束时跑一次"端到端冒烟"——前端连后端，能完成一局任意玩法（含 bot）。
- 如发现契约不够用：**先改 [API-CONTRACT.md](./API-CONTRACT.md)**，再 ping 另一端，最后写代码。
- 不要互相直接 import；前端只通过 [api.ts](../frontend/src/api.ts) / [socket.ts](../frontend/src/socket.ts)；后端只通过 [sio.py](../backend/app/sio.py) 暴露事件。

## 1. 后端 Agent 任务清单

### M1 — GameEngine 抽象（基础设施）
- [ ] 新建 [backend/app/game/engine.py](../backend/app/game/engine.py)：定义 `GameEngine` Protocol，参考 [ARCHITECTURE.md §3](./ARCHITECTURE.md)。
- [ ] 把现有 [backend/app/game/table.py](../backend/app/game/table.py) 重构为 `texas/engine.py`，把 [evaluator.py](../backend/app/game/evaluator.py) 迁入 `texas/`。
- [ ] 新建 [backend/app/lobby.py](../backend/app/lobby.py)：管理 `tables: dict[str, GameEngine]`，提供 `create / join / leave / list`。
- [ ] 重写 [backend/app/sio.py](../backend/app/sio.py) 按 [API-CONTRACT.md §2](./API-CONTRACT.md) 全部事件。
- [ ] 新增 `auth.py` JWT 签发与校验。
- [ ] 单测：`tests/test_engine_contract.py` 跑空引擎契约（占位）。

### M2 — 炸金花
- [ ] [backend/app/game/brag/](../backend/app/game/brag/) 全套：engine + evaluator + bot。
- [ ] 单测覆盖 [GAME-RULES.md §E B-01..03](./GAME-RULES.md)。

### M3 — 掼蛋
- [ ] [backend/app/game/guandan/](../backend/app/game/guandan/)：engine + combos + tribute + bot。
- [ ] 单测：所有牌型识别 + 四人完整一局打完。

### M4 — 重连与稳定性
- [ ] `connect` 钩子：按 token 中的 name 找回原 sid 状态，emit `table:state` + `table:private`。
- [ ] 30s 离线超时计时器，超时打 `auto-fold` / `auto-pass`。

### M5 — Bot 调优 + 部署
- [ ] 按 [AI-BOTS.md](./AI-BOTS.md) 实现 6 个 bot 类。
- [ ] `tests/test_bots.py` 通过。
- [ ] 写 `backend/Dockerfile` 与 `docker-compose.yml`（v1 可选，单文件即可）。

### 后端验收
1. `pytest backend/tests/` 全绿。
2. `/api/health` 返回 200。
3. 4 个 bot + 0 真人能跑完一局德扑（脚本压测）。
4. 同名顶替：旧连接收到 `kicked` 后桌内状态完整迁移。

---

## 2. 前端 Agent 任务清单

### M1 — 骨架与主题
- [ ] 引入路由：建议 `react-router-dom@7`（在 [package.json](../frontend/package.json) 添加）。
- [ ] 引入动效：`framer-motion`。
- [ ] 建 [frontend/src/theme/tokens.css](../frontend/src/theme/tokens.css) 按 [UI-DESIGN.md §2](./UI-DESIGN.md)。
- [ ] 在 [tailwind.config.js](../frontend/tailwind.config.js) 暴露 token 为 utility（`bg-felt`, `text-gold` 等）。
- [ ] 重构 [frontend/src/types.ts](../frontend/src/types.ts) → `types/{common,texas,guandan,brag}.ts`，与 [API-CONTRACT.md](./API-CONTRACT.md) 对齐。
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
- [ ] 发牌 / 翻牌 / 筹码飞入按 [UI-DESIGN.md §8](./UI-DESIGN.md) 实现。
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

## 3. 共同验收（M5 末端）

- [ ] 端到端：4 真人玩家分别从 4 浏览器登录，玩一局掼蛋打完结算。
- [ ] 混合：1 真人 + 3 bot 玩炸金花，bot 不卡顿。
- [ ] 抽象：新增一个假玩法（占位，不实现 UI），仅靠后端和契约就能在大厅中创建并 `start_hand` 报错（`engine.can_start=False`）。
- [ ] 文档：每个 agent 在自己的代码内补 README 段落，指回 [docs/](.) 对应章节。

## 4. FAQ

**Q: API 契约里的事件名我觉得别扭，能改吗？**
A: 能。改了同步 ping 另一端在 [API-CONTRACT.md](./API-CONTRACT.md) 评审一行字"v1.0.1: rename …"，再写代码。

**Q: 后端还没好，前端怎么开发？**
A: 在 [frontend/src/socket.ts](../frontend/src/socket.ts) 写 mock 模式：开关 `VITE_MOCK=1` 时，由本地 reducer 模拟事件回放，用于 UI 调试。

**Q: 掼蛋规则太复杂，能不能砍？**
A: v1 已砍：固定打 2、关闭"过 A 升级"、关闭癞子、首局红心 4 先出。详见 [GAME-RULES.md §C](./GAME-RULES.md)。
