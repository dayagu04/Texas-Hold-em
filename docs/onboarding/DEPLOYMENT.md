# 部署文档

> **版本**: v1.0  
> **日期**: 2026-06-19  
> **适用**: 本地开发 + Docker 生产部署

---

## 目录

1. [本地开发启动](#本地开发启动)
2. [生产构建](#生产构建)
3. [Docker 部署](#docker-部署)
4. [环境变量说明](#环境变量说明)
5. [白名单配置](#白名单配置)
6. [故障排查](#故障排查)

---

## 本地开发启动

### 前置条件

- Python 3.12+
- Node.js 20+
- 已创建虚拟环境并安装依赖

### 步骤

**1. 配置白名单**（首次运行需要）

```bash
# 复制模板文件
cp backend/allowed_users.example.json backend/allowed_users.json

# 编辑白名单，添加你的用户名
# backend/allowed_users.json
{
  "allowed_users": ["YourName", "Alice", "Bob"]
}
```

**2. 构建前端**

```bash
cd frontend
npm install
npm run build
cd ..
```

**3. 启动后端**（会自动挂载前端 dist）

```bash
# 激活虚拟环境
source .venv/bin/activate

# 启动服务（推荐方式：使用 sio_app）
uvicorn backend.app.main:sio_app --host 0.0.0.0 --port 8000

# 或使用项目根目录的启动脚本
./start-backend.sh
```

**4. 访问应用**

- 前端：http://localhost:8000
- API 健康检查：http://localhost:8000/api/health
- Socket.IO：ws://localhost:8000/socket.io

---

## 生产构建

### 前端构建优化

```bash
cd frontend

# 安装依赖（生产模式）
npm ci --production=false

# 构建（自动 minify + tree-shake）
npm run build

# 构建产物在 frontend/dist/
# - index.html
# - assets/index-[hash].js
# - assets/index-[hash].css
# - favicon.svg
# - icons.svg
```

### 后端配置检查

```bash
# 确保前端已构建
ls -l frontend/dist/index.html

# 测试后端能否正确挂载前端
uvicorn backend.app.main:sio_app --host 0.0.0.0 --port 8000

# 访问 http://localhost:8000 应该能看到前端页面
# 访问 http://localhost:8000/api/health 应该返回 {"status":"ok","version":"1.0.0"}
```

---

## Docker 部署

### 前置条件

- Docker 20.10+
- Docker Compose 2.0+

### 一键启动

**1. 配置白名单**

```bash
# 首次部署需创建白名单文件
cp backend/allowed_users.example.json backend/allowed_users.json

# 编辑白名单
vim backend/allowed_users.json
```

**2. 设置环境变量（可选）**

```bash
# 创建 .env 文件（项目根目录）
echo "JWT_SECRET=your-secret-key-here" > .env

# 或直接在 shell 中导出
export JWT_SECRET=your-secret-key-here
```

**3. 启动容器**

```bash
# 构建并启动（首次运行）
docker-compose up --build -d

# 后续启动
docker-compose up -d

# 查看日志
docker-compose logs -f poker

# 停止服务
docker-compose down
```

**4. 验证部署**

```bash
# 检查容器状态
docker-compose ps

# 测试前端（应返回 HTML）
curl -s http://localhost:8000/ | head -5

# 测试 API（应返回 {"status":"ok",...}）
curl -s http://localhost:8000/api/health

# 测试 Socket.IO（应看到连接信息）
curl -s http://localhost:8000/socket.io/
```

### Dockerfile 说明

项目使用**多阶段构建**：

- **阶段 1（frontend-builder）**: Node.js 环境构建前端 dist
- **阶段 2（最终镜像）**: Python 环境 + 后端代码 + 前端 dist

**优势**:
- 最终镜像不含 Node.js（减少体积）
- 前端构建产物直接打包进镜像
- 无需宿主机预先构建前端

---

## 环境变量说明

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `JWT_SECRET` | `change-me-in-production` | JWT 签名密钥（**生产环境必须修改**） |

### 设置方式

**Docker Compose**:
```bash
# 方式 1: .env 文件（推荐）
echo "JWT_SECRET=your-secret" > .env
docker-compose up -d

# 方式 2: 命令行
JWT_SECRET=your-secret docker-compose up -d
```

**直接运行后端**:
```bash
# 方式 1: shell 环境变量
export JWT_SECRET=your-secret
uvicorn backend.app.main:sio_app --host 0.0.0.0 --port 8000

# 方式 2: 内联
JWT_SECRET=your-secret uvicorn backend.app.main:sio_app --host 0.0.0.0 --port 8000
```

---

## 白名单配置

### 文件位置

- **开发**: `backend/allowed_users.json`
- **Docker**: 通过 volume 挂载（见 docker-compose.yml）

### 格式

```json
{
  "allowed_users": ["Alice", "Bob", "Charlie", "Dave"]
}
```

### 规则（#008 后已改为 SQLite + admin 管理）

- 用户名大小写敏感（"Alice" ≠ "alice"）
- `allowed_users.json` 现在**只是首次启动的迁移种子**：服务首次启动时把其中用户导入 SQLite（`users.allowed=1`），**列表第一个用户设为管理员**（`is_admin=1`）。之后白名单的真相在数据库，不再读 JSON。
- 日常增删白名单走**管理后台**：admin 用户登录后在「白名单管理」页在线添加/移除，或调 `POST/DELETE /api/admin/whitelist`（见 API-CONTRACT §1.5）。**无需改文件、无需重启**。
- 迁移幂等：重启不会用 JSON 覆盖数据库里的手动改动。

### 添加新用户

```bash
# 推荐：admin 登录 → 白名单管理页在线添加（即时生效，无需重启）

# 仅首次部署播种：编辑迁移种子文件
vim backend/allowed_users.json   # 仅在数据库为空时生效
```

---

## 故障排查

### 问题 1: `frontend/dist` 不存在

**症状**: 启动后访问 `localhost:8000` 看不到前端

**解决**:
```bash
cd frontend
npm install
npm run build
```

### 问题 2: `/api/*` 返回 HTML（SPA fallback 误覆盖）

**症状**: `curl http://localhost:8000/api/health` 返回 index.html

**原因**: main.py 中 SPA fallback 路由注册顺序错误

**解决**: 确保 catch-all 路由在所有 API 路由之后注册（已在 `backend/app/main.py` 底部）

### 问题 3: Socket.IO 连接失败

**症状**: 浏览器控制台报 `WebSocket connection failed`

**检查**:
```bash
# 测试 Socket.IO 端点（应返回协议版本信息）
curl http://localhost:8000/socket.io/

# 确保 catch-all 路由不覆盖 /socket.io
# main.py 中已排除：if full_path.startswith("socket.io")
```

### 问题 4: Docker 构建慢

**优化**:
```bash
# 创建 .dockerignore（项目根目录）
cat > .dockerignore <<EOF
.git
.venv
.vscode
.pytest_cache
**/__pycache__
**/node_modules
frontend/dist
backend/allowed_users.json
EOF

# 利用 Docker 层缓存（修改代码时只重建后面的层）
docker-compose build --no-cache  # 强制完整重建（仅首次或依赖变更时）
docker-compose build              # 利用缓存（快速重建）
```

### 问题 5: 401 未授权

**症状**: 登录失败，返回 `NOT_ALLOWED`

**检查**:
```bash
# 确认白名单文件存在
ls -l backend/allowed_users.json

# 查看白名单内容
cat backend/allowed_users.json

# 确认用户名拼写正确（大小写敏感）
```

### 问题 6: Docker 容器启动后立即退出

**诊断**:
```bash
# 查看容器日志
docker-compose logs poker

# 常见原因：
# - backend/allowed_users.json 不存在（创建后重启）
# - 端口 8000 被占用（修改 docker-compose.yml 端口映射）
# - Python 依赖缺失（检查 requirements.txt）
```

---

## 生产部署清单

部署到生产环境前请确认：

- [ ] 修改 `JWT_SECRET` 为强随机字符串
- [ ] 配置 `backend/allowed_users.json`（生产用户名单）
- [ ] 前端已构建（`frontend/dist` 存在）
- [ ] 测试所有三种玩法能正常游戏
- [ ] 测试 4 真人联机对局
- [ ] 配置反向代理（Nginx/Caddy）启用 HTTPS
- [ ] 配置防火墙（仅开放 80/443）
- [ ] 设置日志收集（`docker-compose logs` 或挂载 volume）
- [ ] 备份策略（白名单文件）

---

## 参考文档

- [快速开始](./QUICK-START.md) - 首次运行指南
- [M5 部署任务](../features/003-m5-tuning-deploy.md) - 任务 C 规范
- [PRD](../design/PRD.md) - 项目需求文档
- [API 文档](http://localhost:8000/docs) - FastAPI 自动生成（开发模式）

---

**PM 签发**: 2026-06-19  
**维护者**: 后端团队
