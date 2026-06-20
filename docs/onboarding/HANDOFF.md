# 任务交接（HANDOFF）

> ⚠️ **本文档的历史任务清单已归档。** 早期多玩法构建（M0~M5）和 M3.5 联调修正（冒号事件契约、`table:hand_end` 等）记录的阻断项**均已解决并合入 main**。原始逐条清单已删除，避免误导新 agent 以为契约还没修。

## 当前事实来源

交接所需的"真相"现在分散在这几处，按需查阅：

| 你想知道 | 看哪里 |
|---------|--------|
| 接口/事件契约 | [API-CONTRACT.md](../design/API-CONTRACT.md)（§1.5~§1.8 含白名单 admin / 积分榜 / 回放） |
| 项目当前架构 | [README.md](./README.md) 现状基线 |
| 本地起服务 | [QUICK-START.md](./QUICK-START.md) |
| 部署 | [DEPLOYMENT.md](./DEPLOYMENT.md) |
| 当前排期与已交付 | `docs/internal/roadmap-2026Q3.md`（本地不入库） |
| 工程 agent 任务 | `docs/internal/agent-prompts/{backend,frontend,pm}-agent.md`（本地不入库） |
| 待实现需求 | [docs/features/](../features/)（按编号，当前最大 #015） |

## 协作约定（仍然有效）

- **契约优先**：发现契约不够用，先改 [API-CONTRACT.md](../design/API-CONTRACT.md)，再 ping 另一端，最后写代码。PM 是契约的唯一改动者，工程 agent 按契约实现、不擅自改契约。
- **不互相直接 import**：前端只通过 [api.ts](../../frontend/src/api.ts) / [socket.ts](../../frontend/src/socket.ts)；后端事件在 `backend/app/sio/` 包暴露。
- **集合冒烟**：每批需求结束跑一次端到端冒烟——前端连真后端，完成一局任意玩法（含 bot）。
- **commit 不 push**：工程 agent 完成后 commit、等 PM 验收，由 PM 决定 push 时机。

## 历史里程碑（已全部交付）

- **M0~M5（多玩法构建）**：德扑 MVP → GameEngine 抽象 + 大厅多玩法 → 炸金花 → 掼蛋 → 重连/超时 → Bot 调优/部署。全部完成。
- **#008~#014（产品力批次）**：白名单入库+admin、邀请/快速匹配、摊牌+聊天、积分榜、移动端+音效、牌局回放、UI 打磨。全部已 push origin/main。
- **#015**：牌桌 UI 真实化重构，规划中。
