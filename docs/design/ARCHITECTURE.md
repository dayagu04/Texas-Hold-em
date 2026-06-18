# 架构设计

## 1. 技术栈（沿用现状）

- **后端**：Python 3.14 + FastAPI + python-socketio（ASGI）
- **前端**：React 19 + TypeScript + Vite + Tailwind v4 + socket.io-client
- **协议**：HTTP（登录、配置） + WebSocket（实时对局，via Socket.IO）
- **存储**：v1 内存态；用户白名单为 JSON 文件 [backend/allowed_users.json](../backend/allowed_users.json)

## 2. 模块划分

```
backend/app/
├── auth.py                 # 白名单 + session token
├── main.py                 # FastAPI 入口，挂载 sio_app
├── sio.py                  # Socket.IO 事件路由（玩法无关 + 玩法专属转发）
├── lobby.py                # 大厅、房间索引、房间生命周期
└── game/
    ├── engine.py           # GameEngine 抽象基类（核心契约）
    ├── cards.py            # 通用 Card / Deck 工具
    ├── bot.py              # Bot 抽象 + 注册表
    ├── texas/
    │   ├── engine.py       # TexasEngine
    │   ├── evaluator.py    # 7 选 5 牌型评估（已有，迁入）
    │   └── bot.py          # TexasBot(easy/normal)
    ├── guandan/
    │   ├── engine.py
    │   ├── combos.py       # 牌型识别（单/对/三/顺/钢板/三连对/炸/同花顺/火箭）
    │   ├── tribute.py      # 进贡 / 还贡
    │   └── bot.py
    └── brag/
        ├── engine.py
        ├── evaluator.py    # 三张牌牌型
        └── bot.py
```

```
frontend/src/
├── App.tsx                 # 路由：login / lobby / table
├── api.ts                  # 后端 REST 调用
├── socket.ts               # Socket.IO 单例
├── types/                  # 与 API-CONTRACT 对应的 TS 类型
│   ├── common.ts
│   ├── texas.ts
│   ├── guandan.ts
│   └── brag.ts
├── components/
│   ├── Login.tsx
│   ├── Lobby.tsx
│   ├── CreateTableModal.tsx
│   ├── BotPanel.tsx              # 选难度 / 加 Bot
│   ├── ChatPanel.tsx
│   ├── TableShell.tsx            # 通用容器：HUD / 聊天 / 玩家列表
│   └── tables/
│       ├── TexasBoard.tsx
│       ├── GuandanBoard.tsx
│       └── BragBoard.tsx
├── hooks/
│   ├── useSocket.ts
│   └── useTableState.ts
└── theme/                  # tailwind 自定义令牌、动画 keyframes
```

## 3. GameEngine 抽象（后端核心）

每个引擎实现以下接口，由 `lobby.py` 持有实例并把 Socket.IO 事件路由给它：

```python
class GameEngine(Protocol):
    game_type: Literal["texas", "guandan", "brag"]
    min_players: int
    max_players: int

    def add_player(self, sid: str, name: str, seat: int, is_bot: bool, bot_level: str | None) -> None: ...
    def remove_player(self, sid: str) -> None: ...
    def can_start(self) -> bool: ...
    def start_hand(self) -> None: ...
    def handle_action(self, sid: str, action: str, payload: dict) -> None: ...
    def public_state(self) -> dict: ...           # 推给所有人
    def private_state(self, sid: str) -> dict: ...# 仅推给特定玩家（含底牌）
    def is_hand_over(self) -> bool: ...
    def next_bot_action(self) -> tuple[str, str, dict] | None: ...  # (sid, action, payload) 供调度器调用
```

引擎**只管规则**，不管网络。`sio.py` 调用 `public_state()` / `private_state(sid)` 后通过 `emit('state', ...)` 广播。

## 4. 玩家身份与会话

- 登录：`POST /api/login {name}` → 验白名单 → 返 `{ token, name }`，token 是签名 JWT（用一个本地 secret），有效期 8h。
- WebSocket 握手：`io(url, { auth: { token } })`，服务端 `connect` 钩子验签后绑定 `sid ↔ name`。
- **互斥**：同名再次连接时，旧 `sid` 收到 `kicked` 并被踢，新 `sid` 接管房间内位置。

## 5. Bot 调度

- Bot 不占用真实 socket，只是房间内 `Player(is_bot=True)` 记录。
- 引擎进入 Bot 回合时，`sio.py` 检测 `current_turn` 对应玩家是 Bot → `asyncio.create_task(run_bot(table_id, sid))`。
- `run_bot` 内 `await asyncio.sleep(random.uniform(1.5, 4))` 后调引擎 `handle_action`，再广播状态。
- 决策由 `bot.py` 的策略函数返回；策略函数纯函数 + 接收 `private_state`。

## 6. 数据流（一次出牌）

```
真人客户端 ──action──▶ sio.py ──▶ engine.handle_action
                                       │
                                       ├─ 更新内部状态
                                       ▼
                          engine.public_state / private_state
                                       │
sio.py ◀──────────────────────────────┘
   │  ├─ emit("state", public)            ──▶ 房间所有人
   │  └─ emit("private", private(sid))    ──▶ 单个 sid（底牌）
   ▼
   若 next_turn 是 bot → schedule run_bot → 回到 handle_action
```

## 7. 部署

v1 单进程部署：

```
nginx / caddy → uvicorn app.main:sio_app --host 0.0.0.0 --port 8000
                ↳ 静态文件挂 frontend/dist
```

启动脚本沿用 [start-all.sh](../start-all.sh)，构建脚本新增 `npm run build` + `cp -r frontend/dist backend/static`。

## 8. 不变量（写代码时随时校验）

1. **底牌从不在 `public_state` 中暴露**——单测里有专门 case。
2. **任何 emit 都跟着一次 state 同步**——避免客户端漂移。
3. **Bot 行为 ≤ 真人行为集**——Bot 只能发与真人合法相同的 action。
4. **引擎是纯状态机**——不直接调用 `sio.emit`，便于单测。
