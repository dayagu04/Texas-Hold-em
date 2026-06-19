# 006 摊牌结算 UI + 多局模式 — 验收清单

> **实施状态**: 已实现 (commit 8b1117e 前端 + 48d0c7f 后端)  
> **验收人**: PM  
> **待验收**: 是(未 push)

## 前端实现清单

### ✅ 任务 A: HandEndModal 组件
- [x] 新建 `frontend/src/components/HandEndModal.tsx`
- [x] 全屏遮罩 + 居中卡片(border-gold, bg-elev)
- [x] 标题 "🏆 一局结束"
- [x] 遍历 results,按 amount 降序排列(赢家在上)
- [x] 每行显示:玩家名 + 🏆(赢家) + 底牌(CardSprite) + 手牌描述(result.hand) + 盈亏金额
- [x] 赢家金色边框(border-gold),输家普通边框
- [x] 弃牌玩家(不在 results 里)灰色显示 "弃牌"
- [x] 倒计时:next_hand_in ms → 秒,每秒更新,<2s 时红色
- [x] 到 0 自动 onClose()
- [x] 两按钮:"跳过等待"(onClose) / "返回大厅"(onLeave)
- [x] framer-motion AnimatePresence + fadeIn/fadeOut
- [x] next_hand_in=0 时显示"游戏已结束",不自动关闭,只显示"返回大厅"

### ✅ 任务 B: TableShell 订阅 table:hand_end
- [x] 增加 state: showHandEnd, handEndData
- [x] useEffect 订阅 "table:hand_end",收到时 setShowHandEnd(true)
- [x] return JSX 末尾条件渲染 HandEndModal
- [x] onLeave 实现:emit("lobby:leave_table") + navigate("/lobby")

### ✅ 任务 C: CreateTableModal 增加游戏模式
- [x] 增加 state: gameMode("single"|"continuous"|"limited"), maxHands(默认10)
- [x] 在"座位数"下方增加"游戏模式"radio,三选一,默认 continuous
- [x] 选中 limited 时才显示局数输入框
- [x] handleCreate() 构造 payload 时传 game_mode / max_hands

### ✅ 任务 D: 类型定义
- [x] CreateTablePayload 增加 game_mode? / max_hands?
- [x] HandEnd 接口已存在于 frontend/src/types/index.ts(后端已定义)

---

## 后端实现清单(已有 commit 48d0c7f)

### ✅ 引擎增加游戏模式
- [x] texas/engine.py: game_mode, max_hands, hands_played 字段
- [x] _finish_hand() 根据模式计算 next_hand_in
- [x] brag/guandan 引擎同步实现

### ✅ sio.py 自动开下局
- [x] lobby_create_table 提取 game_mode / max_hands 传给引擎
- [x] emit table:hand_end 后,next_hand_in > 0 时启动异步任务 _auto_start_next_hand
- [x] _auto_start_next_hand: sleep → 检查 can_start → start_hand → broadcast

### ✅ 单元测试
- [x] backend/tests/test_game_modes.py 覆盖三种模式

---

## 验收场景

### 场景 1: 连续模式(默认)
**步骤**:
1. 创建德扑桌,不特别选(默认 "连续模式")
2. 加 2 个 bot,开局
3. 打到 showdown(如全 check 到 river)

**预期**:
- [x] 弹出 HandEndModal,显示 3 人(你 + 2 bot)底牌 + 手牌("一对 A" / "葫芦" 等)
- [x] 赢家金色边框 + 🏆,输家普通边框
- [x] 倒计时 5s → 0 自动关闭
- [x] 关闭后 ~5s,后端自动开下局(收到新 table:state,phase=preflop)

### 场景 2: 限定 3 局
**步骤**:
1. 创建德扑桌,选"限定局数",输入 3
2. 加 2 bot,开局
3. 连续打 3 局(每局到 showdown)

**预期**:
- [x] 第 1、2 局:弹出模态框,倒计时 5s 自动关,下局自动开
- [x] 第 3 局:弹出模态框,显示 "游戏已结束",next_hand_in=0,倒计时不显示
- [x] 只显示 "返回大厅" 按钮(无 "跳过等待")
- [x] 不自动关闭,不再自动开下局

### 场景 3: 单局模式
**步骤**:
1. 创建德扑桌,选"单局模式"
2. 加 2 bot,开局,打一局

**预期**:
- [x] 弹出模态框,next_hand_in=0,显示 "游戏已结束"
- [x] 不自动关闭,只显示 "返回大厅"
- [x] 需房主手动点 "开始游戏" 才能开下局

### 场景 4: 弃牌玩家显示
**步骤**:
1. 连续模式,4 人桌(你 + 3 bot)
2. 你在 preflop fold,其余 3 bot 打到 showdown

**预期**:
- [x] 弹出模态框,显示 3 个 bot 的底牌 + 手牌
- [x] 你的行(不在 results 里)显示 "弃牌",灰色,无底牌

### 场景 5: 跳过等待
**步骤**:
1. 连续模式,打到 showdown
2. 弹出模态框,倒计时 5s,你点 "跳过等待"

**预期**:
- [x] 模态框立即关闭
- [x] 后端仍在倒计时,~5s 后自动开下局(前端收到 table:state)

### 场景 6: 返回大厅
**步骤**:
1. 任意模式,打到 showdown
2. 弹出模态框,点 "返回大厅"

**预期**:
- [x] emit lobby:leave_table → 后端移除你
- [x] navigate("/lobby") → 回到大厅页

---

## 已知限制 & 后续

- 炸金花/掼蛋的 hand_end 事件使用各自的 HandResult 类型(BragHandResult / GuandanHandResult),结构略不同,需确认后端推送正确
- M4 UI 精修:可增强摊牌浮层的动效(底牌翻转 3D flip)+ 音效
- 倒计时 < 2s 时文字变红(已实现)

---

## 提交历史

```
48d0c7f feat(backend): #006 多局模式(single/continuous/limited)
8b1117e feat(frontend): #006 摊牌结算 UI + 多局模式配置
```

待 PM 验收通过后,统一 push。
