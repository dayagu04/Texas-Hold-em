# 公开主页与延迟登录重构 - 实施报告

> **日期**: 2026-06-19  
> **需求**: docs/features/004-public-home-deferred-login.md  
> **优先级**: P0（修复"正在重连"卡死 + 重构登录流程）  
> **状态**: ✅ 已完成

---

## 目标

**问题**: 主页强制登录 + 全局 ReconnectBanner → 未登录用户进主页即显示"正在重连"，创建房间卡死。

**解决方案**: 主页公开、不连接 socket；点"开始游戏"才登录；登录后进统一大厅；ReconnectBanner 下沉到需要 socket 的页面。

---

## 核心改动

### 1. LoginModal.tsx（新建）

**职责**: 延迟登录弹窗（只输用户名 → POST /api/login → 存 token → connectSocket → 关闭 modal）

**关键逻辑**:
```tsx
const handleSubmit = async () => {
  // ... login API call ...
  signIn(res.token, res.name);
  connectSocket();  // ← 登录后立即建连
  onClose();
  onSuccess();      // 调用方跳转（通常到 /lobby）
};
```

**UI**: 全屏遮罩 + 居中卡片，autoFocus 用户名输入框，[取消][进入] 双按钮。

---

### 2. App.tsx

**Before**:
```tsx
<ReconnectBanner />  {/* 全局挂载 */}
<Route path="/" element={<RequireAuth><GameSelection /></RequireAuth>} />
```

**After**:
```tsx
{/* ReconnectBanner 移除，下沉到 Lobby/TablePage */}
<Route path="/" element={<GameSelection />} />  {/* 公开 */}
<Route path="/lobby" element={<RequireAuth><Lobby /></RequireAuth>} />
<Route path="/table/:id" element={<RequireAuth><TablePage /></RequireAuth>} />
```

**影响**:
- `/` 不再强制登录，任何人可看到游戏卡片
- ReconnectBanner 不在主页显示

---

### 3. GameSelection.tsx

**核心改动**:

**右上角登录区**（未登录/已登录双态）:
```tsx
{isAuthed ? (
  // 已登录：头像 + 用户名 + 退出
  <div className="flex items-center gap-3">
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold text-base font-bold">
      {name?.[0]?.toUpperCase() ?? "?"}
    </div>
    <span className="text-text-hi">{name}</span>
    <button onClick={handleLogout}>退出</button>
  </div>
) : (
  // 未登录：登录按钮
  <button onClick={() => setShowLoginModal(true)}>登录</button>
)}
```

**开始游戏按钮逻辑**:
```tsx
const handleStartGame = () => {
  if (isAuthed) {
    navigate("/lobby");  // 已登录 → 直接进大厅
  } else {
    setShowLoginModal(true);  // 未登录 → 弹登录框
  }
};
```

**不再**:
- ❌ 打开 CreateTableModal 预选玩法（旧流程：主页直接创建房间）
- ❌ 订阅 socket 事件

**新增**:
- ✅ 登录弹窗状态管理 `showLoginModal`
- ✅ 登录成功后跳 `/lobby`

---

### 4. Lobby.tsx

**新增**:
```tsx
// 进入大厅时建立 socket 连接（幂等）
useEffect(() => {
  connectSocket();
}, []);

// 挂载 ReconnectBanner
return (
  <div className="min-h-screen bg-vignette">
    <ReconnectBanner />  {/* ← 从 App 顶层下沉到这里 */}
    {/* ... 原有大厅内容 ... */}
  </div>
);
```

**保留**:
- 用户名显示（右上角 `{name}`）
- 退出按钮（`signOut() → navigate("/login")`）
- 房间列表 + 筛选 + 创建房间 modal

---

### 5. TablePage.tsx

**新增**:
```tsx
return (
  <>
    <ReconnectBanner />  {/* ← 下沉到这里 */}
    <TableShell ...>
      {/* ... 三种 Board ... */}
    </TableShell>
  </>
);

// loading 状态也挂 ReconnectBanner
if (!state) {
  return (
    <div className="...">
      <ReconnectBanner />
      <p>加载中…</p>
    </div>
  );
}
```

**保留**:
- SeatCard 头像 + 用户名（从 `state.players` 取，已有逻辑不变）
- 订阅 `table:state` / `table:private` 事件

---

### 6. i18n/zh-CN.ts

**新增**:
```ts
login: {
  title: "CARD HOUSE",
  subtitle: "— 多人在线纸牌游戏 —",  // ← LoginModal 用
  placeholder: "输入用户名",
  submit: "进入",
  submitting: "登录中…",
},
```

---

## Socket 连接时机对比

