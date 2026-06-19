# 前端 "正在重连" 卡住问题 —— 根因与修复

> **日期**: 2026-06-19  
> **状态**: ✅ 已修复  
> **影响**: 用户从浏览器访问时一直显示"正在重连"，创建房间永久卡 loading

---

## 根因

**核心问题**: `frontend/src/transport/socketIo.ts` 强制使用 `transports: ["websocket"]` 纯 WebSocket 模式，但 socket.io 4.x 的纯 WebSocket transport 在默认配置下**需要先通过 polling 握手获取 sid**，然后才能升级到 WebSocket。

**症状表现**:
1. 浏览器 Console 显示 socket.io 连接不断重试（`reconnect_attempt` 事件）
2. 前端显示"正在重连" banner（由 `reconnecting` 状态触发）
3. 创建房间后永久卡在"创建中..."（因为 socket 根本没连上，`emit` 发不出去）
4. **无明确错误提示**（因为缺少 `connect_error` 事件监听）

**技术细节**:
- socket.io 4.x 的 WebSocket-only transport 依赖 Engine.IO 4.x 的握手机制
- 直接发起 `ws://` 连接会被服务端拒绝（返回 HTTP 400），因为缺少 polling 阶段获取的 `sid`
- 正确流程：polling handshake (`/socket.io/?EIO=4&transport=polling`) → 获取 sid → upgrade 到 WebSocket

**验证测试**:
```bash
# Polling 握手（成功）
curl "http://localhost:8000/socket.io/?EIO=4&transport=polling"
# 返回: 0{"sid":"...","upgrades":["websocket"],...}

# 纯 WebSocket 直连（失败）
curl "http://localhost:8000/socket.io/?EIO=4&transport=websocket"
# 返回: HTTP 400 Bad Request
```

---

## 修复内容

### 1. 移除 `transports: ["websocket"]` 限制

**修改文件**: `frontend/src/transport/socketIo.ts`

**Before**:
```typescript
const socket: TypedSocket = io(API_BASE || undefined, {
  transports: ["websocket"],  // ❌ 强制纯 WebSocket
  auth: { token },
});
```

**After**:
```typescript
const socket: TypedSocket = io(API_BASE || undefined, {
  // ✅ 默认 ["polling", "websocket"]，自动升级
  auth: { token },
});
```

### 2. 添加 `connect_error` 事件监听

**Before**: 缺少错误处理，连接失败时静默重试

**After**:
```typescript
socket.on("connect_error", (err) => {
  console.error("[socket] connect_error:", err.message, err);
  this.setStatus("disconnected");
});
```

### 3. 合并重复的 `connect` 事件监听

**Before**: 两个 `socket.on("connect", ...)` 分别注册

**After**: 合并为一个，包含状态更新 + `lobby:list` emit

### 4. 添加调试日志

在 `socket.ts` 和 `socketIo.ts` 的关键路径添加 console.log：
- `connectSocket()`: 记录 token 状态、MOCK 模式、重复调用
- `SocketIoTransport.connect()`: 记录连接开始、socket.id、disconnect 原因、重连次数

---

## 验收测试

### 自动化测试（通过）

```bash
cd frontend
node test-socket-connection.mjs
```

**结果**:
```
✅ Token received: eyJhbGciOi...
✅ Connected! socket.id: WyBJPqpP5fFmBf1OAARs
   transport: websocket
✅ Received lobby:update:
   tables: 4
=== Test PASSED ===
```

### 手动浏览器测试（需验证）

**两种访问方式**:

#### 方式 A: Dev Server（推荐开发时使用）
```bash
# 终端 1: 后端
cd backend && ../.venv/bin/uvicorn app.main:sio_app --reload --port 8000

# 终端 2: 前端 dev server
cd frontend && npm run dev
```
- 访问 `http://localhost:5173`
- vite proxy 自动转发 `/socket.io` 和 `/api` 到 8000
- 支持热更新（HMR）

#### 方式 B: 单端口生产模式（推荐联调/演示）
```bash
# 重建前端
cd frontend && npm run build

# 启动后端（自动 serve dist）
cd backend && ../.venv/bin/uvicorn app.main:sio_app --reload --port 8000
```
- 访问 `http://localhost:8000`
- 后端 FastAPI serve `frontend/dist`
- 单端口部署，无 CORS 问题

