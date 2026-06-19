# 007 - UI 修正：花色显示 + 结算浮层尺寸 + 国际化

> **编号**: 007  
> **状态**: 待排期  
> **优先级**: P1(影响体验)  
> **预估**: 前端 1-2h

## 1. 需求背景

用户反馈 #006 上线后的 4 个 UI 问题:
1. **花色仍然显示不全**: 部分牌显示 "?" 而非花色符号
2. **结算浮层太大**: HandEndModal 占屏幕过多,压迫感强
3. **扑克点数显示错误**: 部分牌的 rank 显示异常(如 10 显示为 "T" 或 "?")
4. **页面有英文**: 应全中文化,无英文残留

## 2. 问题分析

### 2.1 花色显示不全

**已知修复**(commit 06310b7):
- CardSprite.tsx 已改用小写 key + `toLowerCase()` 归一
- 理论上应该支持前后端大小写混合

**可能新问题**:
- Mock fixture 里的牌数据格式异常?
- 或者某些特殊牌型(如大小王)的 suit 字段值不在 `s/h/d/c/j` 范围?
- 或者后端某些引擎(brag/guandan)发送的 suit 格式不一致?

**诊断**: 需要用户提供:
- 哪些牌显示 "?"(rank + suit 原始值)
- 浏览器控制台是否有警告/错误
- 是哪个玩法(德扑/炸金花/掼蛋)

### 2.2 结算浮层太大

**当前尺寸**: `max-w-2xl`(672px 宽) + `max-h-[60vh]`(60% 屏高)

**优化方案**:
- 宽度缩小到 `max-w-xl`(576px)
- 高度改 `max-h-[50vh]`
- 内边距从 `p-6` 改 `p-4`
- 卡片间距从 `space-y-3` 改 `space-y-2`
- 底牌显示缩小:`h-14 w-10` → `h-12 w-8.5`

### 2.3 扑克点数显示错误

**当前逻辑**(CardSprite.tsx:58-59):
```ts
const rankLabel =
  RANK_LABEL[card.rank] ?? (card.rank >= 2 && card.rank <= 10 ? String(card.rank) : "?");
```

**RANK_LABEL**(line 32):
```ts
const RANK_LABEL: Record<number, string> = {
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
  15: "小王",
  16: "大王",
};
```

**问题**: `rank=10` 走到 `String(card.rank)`,应该返回 `"10"`,但可能有边界情况:
- 后端发送 `rank=10` 时 code 显示为 `"Th"`(T = 10 的简码),前端是否误用了 code?
- 或者前端某处直接用了 `card.code` 而非 `rankLabel`?

**修复**: 确认 CardSprite 渲染的是 `rankLabel` 而非 `card.code`。

### 2.4 页面英文残留

**已知中文化**:
- `frontend/src/i18n/zh-CN.ts` 已有字典
- 大部分组件用 `zhCN.xxx` 取文案

**可能残留位置**:
- CreateTableModal 的 "game_mode" 选项标签(单局/连续/限定)
- HandEndModal 的按钮文案("跳过等待"/"返回大厅")已是中文,但可能有其他文案
- 错误提示(如 connect_error / kicked)
- 登录页/404 页

**修复**: 逐个组件审查,确保所有用户可见文案走 `zhCN`。

## 3. 修复方案

### 任务 A: 花色显示诊断 + 兜底

**如果用户能提供具体哪张牌显示 "?"**:
- 检查该牌的 `card.suit` 原始值
- 补充到 SUIT_SYMBOL 的 key(如果是新值)

**防御性兜底**:
```ts
const suitKey = (card.suit || "").toLowerCase();
const suitSymbol = SUIT_SYMBOL[suitKey] ?? "🂠"; // 改用扑克背面 Unicode,比 "?" 更明显
```

### 任务 B: 结算浮层缩小

修改 HandEndModal.tsx:
- line 60: `max-w-2xl` → `max-w-xl`
- line 70: `max-h-[60vh] space-y-3 p-6` → `max-h-[50vh] space-y-2 p-4`
- line 97: `className="h-14 w-10"` → `className="h-12 w-8.5"`
- header px-6 py-4 → px-4 py-3
- footer px-6 py-4 → px-4 py-3

### 任务 C: 点数显示修复

检查 CardSprite.tsx line 69-70 是否误用 `card.code`:
```tsx
<span className={`text-sm font-bold ${suitColor}`}>{rankLabel}</span>
<span className={`text-3xl ${suitColor}`}>{suitSymbol}</span>
```

如果没问题,可能是后端某个引擎发送了错误的 rank 值(如负数/0/超出范围)。

**防御性修复**:
```ts
const rankLabel = 
  RANK_LABEL[card.rank] ?? 
  (card.rank >= 2 && card.rank <= 10 ? String(card.rank) : 
   (card.rank === 1 ? "A" : "?")); // 防御 rank=1 的 Ace
```

