# 文档目录结构规划

> **目的**: 区分产品设计文档（需提交 Git）和项目管理临时文档（不提交 Git）

---

## 目录结构

```
docs/
├── design/              # 产品设计文档（提交 Git）
│   ├── PRD.md          # 产品需求文档
│   ├── ARCHITECTURE.md # 架构设计
│   ├── API-CONTRACT.md # 前后端契约
│   ├── GAME-RULES.md   # 游戏规则
│   ├── UI-DESIGN.md    # UI 设计规范
│   └── AI-BOTS.md      # AI 机器人设计
│
├── features/           # 功能需求（提交 Git）
│   └── 001-game-selection.md  # 游戏选择主页
│
├── onboarding/         # 入职/交接文档（提交 Git）
│   ├── README.md       # 项目概览
│   └── HANDOFF.md      # 任务交接清单
│
└── internal/           # 内部工作文档（不提交，加入 .gitignore）
    ├── NEXT-STEPS.md           # 下一阶段工作指令
    ├── M3.5-COMPLETION-REPORT.md  # 里程碑完成报告
    └── meeting-notes/          # 会议记录
```

---

## 分类原则

### ✅ 提交 Git 的文档（永久保留）

**产品设计类**（`design/`）
- PRD.md - 产品需求定义
- ARCHITECTURE.md - 技术架构设计
- API-CONTRACT.md - 前后端接口契约
- GAME-RULES.md - 游戏规则说明
- UI-DESIGN.md - UI 设计规范
- AI-BOTS.md - AI 机器人策略

**功能需求类**（`features/`）
- 按编号命名：`001-game-selection.md`, `002-xxx.md`
- 每个独立功能一个文件
- 包含：需求背景、设计方案、验收标准

**入职文档类**（`onboarding/`）
- README.md - 项目总览（给新人看的第一份文档）
- HANDOFF.md - 长期任务清单（前后端分工）

### 🚫 不提交 Git 的文档（临时工作产物）

**内部工作类**（`internal/`，加入 .gitignore）
- NEXT-STEPS.md - 当前阶段工作指令（会过期）
- M3.5-COMPLETION-REPORT.md - 里程碑报告（仅用于当时沟通）
- meeting-notes/ - 会议记录、临时讨论

**为什么不提交**：
1. 时效性强，过期即失效
2. 包含大量"当前状态"的描述（git log 已记录）
3. 对新人/后续维护者无价值
4. 污染 git history

---

## 迁移计划

### 步骤 1: 创建新目录结构
```bash
mkdir -p docs/{design,features,onboarding,internal}
```

### 步骤 2: 移动文件
```bash
# 产品设计
mv docs/PRD.md docs/design/
mv docs/ARCHITECTURE.md docs/design/
mv docs/API-CONTRACT.md docs/design/
mv docs/GAME-RULES.md docs/design/
mv docs/UI-DESIGN.md docs/design/
mv docs/AI-BOTS.md docs/design/

# 功能需求
mv docs/FEATURE-REQUEST-001.md docs/features/001-game-selection.md

# 入职文档
mv docs/README.md docs/onboarding/
mv docs/HANDOFF.md docs/onboarding/

# 内部工作文档
mv docs/NEXT-STEPS.md docs/internal/
mv docs/M3.5-COMPLETION-REPORT.md docs/internal/
```

### 步骤 3: 更新 .gitignore
```gitignore
# 临时工作文档（不提交）
docs/internal/
```

### 步骤 4: 更新交叉引用
批量替换文档中的链接：
- `[PRD.md](./PRD.md)` → `[PRD.md](./design/PRD.md)`
- `[API-CONTRACT.md](./API-CONTRACT.md)` → `[API-CONTRACT.md](./design/API-CONTRACT.md)`

---

## 后续维护规则

### PM 产出归档原则

| 产出类型 | 目录 | 提交 Git | 示例 |
|---------|------|---------|------|
| 需求文档 | `features/` | ✅ | `002-reconnect-ui.md` |
| 设计变更 | `design/` | ✅ | 修改 `API-CONTRACT.md` |
| 阶段总结 | `internal/` | ❌ | `M4-COMPLETION-REPORT.md` |
| 工作指令 | `internal/` | ❌ | `NEXT-STEPS.md`（会被新版覆盖） |
| 会议记录 | `internal/meeting-notes/` | ❌ | `2026-06-19-sync.md` |

### 开发 Agent 读取规则

开发 agent 启动时应读取：
1. `docs/onboarding/README.md` - 项目概览
2. `docs/design/` 下的相关设计文档
3. `docs/features/` 下的待实现需求
4. **不读** `docs/internal/`（PM 内部使用）

---

## 执行

需要我立即执行迁移吗？还是你想调整分类原则？