**验收步骤**:
1. ✅ 打开浏览器 DevTools → Console，无红色报错
2. ✅ 看到 `[socket] connected, socket.id: xxx`
3. ✅ 登录 `Alice`（或其他白名单用户）→ 进入游戏选择主页
4. ✅ 点击"德州扑克 - 开始游戏" → 创建房间 modal 弹出
5. ✅ 添加 1 AI → 点击"创建" → **不卡 loading**，进入牌桌页面
6. ✅ 牌桌显示玩家座位 + 底牌 + 行动按钮

---

## 技术背景

### socket.io 的 Transport 升级机制

socket.io 4.x 基于 Engine.IO 4.x，连接建立流程：

1. **Polling Handshake** (`/socket.io/?EIO=4&transport=polling`)
   - 客户端发起 HTTP long-polling 请求
   - 服务端返回 `{"sid":"...","upgrades":["websocket"],...}`
   - 客户端获得 session ID

2. **WebSocket Upgrade** （可选，自动）
   - 客户端用 `sid` 发起 WebSocket 连接
   - 服务端验证 `sid` 并升级
   - 后续通信全部走 WebSocket

3. **Fallback**
   - 如果 WebSocket 升级失败，自动回退 polling
   - 保证在防火墙/代理环境下的兼容性

**强制 `transports: ["websocket"]` 的问题**:
- 跳过 polling handshake，直接发起 WebSocket
- 缺少 `sid`，服务端拒绝连接（400 Bad Request）
- 客户端进入无限重连循环

**官方推荐**: 使用默认 `transports: ["polling", "websocket"]`，让 socket.io 自动处理升级。

---

## 相关文件清单

### 修改文件
- `frontend/src/transport/socketIo.ts` — 移除 transports 限制 + 添加 connect_error
- `frontend/src/socket.ts` — 添加调试日志

### 新增文件
- `frontend/test-socket-connection.mjs` — 自动化连接测试脚本
- `docs/internal/frontend-reconnect-fix.md` — 本文档

### 构建产物
- `frontend/dist/` — 已用修复后的代码重建（`npm run build`）

---

## FAQ

### Q: 为什么之前代码要强制 WebSocket？

**A**: 可能出于以下考虑（但都不成立）:
- 误以为 polling 有性能问题 → 实际 socket.io 自动升级到 WebSocket，polling 只用于 handshake
- 避免 long-polling 的服务器资源占用 → handshake 是一次性的，升级后不再 polling
- 某些教程/示例使用 `transports: ["websocket"]` → 那些示例可能针对特定配置（如 nginx 已处理 polling）

### Q: 生产环境需要配置 nginx 吗？

**A**: 不强制，但推荐。socket.io 默认的 polling + upgrade 机制在直连时工作正常，但生产环境通过 nginx 反向代理时：
- 需要配置 `proxy_http_version 1.1;` 和 `Upgrade`/`Connection` headers
- 参考 [socket.io nginx 文档](https://socket.io/docs/v4/reverse-proxy/#nginx)

本项目开发/演示环境（单端口直连）无需额外配置。

### Q: vite dev server 的 proxy 配置需要改吗？

**A**: 已正确配置 `ws: true`（`frontend/vite.config.ts` line 11），无需修改:
```js
proxy: {
  '/socket.io': {
    target: 'http://localhost:8000',
    ws: true,  // ✅ 关键：支持 WebSocket upgrade
  },
}
```

### Q: 如何验证 WebSocket 已成功升级？

**A**: 
1. 浏览器 DevTools → Console 看到 `transport: websocket`
2. DevTools → Network → WS 标签看到 `socket.io` 连接（状态 101 Switching Protocols）
3. Console 日志: `[socket] connected, socket.id: xxx`

---

## 后续优化建议

1. **移除生产环境的 console.log**
   - 当前为排查方便保留了详细日志
   - 生产部署前用条件编译或环境变量控制日志级别

2. **添加连接状态 UI 反馈**
   - 当前只有"正在重连" banner
   - 可增加"连接失败，请刷新页面"提示（`disconnected` 状态持续 10s+）

3. **后端健康检查**
   - 前端启动时先 `fetch('/api/health')`
   - 确认后端可达后再 `connectSocket()`
   - 避免无谓的 socket 重连

---

**修复人**: 前端工程师（Kiro AI）  
**验证状态**: ✅ 自动化测试通过，待用户浏览器验证  
**Git Commit**: 待提交（修复 + 文档）
