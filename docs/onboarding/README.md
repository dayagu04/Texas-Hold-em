# 多人扑克平台 · 项目文档

本目录是产品 / 架构 / 接口的**单一事实来源**。前后端 agent 在并行开发时，所有跨职责的字段、事件名、状态机都以本目录为准；任何冲突优先以 [API-CONTRACT.md](../design/API-CONTRACT.md) 为锚点。

## 文档导航

| # | 文档 | 受众 | 用途 |
|---|------|------|------|
| 1 | [PRD.md](../design/PRD.md) | 全员 | 产品定位、用户、范围、里程碑 |
| 2 | [ARCHITECTURE.md](../design/ARCHITECTURE.md) | 全员 | 技术栈、模块边界、部署形态 |
| 3 | [GAME-RULES.md](../design/GAME-RULES.md) | 后端 / QA | 三种玩法的规则与边界用例 |
| 4 | [API-CONTRACT.md](../design/API-CONTRACT.md) | **前后端共同遵守** | REST + Socket.IO 事件契约 |
| 5 | [UI-DESIGN.md](../design/UI-DESIGN.md) | 前端 / 设计 | 视觉规范、页面与组件 |
| 6 | [AI-BOTS.md](../design/AI-BOTS.md) | 后端 | 人机插件接口与各玩法策略 |
| 7 | [HANDOFF.md](./HANDOFF.md) | 两个 agent | 每个 agent 的任务清单与验收标准 |
| 8 | [PM-HANDOFF.md](./PM-HANDOFF.md) | PM agent | PM 角色定义、工作流、文档地图 |

## 阅读路径

- **后端 agent**：PRD → ARCHITECTURE → GAME-RULES → API-CONTRACT → AI-BOTS → HANDOFF（后端段）
- **前端 agent**：PRD → ARCHITECTURE → UI-DESIGN → API-CONTRACT → HANDOFF（前端段）
- **PM / 协调者**：PM-HANDOFF → PRD → HANDOFF

## 现状基线（2026-06 实测）

仓库已从"德扑 MVP"演进为**三玩法多人平台**，以下是当前真实架构（新 agent 以此为准，不要照搬早期"待改造"描述）：

### 后端（[backend/](../../backend/)，FastAPI + python-socketio）

- 入口 [backend/app/main.py](../../backend/app/main.py)：REST API + 挂载 Socket.IO（`sio_app = socketio.ASGIApp(...)`）。启动命令用 `app.main:sio_app`，健康检查 `/api/health`。本地需 `backend/allowed_users.json`。
- **多玩法引擎已落地**：[backend/app/game/](../../backend/app/game/) 下 `texas/`、`guandan/`、`brag/` 各自 `engine.py` + `bot.py` + `evaluator.py`，公共抽象在 `engine.py`/`table.py`/`cards.py`。Bot 可插拔，难度 easy/normal。
- **Socket.IO 已模块化**：事件集中在 [backend/app/sio.py](../../backend/app/sio.py)（连接/重连、`table:*`、`lobby:*`、回合计时器、bot 循环、局结束记账）。大厅状态在 [backend/app/lobby.py](../../backend/app/lobby.py)。
- **SQLite 持久化已上线**：[backend/app/db.py](../../backend/app/db.py)，`poker.db`（WAL）。三张表：`users`（积分/头像/统计）、`hands`（每局摘要）、`hand_players`（每人一条）。只存摘要不存逐 action（回放见 #013）。
- **鉴权**：白名单登录无密码，JWT（[backend/app/auth.py](../../backend/app/auth.py)）。白名单当前读 `allowed_users.json`，#008 将迁入 SQLite + admin 接口。
- 状态形态：**单进程内存态**（房间/牌局活在内存）**+ SQLite 持久化**（积分/对局/头像跨重启保留）。

### 前端（[frontend/](../../frontend/)，React + Vite + TS + Tailwind）

- 按玩法路由进入不同牌桌组件（TexasBoard 等），复用大厅、登录、聊天、Bot 设置、个人中心。
- 公开主页 + 延迟登录（#004）：未登录可浏览，入座时再登录。
- 个人中心已实现：头像上传、积分、对局历史。
- Vite 开发代理目标后端 `8000` 端口（见 [frontend/vite.config.ts](../../frontend/vite.config.ts)）。
- 视觉风格：赌场暗金。

### 还没做（见 features/ 与 roadmap）

白名单入库+管理后台（#008）、邀请/快速匹配（#009）、摊牌看对手牌+聊天打磨（#010）、积分榜（#011）、移动端+音效（#012）、牌局回放（#013，需新增 `hand_actions` 表）。

## 命名约定

- 内部代码英文：`texas` / `guandan` / `brag`
- 玩家可见中文：德州扑克 / 掼蛋 / 炸金花
- 房间在 lobby 列表里用 `[德扑] 桌名 (3/6)` 这种前缀区分