### 任务 D: 全中文化审查

**已知需要中文化的位置**:
1. CreateTableModal 游戏模式标签(line ~140-150):
   - "Single mode" → "单局模式(打完一局后手动开下一局)"
   - "Continuous mode" → "连续模式(自动开下一局,直到人数不足)"
   - "Limited rounds" → "限定局数"
2. HandEndModal 已是中文,检查是否有遗漏
3. 错误提示 `connect_error` / `kicked` / `INVALID_ACTION` 等,在 sio.py emit 时后端已发中文 message,前端只需显示 `error.message`
4. 登录页 Login.tsx / LoginModal.tsx 检查占位符 placeholder
5. ReconnectBanner "Reconnecting..." → "正在重连..."

**执行**: 全局搜索 `placeholder=` / `aria-label=` / 硬编码英文字符串,逐个改为 `zhCN.xxx`。

## 4. 验收标准

### 任务 A
- [ ] 所有牌(2-A,四花色,大小王)都显示正确花色符号,无 "?"
- [ ] 如果后端发送异常 suit,显示 🂠(扑克背面)而非 "?"

### 任务 B
- [ ] HandEndModal 宽度缩小,视觉不压迫
- [ ] 底牌缩小但仍清晰可辨
- [ ] 4 人结算时列表不溢出,无需滚动(或滚动不超过 2 行)

### 任务 C
- [ ] 10 显示 "10",不是 "T" 或 "?"
- [ ] J/Q/K/A 显示正确,2-9 显示正确
- [ ] 大小王(如果用到)显示正确

### 任务 D
- [ ] 创建房间界面:所有标签/占位符/按钮文案为中文
- [ ] 结算浮层:所有文案为中文
- [ ] 错误提示:显示中文错误信息
- [ ] 登录/大厅/牌桌页:无英文残留

## 5. 前端 Agent 提示词

```
【任务】修复 #007 UI 问题(花色 + 尺寸 + 点数 + 中文化)

【背景】
- 需求文档: docs/features/007-ui-fixes-i18n.md
- 用户反馈 4 个体验问题需立即修复

【要做什么】

任务 A: 花色显示兜底
位置: frontend/src/components/CardSprite.tsx
修改:
  - line 63: 兜底符号改为 🂠(扑克背面 Unicode)
    const suitSymbol = SUIT_SYMBOL[suitKey] ?? "🂠";
  - 增加防御: const suitKey = (card.suit || "").toLowerCase();

任务 B: 结算浮层缩小
位置: frontend/src/components/HandEndModal.tsx
修改:
  - line 60: max-w-2xl → max-w-xl
  - line 70: max-h-[60vh] space-y-3 p-6 → max-h-[50vh] space-y-2 p-4
  - line 66/120: px-6 py-4 → px-4 py-3
  - line 97: h-14 w-10 → h-12 w-9 (底牌缩小)

任务 C: 点数显示防御
位置: frontend/src/components/CardSprite.tsx line 58
修改:
  const rankLabel =
    RANK_LABEL[card.rank] ??
    (card.rank >= 2 && card.rank <= 10 ? String(card.rank) :
     card.rank === 1 ? "A" : "?");

任务 D: 全中文化
步骤:
  1. CreateTableModal.tsx 游戏模式标签(~line 150):
     - 增加到 zhCN.createTable:
       gameMode: {
         single: "单局模式",
         singleDesc: "打完一局后手动开下一局",
         continuous: "连续模式",
         continuousDesc: "自动开下一局,直到人数不足",
         limited: "限定局数",
         rounds: "局"
       }
     - JSX 改为 {zhCN.createTable.gameMode.single}
  2. ReconnectBanner.tsx 检查 "Reconnecting..." → 改为 zhCN 或硬编码"正在重连..."
  3. Login.tsx / LoginModal.tsx 检查 placeholder,改为 zhCN.login.usernamePlaceholder
  4. 全局搜索 `placeholder="` / 硬编码英文,逐个中文化

【验收】
- [ ] 德扑/炸金花/掼蛋的所有牌都有花色符号(无 "?")
- [ ] 结算浮层宽度缩小,底牌清晰,4 人结算不需滚动
- [ ] 10 显示 "10"(不是 "T"),J/Q/K/A 正确
- [ ] 全页面无英文残留(创建/大厅/牌桌/登录/错误提示)

【约定】
- 提交 message: fix(frontend): #007 花色兜底 + 结算浮层缩小 + 全中文化
- 改完不要 push,等 PM 验收
```

## 6. 关联

- 依赖: #006 HandEndModal 组件
- 前置: bugfix-create-stuck-card-display (花色修复基础)
