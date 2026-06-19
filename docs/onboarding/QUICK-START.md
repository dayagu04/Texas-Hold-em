# 快速开始指南

> 本文档提供正确的启动命令和常见问题解决方案

---

## 🚀 启动服务

### 前置要求

1. **Python 环境**: Python 3.10+
2. **Node.js 环境**: Node.js 18+
3. **虚拟环境**: 项目根目录下有 `.venv/`

### 后端启动

```bash
# 进入后端目录
cd backend

# 🔴 重要：必须用 sio_app，不是 app
../.venv/bin/uvicorn app.main:sio_app --reload --port 8000
```

**为什么是 `sio_app` 而不是 `app`？**
- Socket.IO 实例包裹在 `sio_app` 里
- 使用 `app.main:app` 会导致前端 `/socket.io` 请求 404
- 前端 WebSocket 连接失败

**验证启动成功**:
```bash
curl http://localhost:8000/api/health
# 应返回: {"status": "ok", "version": "1.0.0"}
```

### 前端启动

```bash
# 进入前端目录
cd frontend

# 启动开发服务器
npm run dev
```

**访问地址**: http://localhost:5173 (或端口被占时的 5174、5175)

---

## 🔧 首次配置

### 1. 创建白名单文件

后端需要 `backend/allowed_users.json`（该文件被 `.gitignore` 排除）：

```json
{
  "allowed_users": [
    "Alice",
    "Bob",
    "Charlie",
    "Dave"
  ]
}
```

**位置**: `/Users/gugu/Developer/GithubProject/Texas-Hold-em/backend/allowed_users.json`

**作用**: 仅列表中的用户名可登录

### 2. 安装依赖

**后端**:
```bash
../.venv/bin/pip install -r backend/requirements.txt
```

**前端**:
```bash
cd frontend && npm install
```

---

## ✅ 验证联调

### 步骤 1: 启动双端

**终端 1 - 后端**:
```bash
cd backend && ../.venv/bin/uvicorn app.main:sio_app --reload --port 8000
```

**终端 2 - 前端**:
```bash
cd frontend && npm run dev
```

### 步骤 2: 浏览器测试

1. 打开 http://localhost:5173
2. 登录（输入白名单中的用户名，如 `Alice`）
3. 选择"德州扑克" → 点"开始游戏"
4. 配置房间参数 → 添加 3 个 bot → 创建房间
5. 点"开始游戏"按钮
6. 等待一局结束，检查是否显示结算浮层

**检查点**:
- ✅ 不卡在"加载中"
- ✅ 能看到 4 个座位（1 真人 + 3 bot）
- ✅ 能看到自己的底牌
- ✅ 一局结束后显示结算浮层

### 步骤 3: 查看日志

**后端控制台应显示**:
```
[connect] <sid> (Alice)
[lobby:create_table] ...
[table:start_hand] ...
✅ [hand_end] Emitting table:hand_end for table=..., hand_id=1
```

**前端浏览器控制台**（F12 → Console）:
- 搜索 "hand_end" 应能看到收到的事件

---

## 🐛 常见问题

### 问题 1: 前端显示"加载中"不进入游戏

**原因**: 后端启动目标错误

**解决**: 
```bash
# ❌ 错误
uvicorn app.main:app --reload

# ✅ 正确
uvicorn app.main:sio_app --reload
```

### 问题 2: 登录时提示 401 "用户不在白名单"

**原因**: `backend/allowed_users.json` 缺失或格式错误

**解决**:
1. 创建 `backend/allowed_users.json`
2. 添加测试用户名（见上方"首次配置"）

### 问题 3: 前端 WebSocket 连接失败（404）

**原因**: 
- 后端用 `app` 启动而非 `sio_app`
- 或后端未启动

**解决**:
1. 检查后端进程：`lsof -ti:8000`
2. 重启后端（用 `sio_app`）

### 问题 4: 一局结束后无结算浮层

**原因**: 
- 后端未 emit `table:hand_end` 事件
- 或引擎 `is_hand_over()` 返回 `False`

**排查**:
1. 查看后端控制台是否有 `[hand_end]` 日志
2. 如果无日志，检查是否在正确的分支（应包含契约修复）

### 问题 5: 测试通过 22 条

**验证后端代码正确性**:
```bash
cd /Users/gugu/Developer/GithubProject/Texas-Hold-em
.venv/bin/python -m pytest backend/tests/ -q
```

**预期结果**: `22 passed`

---

## 📁 项目结构

```
Texas-Hold-em/
├── backend/
│   ├── app/
│   │   ├── main.py         # 🔴 启动目标: sio_app
│   │   ├── sio.py          # Socket.IO 事件
│   │   ├── game/           # 三个引擎
│   │   └── ...
│   ├── allowed_users.json  # 🔴 需手动创建（被 .gitignore）
│   └── requirements.txt
├── frontend/
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── docs/
│   ├── design/             # 产品设计文档
│   ├── features/           # 功能需求
│   └── onboarding/         # 入职指南
└── .venv/                  # Python 虚拟环境
```

---

## 🔗 相关文档

- [docs/onboarding/README.md](../onboarding/README.md) - 项目概览
- [docs/design/ARCHITECTURE.md](../design/ARCHITECTURE.md) - 技术架构
- [docs/design/API-CONTRACT.md](../design/API-CONTRACT.md) - 前后端契约
- [docs/internal/backend-contract-ROOT-CAUSE.md](./backend-contract-ROOT-CAUSE.md) - 联调问题根因

---

**更新日期**: 2026-06-19  
**下次更新**: 补充生产部署指南
