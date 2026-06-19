# 功能需求 #004 - 公开主页与延迟登录

> **提出日期**: 2026-06-19  
> **提出人**: 用户  
> **优先级**: P0（修复"正在重连"卡死 + 重构登录流程）  
> **状态**: 待开发

---

## 1. 需求背景

### 当前问题
1. **主页强制登录**：`/`（GameSelection）被 `RequireAuth` 包裹，未登录直接踢到 `/login`。
2. **主页就触发连接**：`ReconnectBanner` 全局挂载，进主页即尝试 socket 连接，未连上就显示"正在重连"，且创建房间卡死。
3. **登录门槛过早**：用户还没决定玩什么就被拦在登录页。

### 用户期望（新交互流程）
1. **主页公开、不连接 socket**：任何人能直接看到三个游戏卡片和玩法介绍，不显示"正在重连"。
2. **延迟登录**：点游戏卡片的"开始游戏"才弹登录框（只输用户名）。
3. **登录后进统一大厅**：能看到所有玩法的房间列表、加入、创建。
4. **游戏界面显示头像+用户名**。
5. **主页右上角有登录区**：未登录显示"登录"按钮；已登录显示头像+用户名+退出。

---

## 2. 核心架构调整

### 2.1 路由权限重构

**当前**（全局强制登录）:
```tsx
<Route path="/" element={<RequireAuth><GameSelection /></RequireAuth>} />
```

**目标**（主页公开）:
```tsx
<Route path="/" element={<GameSelection />} />              {/* 公开，无需登录 */}
<Route path="/lobby" element={<RequireAuth><Lobby /></RequireAuth>} />
<Route path="/table/:id" element={<RequireAuth><TablePage /></RequireAuth>} />
```

**关键**: `/`（主页）移出 `RequireAuth`。只有 `/lobby` 和 `/table/:id` 需要登录。

### 2.2 ReconnectBanner 不在主页挂载

**当前**: `ReconnectBanner` 在 `App` 顶层全局挂载，主页就显示"正在重连"。

**目标**: 只在需要 socket 连接的页面（`/lobby`, `/table/:id`）挂载 ReconnectBanner。主页不挂载、不连接。

**实现方向**（二选一，开发者定）:
- 方案 A: ReconnectBanner 内部判断当前路由，主页路径直接返回 null。
- 方案 B: 把 ReconnectBanner 从 App 顶层移到 Lobby/TablePage 内部挂载。

**推荐方案 B**（职责更清晰，主页彻底不碰 socket）。

### 2.3 Socket 连接时机

**当前**: 可能在主页或全局就调 `connectSocket()`。

**目标**: 只在进入 `/lobby` 或 `/table/:id` 后才 `connectSocket()`。主页不连接。

---

## 3. 交互流程

### 3.1 未登录用户

```
打开主页 /
  ↓
看到三个游戏卡片（德州/掼蛋/炸金花）+ 玩法介绍
右上角显示 [登录] 按钮
（无"正在重连"，无 socket 连接）
  ↓
点任意卡片"开始游戏"
  ↓
弹出登录框（modal，只输用户名）
  ↓
登录成功 → 存 token → connectSocket() → 跳 /lobby
```

### 3.2 已登录用户

```
打开主页 /
  ↓
右上角显示 [头像 + 用户名 + 退出]
  ↓
点"开始游戏" → 直接跳 /lobby（已有 token，无需再登录）
或点右上角"退出" → 清 token → 回到未登录态
```

### 3.3 登录框（Modal）

- 触发：点"开始游戏"且未登录时
- 字段：仅用户名（白名单校验）
- 提交：POST /api/login → 存 token → 关闭 modal → connectSocket() → 跳 /lobby
- 失败：用户名不在白名单，显示错误文案
- 也可由主页右上角"登录"按钮触发同一个 modal

---

## 4. 页面改动清单

### 4.1 App.tsx
- `/` 移出 `RequireAuth`（公开）
- `ReconnectBanner` 从顶层移除（移到 Lobby/TablePage 内）

### 4.2 GameSelection.tsx（主页）
- 不调用 `connectSocket()`，不订阅 socket 事件
- 右上角登录区：
  - 未登录：`[登录]` 按钮 → 打开 LoginModal
  - 已登录：头像（首字母圆形）+ 用户名 + `[退出]`
- "开始游戏"按钮逻辑：
  - 已登录 → `navigate("/lobby")`
  - 未登录 → 打开 LoginModal

### 4.3 新建 LoginModal.tsx
- 从现有 Login.tsx 抽取登录逻辑为 modal 形式
- 只输用户名 → POST /api/login → 存 token → connectSocket() → 跳 /lobby
- 复用现有 api.ts 的 login() 和 setToken()

### 4.4 Lobby.tsx
- 进入时 `connectSocket()`（如果还没连）
- 挂载 ReconnectBanner（方案 B）
- 用户名+退出已有（L24, L74-79），保留
- 统一大厅：列出所有玩法房间，玩法 tag 区分（已有）

### 4.5 TablePage.tsx
- 挂载 ReconnectBanner（方案 B）
- 座位卡头像+用户名已有（SeatCard.tsx L25-50），保留

### 4.6 Login.tsx（独立页，保留兼容）
- 保留 `/login` 路由作为 fallback（直接访问受保护页未登录时跳转用）
- 或改为复用 LoginModal 的逻辑

---

## 5. 验收标准

### 5.1 主页（公开）
- [ ] 未登录直接访问 `/` 能看到游戏卡片，不被踢到登录页
- [ ] 主页**不显示"正在重连"**横幅
- [ ] 主页不发起 socket 连接（DevTools Network → WS 为空）
- [ ] 右上角未登录显示"登录"按钮

### 5.2 延迟登录
- [ ] 未登录点"开始游戏" → 弹登录框
- [ ] 登录框只需输用户名
- [ ] 登录成功 → 跳 /lobby，能看到房间列表
- [ ] 登录失败（非白名单）→ 显示错误文案

### 5.3 已登录态
- [ ] 主页右上角显示头像+用户名+退出
- [ ] 已登录点"开始游戏" → 直接进 /lobby（不再弹登录）
- [ ] 点"退出" → 回到未登录态，右上角变回"登录"按钮

### 5.4 游戏界面
- [ ] 大厅显示当前用户名
- [ ] 牌桌座位卡显示头像（首字母圆形）+ 用户名
- [ ] 创建德州扑克 + 1 AI → 不卡，进入牌桌正常游戏

### 5.5 连接稳定性
- [ ] 进入大厅后 socket 正常连接（DevTools Console: [socket] connected）
- [ ] 创建/加入房间不卡 loading

---

## 6. 技术注意

- **token 持久化**：已用 localStorage（api.ts），刷新主页应保持已登录态
- **connectSocket 幂等**：socket.ts 已有 `connected` 标志防重复连接
- **路由守卫**：直接访问 `/lobby` 未登录时仍应跳 `/login` 或弹 modal
- **不破坏现有**：SeatCard 头像、Lobby 用户名、api.login 都已存在，复用而非重写

---

## 7. 参考文档

- [docs/features/001-game-selection.md](./001-game-selection.md) - 游戏选择主页原始需求
- [docs/internal/frontend-reconnect-fix.md](../internal/frontend-reconnect-fix.md) - 连接卡住修复记录
- [docs/design/API-CONTRACT.md](../design/API-CONTRACT.md) - 登录契约

---

**PM 签发**: 2026-06-19  
**预计工时**: 前端 3-4h
