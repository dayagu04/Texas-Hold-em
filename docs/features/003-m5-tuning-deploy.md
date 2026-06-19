# M5 里程碑 - 调优、联调与部署

> **版本**: v1.0  
> **日期**: 2026-06-19  
> **负责**: 全员（后端 + 前端 + QA）  
> **前置**: M1-M4 已完成

---

## 1. 目标

**M5 定位**（PRD §6）:
> Bot 难度调优 + 端到端联调 + 部署文档

**核心交付**:
- 任务 A: Bot 难度测试与调优（后端）
- 任务 B: 端到端联调（全员）
- 任务 C: 部署集成与文档（后端）

**完成标志**: PRD 共同验收（HANDOFF §共同验收）全部通过

---

## 任务 A — Bot 难度调优与测试

### A.1 现状

三玩法均有 easy/normal 策略实现：
- `backend/app/game/texas/bot.py` - `_easy_strategy`, `_normal_strategy`
- `backend/app/game/brag/bot.py` - 同上
- `backend/app/game/guandan/bot.py` - 同上

**缺口**: 无 `test_bots.py`，难度未压测验证。

### A.2 任务

#### 1. 编写 Bot 单元测试

**文件**: `backend/tests/test_bots.py`

**覆盖要求**:
- 每个 bot（6 个：3 玩法 × 2 难度）≥ 3 条用例
- 验证 bot 返回的 action 在 `legal_actions` 范围内
- 验证 easy vs normal 行为差异

**示例**:
```python
import pytest
from backend.app.game.texas.bot import decide as texas_decide

def test_texas_easy_bot_returns_legal_action():
    """easy bot 返回的动作必须合法"""
    public_state = {...}
    private_state = {"legal_actions": [{"action": "fold"}, {"action": "call"}]}
    action, payload = texas_decide(player_easy, public_state, private_state)
    assert action in ["fold", "call"]

def test_texas_normal_more_aggressive_than_easy():
    """强牌时 normal 比 easy 更倾向加注"""
    strong_hand_state = {...}
    # normal 在强牌时应更多 raise
    # 多次采样统计 raise 频率
```

#### 2. 压力测试（脚本）

**文件**: `backend/tests/stress_test_bots.py`

**场景**:
- 4 bot 跑完整一局德扑（不崩溃，不卡顿）
- 4 bot 跑完整一局炸金花
- 4 bot 跑完整一局掼蛋

**验收**: 每场景连续跑 10 局无异常

#### 3. 难度调优（如测试暴露问题）

- easy bot：行为简单（高概率 call/check，少 raise）
- normal bot：考虑牌力、位置、底池赔率

### A.3 验收标准

- [ ] `pytest backend/tests/test_bots.py` 全绿
- [ ] 6 个 bot 各 ≥ 3 条用例
- [ ] 4 bot 跑完三玩法各 10 局无崩溃
- [ ] easy vs normal 行为有可观测差异

---

## 任务 B — 端到端联调

### B.1 现状

- 脚本验证过德扑单局（弃牌 + 摊牌路径）
- 缺：4 真人完整对局、三玩法全覆盖、浏览器实测

### B.2 任务

#### 1. 三玩法浏览器实测

**德州扑克**:
- 1 真人 + 3 bot
- 完整一局：发牌 → 下注 → 翻牌 → 摊牌 → 结算
- ✅ 动效正常、结算正确

**炸金花**:
- 1 真人 + 3 bot
- ✅ bot 不卡顿，看牌/比牌流程正常

**掼蛋**:
- 4 真人（或 1 真人 + 3 bot）
- ✅ 出牌/过牌、结算正确

#### 2. 多人联调（PRD 共同验收）

- 4 真人从 4 个浏览器登录
- 玩一局掼蛋打完结算
- ✅ 状态同步无延迟（< 200ms）
- ✅ 无人看到他人底牌

#### 3. 切换无串味

- 同一会话切换三种 board
- ✅ 样式无残留、无错乱

#### 4. 抽象验证（PRD 共同验收）

- 注册一个未知玩法类型
- ✅ 后端在 `create_table` 阶段即拒绝（抛 `ValueError`），错误尽早暴露

### B.3 验收标准

- [ ] 三玩法各完成一局完整对局
- [ ] 4 真人掼蛋对局打完结算
- [ ] 1 真人 + 3 bot 炸金花 bot 不卡顿
- [ ] 三 board 切换无样式串味
- [ ] 无控制台错误
- [ ] 状态同步 < 200ms

---

## 任务 C — 部署集成与文档

### C.1 现状

**关键问题**: `backend/app/main.py` 虽 import 了 `StaticFiles`，但**未实际挂载**前端 `dist/`。生产部署时前端无法通过后端访问。