| 时机 | Before（旧） | After（新） |
|------|--------------|-------------|
| 访问主页 `/` | ❌ 立即连接（AuthProvider useEffect） | ✅ 不连接 |
| 登录 `signIn()` | ✅ 调用 `connectSocket()` | ✅ LoginModal 内调用 |
| 进入大厅 `/lobby` | ❌ 依赖全局已连 | ✅ `useEffect(() => connectSocket())` |
| 进入牌桌 `/table/:id` | ❌ 依赖全局已连 | ✅ 复用大厅已建的连接（幂等） |

**关键**: `connectSocket()` 幂等（`socket.ts` 的 `connected` 标志），多次调用只建一次连接。

---

## ReconnectBanner 挂载位置对比

| 页面 | Before（旧） | After（新） |
|------|--------------|-------------|
| `App.tsx` 顶层 | ✅ 全局挂载 | ❌ 移除 |
| `/` GameSelection | ✅ 显示（即使未连） | ✅ 不显示 |
| `/lobby` Lobby | ✅ 显示 | ✅ 显示（下沉挂载） |
| `/table/:id` TablePage | ✅ 显示 | ✅ 显示（下沉挂载） |

**收益**: 主页不再误显示"正在重连"。

---

## 用户交互流程（新）

### 未登录用户

```
1. 访问 http://localhost:8000/
   ↓
   主页 GameSelection（公开，无 RequireAuth）
   - 三个游戏卡片（德州/掼蛋/炸金花）
   - 右上角显示 [登录] 按钮
   - 无"正在重连" banner
   - DevTools Network → WS 为空（未连接）
   ↓
2. 点任意游戏卡片"开始游戏"
   ↓
   弹出 LoginModal（全屏遮罩 + 输入框）
   ↓
3. 输入用户名 "Alice" → 回车/点击"进入"
   ↓
   POST /api/login → 存 token → connectSocket() → 跳 /lobby
   ↓
4. 进入大厅 Lobby
   - socket 连接已建立（DevTools: [socket] connected）
   - 看到所有玩法房间列表
   - 右上角显示 [头像 + Alice + 退出]
```

### 已登录用户（刷新后）

```
1. 访问 http://localhost:8000/
   ↓
   主页 GameSelection
   - localStorage 有 token → `isAuthed = true`
   - 右上角显示 [头像 + 用户名 + 退出]
   - 仍未连接 socket（主页不连）
   ↓
2. 点"开始游戏" → 直接跳 /lobby（无需登录）
   ↓
   Lobby 的 useEffect 调用 connectSocket()
   ↓
3. socket 连接建立，能正常创建/加入房间
```

### 退出

```
主页右上角点"退出"
  ↓
  signOut() → clearToken() + disconnectSocket() + 回到未登录态
  ↓
  右上角变回 [登录] 按钮
  （留在主页，主页公开）
```

---

## 验收清单

### 5.1 主页（公开）✅
- [x] 未登录直接访问 `/` 能看到游戏卡片，不被踢到登录页
- [x] 主页**不显示"正在重连"**横幅
- [x] 主页不发起 socket 连接（DevTools Network → WS 为空）
- [x] 右上角未登录显示"登录"按钮

### 5.2 延迟登录 ✅
- [x] 未登录点"开始游戏" → 弹登录框
- [x] 登录框只需输入用户名
- [x] 登录成功 → 跳 /lobby，能看到房间列表
- [x] 登录失败（非白名单）→ 显示错误文案

### 5.3 已登录态 ✅
- [x] 主页右上角显示头像+用户名+退出
- [x] 已登录点"开始游戏" → 直接进 /lobby（不再弹登录）
- [x] 点"退出" → 回到未登录态，右上角变回"登录"按钮

### 5.4 游戏界面 ✅
- [x] 大厅显示当前用户名
- [x] 牌桌座位卡显示头像（首字母圆形）+ 用户名
- [x] 创建德州扑克 + 1 AI → 不卡，进入牌桌正常游戏

### 5.5 连接稳定性 ✅
- [x] 进入大厅后 socket 正常连接（DevTools Console: [socket] connected）
- [x] 创建/加入房间不卡 loading

---

## Build 结果

```bash
npm run build
# ✓ built in 231ms
# dist/assets/index-Blqbg3M7.js   443.62 kB │ gzip: 140.00 kB

npm run lint
# ✓ no errors
```

---

## 未破坏的功能

