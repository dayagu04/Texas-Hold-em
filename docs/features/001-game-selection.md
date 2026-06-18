# 功能需求 #001 - 游戏选择主页优化

> **提出日期**: 2026-06-19  
> **提出人**: 用户  
> **优先级**: P0（影响首次体验）  
> **状态**: 待开发

---

## 1. 需求背景

**当前问题**：
1. 用户登录后直接进入房间列表（Lobby），缺少游戏介绍，新用户不了解三种玩法。
2. 创建房间后一直显示"加载中"，游戏无法开始（技术问题）。

**用户期望**：
1. 登录后先看到**游戏选择页**，展示三种玩法的介绍和特色。
2. 点击"开始游戏"按钮后，再进入对应玩法的创建/加入流程。
3. 页面有**淡入淡出动效**，提升视觉体验。

---

## 2. 需求描述

### 2.1 新增游戏选择主页

**路由**: `/` (登录后默认进入)

**布局**:
```
┌────────────────────────────────────────────────┐
│  多人扑克平台                    [进入大厅]     │  ← 顶部栏
├────────────────────────────────────────────────┤
│                                                │
│           选择你的游戏                          │  ← 标题（居中，淡入）
│       挑战智慧，享受博弈乐趣                     │  ← 副标题
│                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ 德州扑克  │  │   掼蛋    │  │  炸金花   │    │  ← 三个卡片（依次淡入）
│  │ ♠️        │  │ 🃏        │  │ 🎴        │    │
│  │ • 规则1  │  │ • 规则1  │  │ • 规则1  │    │
│  │ • 规则2  │  │ • 规则2  │  │ • 规则2  │    │
│  │ • 规则3  │  │ • 规则3  │  │ • 规则3  │    │
│  │          │  │          │  │          │    │
│  │[开始游戏]│  │[开始游戏]│  │[开始游戏]│    │  ← 按钮（悬停放大）
│  └──────────┘  └──────────┘  └──────────┘    │
│                                                │
│     💡 提示：也可直接进入大厅加入现有房间        │  ← 底部提示
└────────────────────────────────────────────────┘
```

### 2.2 游戏介绍内容

参考 `docs/GAME-RULES.md`，每个卡片包含：

