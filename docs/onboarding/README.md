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

## 阅读路径

- **后端 agent**：PRD → ARCHITECTURE → GAME-RULES → API-CONTRACT → AI-BOTS → HANDOFF（后端段）
- **前端 agent**：PRD → ARCHITECTURE → UI-DESIGN → API-CONTRACT → HANDOFF（前端段）
- **PM / 协调者**：PRD → HANDOFF

## 现状基线

仓库已有德州扑克 MVP（[backend/](../backend/) + [frontend/](../frontend/)）。本次设计**在保留其架构的基础上扩展**，不推倒重来。需要的关键改造：
1. 后端引入 `GameEngine` 抽象，把 Texas / Guandan / Brag 作为三个引擎实现。
2. Socket.IO 事件按"通用 + 玩法专属"分层。
3. 前端按游戏类型路由进入不同牌桌组件，但复用大厅、登录、聊天、Bot 设置面板。
4. Bot 升级为可插拔策略，每种玩法独立实现，难度可选。

## 命名约定

- 内部代码英文：`texas` / `guandan` / `brag`
- 玩家可见中文：德州扑克 / 掼蛋 / 炸金花
- 房间在 lobby 列表里用 `[德扑] 桌名 (3/6)` 这种前缀区分