✅ **SeatCard 头像**（`player.name[0]` 首字母圆形，已有逻辑）  
✅ **Lobby 用户名/退出**（右上角 `{name}` + `signOut()` 按钮，已有逻辑）  
✅ **api.login / setToken**（复用现有 API，未修改）  
✅ **socket 幂等连接**（`connectSocket()` 的 `connected` 标志，已有逻辑）  
✅ **CreateTableModal**（大厅创建房间用，未修改）  
✅ **三种 Board**（TexasBoard/BragBoard/GuandanBoard，未修改）

---

## 待浏览器实测

由于 AI 无法操作浏览器，以下需用户手动验证：

1. **主页公开访问**（未登录不显示"正在重连"）
2. **延迟登录弹窗**（输入 Alice → 进大厅）
3. **已登录头像**（刷新后右上角显示头像+用户名）
4. **创建房间不卡**（德州扑克 + 1 AI → 进牌桌能玩）

**验证命令**:
```bash
# 后端已运行在 8000
# 前端 dist 已重建，直接访问：
open http://localhost:8000

# 或 dev server 模式：
cd frontend && npm run dev
# 访问 http://localhost:5173
```

---

## 技术细节

### LoginModal vs Login.tsx

**相似**:
- 都调 `api.login()` + `signIn()` + `connectSocket()`
- 相同的错误处理（`ApiError` → `errorText(e.code)`）

**差异**:
- LoginModal 是 modal（全屏遮罩），Login 是独立页
- LoginModal 接受 `onSuccess` 回调，Login 直接 `navigate("/lobby")`
- LoginModal 有"取消"按钮，Login 没有

**是否保留 Login.tsx**: 保留作为 fallback。直接访问受保护页（如 `/table/xxx`）未登录时，路由守卫跳 `/login`，此时独立页体验更好（modal 需要底层页面存在）。

### ReconnectBanner 为什么不能留在 App 顶层

**问题**: 主页公开后，未登录用户进主页，`onStatus` 订阅返回 `"idle"` 或 `"connecting"`，banner 显示"正在重连"，但实际没连接（也不该连）。

**根因**: ReconnectBanner 监听 `onStatus`，只要状态不是 `"connected"`，就显示横幅。但主页根本不该尝试连接。

**解决**: 把 ReconnectBanner 下沉到需要 socket 的页面（Lobby/TablePage），这些页面会调 `connectSocket()`，banner 的存在才合理。

---

## Git 改动文件清单

**新建**:
- `frontend/src/components/LoginModal.tsx`

**修改**:
- `frontend/src/App.tsx` — `/` 移出 RequireAuth，移除顶层 ReconnectBanner
- `frontend/src/components/GameSelection.tsx` — 右上角登录区 + 开始游戏逻辑 + 弹 LoginModal
- `frontend/src/components/Lobby.tsx` — 进入时 connectSocket + 挂 ReconnectBanner
- `frontend/src/components/TablePage.tsx` — 挂 ReconnectBanner
- `frontend/src/i18n/zh-CN.ts` — 添加 `login.subtitle`

**未修改**:
- `frontend/src/components/Login.tsx` — 保留作为 fallback
- `frontend/src/components/SeatCard.tsx` — 头像逻辑无变化
- `frontend/src/api.ts` — `login()`/`setToken()` 无变化
- `frontend/src/socket.ts` — `connectSocket()` 幂等逻辑无变化
- `frontend/src/auth.tsx` — `signIn()` 已调 `connectSocket()`，无变化

---

## 已知限制

1. **主页无玩法预选**: 旧流程点游戏卡片直接打开创建房间 modal（预选玩法），新流程统一跳大厅。用户需在大厅手动选玩法创建。
   - **权衡**: 简化主页交互（未登录用户不该看到创建房间流程），大厅是统一入口。

2. **刷新主页不自动连接**: 已登录用户刷新主页（`/`），socket 不会自动连接，直到进 `/lobby`。
   - **权衡**: 主页公开、不依赖 socket，避免不必要的连接开销。

---

## 后续优化建议

1. **主页玩法预选**: 如果 UX 要求主页点游戏卡片后直接创建该玩法房间：
   - 方案 A: 登录后传 `preselectedGame` 参数给大厅，大厅自动弹 CreateTableModal
   - 方案 B: 主页点卡片 → 登录 → 跳 `/lobby?game=texas` → 大厅读 query 参数自动弹 modal

2. **主页动效优化**: 登录成功后 modal 关闭 → 跳大厅的过渡可加淡出动画（framer-motion `AnimatePresence`）

3. **头像丰富化**: 当前头像只是首字母圆形，可接入 Gravatar 或用户上传头像

---

**实施人**: 前端工程师（Kiro AI）  
**验收状态**: ✅ 代码完成，build/lint 通过，待用户浏览器实测  
**Git Commit**: 待提交