**缺口**:
- 前端 dist 未挂载
- 无 Dockerfile / docker-compose.yml
- `allowed_users.json` 无模板（被 gitignore）

### C.2 任务

#### 1. 挂载前端静态目录

**文件**: `backend/app/main.py`

```python
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

# 前端构建产物目录
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "../../frontend/dist")

# 挂载静态资源
if os.path.exists(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=f"{FRONTEND_DIST}/assets"), name="assets")
    
    # SPA fallback：所有未匹配路由返回 index.html
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # API 路由不走这里
        if full_path.startswith("api/") or full_path.startswith("socket.io"):
            return {"error": "not found"}
        index_path = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return {"error": "frontend not built"}
```

**注意**: SPA fallback 必须在所有 API 路由**之后**注册，避免覆盖 `/api/*`。

#### 2. 编写 Dockerfile

**文件**: `backend/Dockerfile`

```dockerfile
# 多阶段构建：先构建前端，再打包后端

# 阶段 1: 构建前端
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 阶段 2: 后端 + 前端产物
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

EXPOSE 8000
CMD ["uvicorn", "backend.app.main:sio_app", "--host", "0.0.0.0", "--port", "8000"]
```

#### 3. 编写 docker-compose.yml

**文件**: `docker-compose.yml`（项目根目录）

```yaml
version: "3.8"
services:
  poker:
    build:
      context: .
      dockerfile: backend/Dockerfile
    ports:
      - "8000:8000"
    volumes:
      - ./backend/allowed_users.json:/app/backend/allowed_users.json:ro
    environment:
      - JWT_SECRET=${JWT_SECRET:-change-me-in-production}
    restart: unless-stopped
```

#### 4. 创建白名单模板

**文件**: `backend/allowed_users.example.json`（提交 Git）

```json
{
  "allowed_users": ["Alice", "Bob", "Charlie", "Dave"]
}
```

#### 5. 部署文档

**文件**: `docs/onboarding/DEPLOYMENT.md`

包含：
- 本地开发启动（uvicorn sio_app）
- 生产构建（npm run build + 挂载）
- Docker 部署（docker-compose up）
- 环境变量说明（JWT_SECRET）
- 白名单配置

### C.3 验收标准

- [ ] `npm run build` 后访问 `localhost:8000` 能看到前端
- [ ] `/api/health` 和 `/socket.io` 不被 SPA fallback 覆盖
- [ ] `docker-compose up` 一键启动
- [ ] 容器内前端可访问，Socket.IO 连接正常
- [ ] `allowed_users.example.json` 已提交
- [ ] 部署文档完整

---

## 共同验收（M5 末端）

参考 [HANDOFF.md §共同验收](../onboarding/HANDOFF.md)

- [ ] 端到端：4 真人玩家分别从 4 浏览器登录，玩一局掼蛋打完结算
- [ ] 混合：1 真人 + 3 bot 玩炸金花，bot 不卡顿
- [ ] 抽象：未知玩法在 `create_table` 即被拒绝（抛 `ValueError`）
- [ ] 文档：每个 agent 在代码内补 README 段落，指回 docs/

---

## 并行推进建议

| 任务 | 负责 | 依赖 | 预计工时 |
|------|------|------|----------|
| A Bot 测试 | 后端 | 无 | 3-4h |
| B 端到端联调 | 全员 | C 完成（需 dist 挂载方便测试） | 2-3h |
| C 部署集成 | 后端 | 无 | 3-4h |

**推荐顺序**:
1. A 和 C 并行（都是后端，但互不冲突）
2. C 完成后做 B（联调依赖可访问的部署）

---

## 风险与对策

| 风险 | 对策 |
|------|------|
| SPA fallback 覆盖 API 路由 | fallback 路由最后注册，显式排除 `/api/*` 和 `/socket.io` |
| Docker 构建前端慢 | 多阶段构建 + `.dockerignore` 排除 node_modules |
| 4 真人联调难协调 | 用 4 个浏览器无痕窗口模拟，或脚本化 Socket.IO 客户端 |
| Bot 难度差异不明显 | 多次采样统计行为频率，量化验证 |

---

## 参考文档

- [docs/design/AI-BOTS.md](../design/AI-BOTS.md) - Bot 策略设计
- [docs/design/PRD.md](../design/PRD.md) - 里程碑（§6）
- [docs/onboarding/HANDOFF.md](../onboarding/HANDOFF.md) - 共同验收
- [docs/onboarding/QUICK-START.md](../onboarding/QUICK-START.md) - 启动指南

---

**PM 签发**: 2026-06-19  
**预计总工时**: 8-11h（并行约 5-6h）