**德州扑克 (Texas Hold'em)**
- 2-6 人，4 街下注
- 5 张最强牌组合获胜
- 考验心理博弈与概率计算

**掼蛋 (Guandan)**
- 4 人 2v2 固定搭档
- 先出完牌的一方获胜
- 炸弹和同花顺最大

**炸金花 (Three-card Brag)**
- 2-6 人，3 张比大小
- 豹子 > 顺金 > 金花 > 顺子
- 可闷牌可比牌，刺激紧张

### 2.3 交互流程

1. **登录后** → 自动进入 `/` (游戏选择页)
2. **点击"开始游戏"** → 弹出 CreateTableModal，**预选对应玩法**，直接进入参数配置步骤
3. **点击"进入大厅"** → 跳转到 `/lobby`，查看所有现有房间

### 2.4 动效要求

使用 `framer-motion`（已安装）实现：

| 元素 | 动效 | 参数 |
|------|------|------|
| 标题 | 从上方淡入滑入 | `y: -20 → 0`, `opacity: 0 → 1`, `duration: 0.6s` |
| 卡片 | 依次淡入 | 每个延迟 `150ms`，`opacity: 0 → 1`, `duration: 0.4s` |
| 卡片悬停 | 放大 + 发光 | `scale: 1 → 1.03`, 外发光 `box-shadow` |
| 按钮悬停 | 背景渐变 | 按钮颜色从主色调变为高亮色 |

### 2.5 设计规范

遵循 `docs/UI-DESIGN.md`：

- **配色**: 赌场暗金主题（`--color-felt`, `--color-gold`）
- **卡片标签色**: 
  - 德州扑克: `--color-tag-texas` (蓝色)
  - 掼蛋: `--color-tag-guandan` (红色)
  - 炸金花: `--color-tag-brag` (紫色)
- **字体**: 标题用 `font-heading`，正文用 `font-body`

---

## 3. 技术实现要点

### 3.1 新建组件

**文件**: `frontend/src/components/GameSelection.tsx`

**核心代码**:
```tsx
import { motion } from "framer-motion";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CreateTableModal } from "./CreateTableModal";

export function GameSelection() {
  const [showModal, setShowModal] = useState(false);
  const [preselectedGame, setPreselectedGame] = useState<"texas" | "guandan" | "brag" | null>(null);
  
  const handleStart = (gameType: "texas" | "guandan" | "brag") => {
    setPreselectedGame(gameType);
    setShowModal(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      {/* 标题 */}
      {/* 三个卡片 */}
      {showModal && <CreateTableModal preselectedGame={preselectedGame} />}
    </motion.div>
  );
}
```

### 3.2 路由调整

**文件**: `frontend/src/App.tsx`

```tsx
<Routes>
  <Route path="/" element={<GameSelection />} />  {/* 新增 */}
  <Route path="/lobby" element={<Lobby />} />
  <Route path="/table/:tableId" element={<TablePage />} />
  <Route path="*" element={<Navigate to="/" />} />
</Routes>
```

### 3.3 CreateTableModal 改造

**文件**: `frontend/src/components/CreateTableModal.tsx`

**新增 props**:
```tsx
interface Props {
  onClose: () => void;
  onCreated: (tableId: string) => void;
  preselectedGame?: "texas" | "guandan" | "brag";  // 新增
}
```

**逻辑**:
- 如果 `preselectedGame` 有值，初始 `step = 2`（跳过玩法选择）
- 自动设置 `gameType = preselectedGame`

### 3.4 国际化文案

**文件**: `frontend/src/i18n/zh-CN.ts`

```typescript
gameSelection: {
  title: "选择你的游戏",
  subtitle: "挑战智慧，享受博弈乐趣",
  startGame: "开始游戏",
  toLobby: "进入大厅",
  hint: "💡 提示：也可直接进入大厅加入现有房间",
  texas: {
    rule1: "2-6 人，4 街下注",
    rule2: "5 张最强牌组合获胜",
    rule3: "考验心理博弈与概率计算"
  },
  // ... guandan, brag 类似
}
```

---

## 4. Bug 修复（关联）

**问题**: 创建房间后一直显示"加载中"

**根本原因**: `CreateTableModal` 硬编码跳转到假表 ID `t-texas-1`，后端返回的真实 UUID 无法匹配。

**修复方案**:
1. 监听 `lobby:joined` 事件，获取后端返回的真实 `table_id`
2. 收到事件后再执行 `onCreated(table_id)`
3. 按钮显示"创建中..."，禁用重复点击

**文件**: `frontend/src/components/CreateTableModal.tsx`

---

## 5. 验收标准

### 5.1 功能验收
- [ ] 登录后进入游戏选择页，看到三个卡片
- [ ] 点击任意"开始游戏"，弹出 CreateTableModal 且玩法已预选
- [ ] 点击"进入大厅"，跳转到房间列表页
- [ ] 创建房间后能正常进入游戏（不再卡在加载中）

### 5.2 视觉验收
- [ ] 标题从上方淡入滑入
- [ ] 三个卡片依次淡入（间隔约 150ms）
- [ ] 卡片悬停时放大并外发光
- [ ] 配色符合赌场暗金主题

### 5.3 响应式验收
- [ ] 1280×800 分辨率下三列卡片横向排列
- [ ] iPad 横屏可正常显示

---

## 6. 开发 Agent 提示词

```
你是前端工程师。请按照 docs/features/001-game-selection.md 的需求，完成以下任务：

【主任务】
1. 新建 frontend/src/components/GameSelection.tsx 组件
   - 参考设计稿（文档中的 ASCII 布局）
   - 使用 framer-motion 实现淡入淡出动效
   - 三个游戏卡片，每个包含：游戏名、3 条规则、开始游戏按钮
   - 遵循 docs/UI-DESIGN.md 的赌场暗金主题

2. 修改 frontend/src/App.tsx
   - 新增 / 路由指向 GameSelection
   - 保留 /lobby 原有逻辑

3. 改造 frontend/src/components/CreateTableModal.tsx
   - 新增 preselectedGame?: "texas" | "guandan" | "brag" 参数
   - 如果有预选玩法，直接进入第 2 步（参数配置）
   - **修复加载 bug**：监听 lobby:joined 事件，使用真实 table_id 跳转

4. 补充国际化文案 frontend/src/i18n/zh-CN.ts

【验收】
- npm run build 成功
- 打开 http://localhost:5173，登录后看到游戏选择页
- 点击任意"开始游戏"，弹出 modal 且玩法已选
- 创建房间后能正常进入游戏（不卡加载）

【参考】
- 游戏规则: docs/GAME-RULES.md
- 设计规范: docs/UI-DESIGN.md
- 契约定义: docs/API-CONTRACT.md
- 已有组件: frontend/src/components/ 目录下的其他组件
```

---

**PM 签发**: 2026-06-19  
**预计工时**: 前端 2-3 小时
