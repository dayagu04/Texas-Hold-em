# 006 - 摊牌结算 UI + 多局模式

> **编号**: 006  
> **状态**: 待排期  
> **优先级**: P2(体验增强)  
> **预估**: 前端 3-4h, 后端 1-2h

## 1. 需求背景

用户反馈当前一局结束后体验不完整:
- 摊牌时看不到其他玩家的牌(后端已推送 `table:hand_end`,前端没展示)
- 不知道自己 / 对手的最大手牌是什么(如"葫芦"、"顺子")
- 一局打完就结束,要手动再点"开始游戏",节奏慢
- 想设置"打 10 局"或"一直打到某人破产"

## 2. 详细设计

### 2.1 摊牌浮层(HandEndModal)

**触发**: 前端收到 `table:hand_end` 事件(后端已实现,见 [API-CONTRACT.md §2.4](../design/API-CONTRACT.md#L154))

**内容**(参考德扑为例,其他玩法按 results 结构适配):
```
┌──────────────────────────────────────────┐
│        🏆 一局结束                        │
├──────────────────────────────────────────┤
│                                          │
│  Alice (你)          +120 筹码           │
│  ♠A ♥K — 葫芦 (A-K-K)                    │
│  [你的底牌 + 公共牌可见区]                │
│                                          │
│  Bob                 -60 筹码            │
│  ♦9 ♣8 — 一对 (9-9)                      │
│                                          │
│  Charlie (弃牌)                          │
│                                          │
├──────────────────────────────────────────┤
│  下一局倒计时: 5s                         │
│  [跳过等待] [返回大厅]                    │
└──────────────────────────────────────────┘
```

**设计要点**:
- 全屏半透明遮罩 + 居中卡片
- **赢家高亮**(金色边框 + 🏆 图标)
- 显示每个参与者(未 fold 的):
  - 底牌 2 张(用 `CardSprite`,从 `results[].cards` 取)
  - 最大手牌描述(如"葫芦 A-K-K",从 `results[].hand` 取)
  - 盈亏金额(从 `results[].amount` 取,正数绿色"+120",负数不显示或显示"-0")
- **弃牌玩家**(不在 results 里但在 players 里)灰色显示"弃牌"
- 倒计时 5s(从 `next_hand_in` 字段,单位 ms)后自动关闭 → 下一局开始(如果是多局模式)
- 两个按钮:
  - "跳过等待"(立即关闭浮层,不影响下局倒计时)
  - "返回大厅"(`emit("lobby:leave_table")` + `navigate("/lobby")`)

**技术实现**:
- 新建 `frontend/src/components/HandEndModal.tsx`
- 在 `TablePage.tsx` 或 `TableShell.tsx` 订阅 `table:hand_end`,收到时弹出
- 用 `framer-motion` 的 `<AnimatePresence>` + 淡入动画
- 倒计时用 `useState` + `useEffect` + `setTimeout`
- `results` 数组按 `amount` 降序排列(赢家在最上)

### 2.2 多局模式配置

**入口**: `CreateTableModal` 第 2 步(参数配置)增加"游戏模式"单选:

```
玩法: [德州扑克]  ← 第 1 步已选

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
房间设置

桌名: [________________]
座位数: [2] [4] [6] ← radio
初始筹码: [1000]
小盲: [10]

游戏模式: ← 新增
  ○ 单局模式(打完一局后手动开下一局)
  ● 连续模式(自动开下一局,直到人数不足)    ← 默认
  ○ 限定局数(打满 N 局后结束)
     └─ [10] 局
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**字段设计**:
- `CreateTablePayload` 增加:
  ```ts
  game_mode?: "single" | "continuous" | "limited";
  max_hands?: number;  // game_mode=limited 时必填
  ```
- 后端 `TexasEngine` / `BragEngine` / `GuandanEngine` 增加:
  ```python
  self.game_mode: str = "continuous"  # single / continuous / limited
  self.max_hands: int | None = None
  self.hands_played: int = 0  # 已打局数
  ```

**行为**:
| 模式 | `table:hand_end.next_hand_in` | 后端逻辑 |
|------|-------------------------------|----------|
| **single** | `0`(等手动 `table:start_hand`) | hand 结束后 `hand_in_progress=False`,不自动开局 |
| **continuous** | `5000`(5s 后自动) | hand 结束后启动 5s 定时器,到期自动 `start_hand()`,直到 `can_start()=False`(人数不足) |
| **limited** | `5000`(5s 后自动),但最后一局为 `0` | 同 continuous,但 `hands_played >= max_hands` 时 `next_hand_in=0` + 广播"游戏结束"事件 |

**后端实现要点**:
- `_finish_hand()` 末尾根据 `game_mode` 决定 `next_hand_in`:
  ```python
  if self.game_mode == "single":
      next_hand_in = 0
  elif self.game_mode == "continuous":
      next_hand_in = 5000 if self.can_start() else 0
  elif self.game_mode == "limited":
      self.hands_played += 1
      if self.hands_played >= self.max_hands:
          next_hand_in = 0  # 已打满
      else:
          next_hand_in = 5000 if self.can_start() else 0
  ```
- `table:hand_end` emit 后,如果 `next_hand_in > 0`,启动异步定时器:
  ```python
  if next_hand_in > 0:
      await asyncio.sleep(next_hand_in / 1000.0)
      if engine.can_start():
          engine.start_hand()
          await _broadcast_table_state(table_id)
          await _run_bot_loop(table_id)
  ```
- 注意并发:如果玩家手动 `table:start_hand` 在定时器触发前,取消定时器避免重复开局

### 2.3 前端 HandEndModal 数据流

```
table:hand_end 到达
  ↓
TableShell / TablePage 的 useEffect 捕获
  ↓
setState({ showHandEnd: true, handEndData: data })
  ↓
<HandEndModal
  results={handEndData.results}
  players={state.players}  // 用于显示弃牌玩家
  nextHandIn={handEndData.next_hand_in}
  onClose={() => setShowHandEnd(false)}
  onLeave={() => { emit("lobby:leave_table"); navigate("/lobby"); }}
/>
  ↓
倒计时到 0 或用户点"跳过"
  ↓
onClose() → 模态框消失,如果 next_hand_in > 0,等后端自动开下局
```

## 3. UI 规范

### 3.1 HandEndModal 样式
- 遮罩:`bg-black/70 backdrop-blur-md`
- 卡片:`max-w-2xl rounded-panel border-2 border-gold bg-elev shadow-2xl`
- 赢家边框:`border-gold`,🏆 图标在名字前
- 输家/平局:`border-rim/50`
- 弃牌玩家:`opacity-50 text-text-lo`
- 倒计时:`text-sm text-text-lo`,红色警告当 < 2s

### 3.2 CreateTableModal 新增字段位置
- 在"座位数"和"初始筹码"之间插入"游戏模式"
- 限定局数的输入框只在选中"限定局数"时显示(条件渲染)
- 默认选中"连续模式"(向后兼容:不传字段时后端默认 continuous)

## 4. 技术实现要点

### 4.1 前端
- `HandEndModal.tsx`:新建,完整实现摊牌浮层
- `TableShell.tsx` 或 `TablePage.tsx`:订阅 `table:hand_end`,管理模态框显示状态
- `CreateTableModal.tsx`:第 2 步增加"游戏模式"单选 + 条件显示局数输入
- `types/common.ts` 或 `types/index.ts`:增加 `game_mode` / `max_hands` 字段到 `CreateTablePayload`

### 4.2 后端
- `backend/app/game/texas/engine.py`:
  - `__init__` 接收 `game_mode` / `max_hands`,存为实例字段
  - `_finish_hand()` 根据模式设置 `next_hand_in`
  - 增加 `hands_played` 计数器
- `backend/app/sio.py`:
  - `lobby_create_table` 从 payload 提取 `game_mode` / `max_hands` 传给引擎
  - emit `table:hand_end` 后,如果 `next_hand_in > 0`,启动 `asyncio.create_task(_auto_start_next_hand(table_id, delay))`
  - `_auto_start_next_hand` 异步函数:sleep → 检查 `can_start()` → `start_hand()` → broadcast
- `backend/app/game/brag/engine.py` / `guandan/engine.py`:同步实现(结构一致)

### 4.3 边界情况
- **玩家在倒计时期间离开**: 下局开始前检查 `can_start()`,人数不足则不开
- **房主在倒计时期间手动点"开始"**: 取消定时器,立即开局(幂等)
- **limited 模式打满后**: `next_hand_in=0`,前端显示"游戏已结束,共 10 局",只显示"返回大厅"按钮
- **弃牌玩家**: 不在 `results` 里,从 `state.players` 过滤出 `status="folded"` 的,灰色显示

## 5. 验收标准

### 5.1 摊牌浮层
- [ ] 德扑 4 人打到 showdown,弹出模态框,显示所有人底牌 + 手牌描述
- [ ] 赢家有金色边框 + 🏆,输家普通边框
- [ ] 弃牌玩家显示"弃牌"(灰色)
- [ ] 倒计时从 5s 倒数,到 0 自动关闭
- [ ] 点"跳过等待"立即关闭
- [ ] 点"返回大厅"回到 Lobby

### 5.2 多局模式
- [ ] 创建德扑桌,选"连续模式",2 bot + 自己,打完第 1 局 5s 后自动开第 2 局
- [ ] 创建德扑桌,选"限定 3 局",打满 3 局后 `next_hand_in=0`,不再自动开局
- [ ] 创建德扑桌,选"单局模式",打完一局停止,需手动点"开始游戏"
- [ ] 连续模式下,倒计时期间所有 bot 离开(人数不足),下局不开,显示"人数不足"

### 5.3 三玩法兼容
- [ ] 炸金花、掼蛋的 `hand_end` 事件也能正确显示摊牌浮层(手牌描述按各自玩法显示)

## 6. 开发提示词

### 前端 Agent
```
【任务】实现 #006 摊牌结算 UI + 多局模式(前端部分)

【背景】
- 需求文档: docs/features/006-hand-end-ui-multi-rounds.md
- 后端已推送 table:hand_end 事件(含 results / next_hand_in),前端未消费
- 用户希望看到摊牌时其他人的牌 + 手牌描述,以及自动开下一局

【要做什么】

任务 A: 新建 HandEndModal 组件
位置: frontend/src/components/HandEndModal.tsx
功能:
  - 接收 props: results(HandResult[]), players(PublicPlayer[]), nextHandIn(ms), onClose, onLeave
  - 全屏遮罩 + 居中卡片,显示所有参与者的底牌、手牌描述、盈亏金额
  - 赢家(amount > 0)金色边框 + 🏆,输家普通边框,弃牌玩家(不在 results 里)灰色
  - 倒计时显示(nextHandIn ms → 秒),到 0 自动 onClose()
  - 两个按钮:"跳过等待"(onClose)、"返回大厅"(onLeave)
  - 用 framer-motion AnimatePresence + fadeIn/fadeOut

任务 B: TableShell 订阅 table:hand_end
位置: frontend/src/components/TableShell.tsx
修改:
  - useEffect 订阅 "table:hand_end",收到时 setState 打开 HandEndModal
  - 在 TableShell return 的 JSX 末尾渲染 <HandEndModal> (条件渲染,showHandEnd 为 true 时)
  - onLeave 实现: emit("lobby:leave_table", {table_id}) + navigate("/lobby")

任务 C: CreateTableModal 增加游戏模式选择
位置: frontend/src/components/CreateTableModal.tsx 第 2 步
修改:
  - 增加 state: gameMode("single" | "continuous" | "limited"), maxHands(number)
  - 在座位数下方增加"游戏模式"radio 三选一,默认 continuous
  - 选中 limited 时显示"局数"输入框,默认 10
  - handleCreate() 构造 payload 时,传入 game_mode / max_hands 字段

任务 D: 类型定义
位置: frontend/src/types/common.ts 或 types/index.ts
修改:
  - CreateTablePayload 增加 game_mode? / max_hands?
  - HandResult 已在 types/texas.ts 等定义,检查是否完整(需要 cards / hand / amount / sid / name)

【验收】
- [ ] 德扑 2 人 + 2 bot 打到 showdown,弹出模态框,显示 4 人底牌 + 手牌("葫芦"/"一对"等)
- [ ] 赢家金色边框,输家普通边框,弃牌玩家灰色"弃牌"
- [ ] 倒计时 5→4→3→2→1→0 自动关闭
- [ ] 点"跳过"立即关闭,点"返回大厅"回 Lobby
- [ ] 创建桌时选"连续模式",打完一局 5s 后自动开下局(前端无需处理自动开局,后端会推 table:state)
- [ ] 创建桌时选"限定 3 局",打满 3 局后 next_hand_in=0,不再自动关闭模态框(显示"游戏结束")

【约定】
- HandEndModal 的 results 按 amount 降序排列(赢家在上)
- 弃牌玩家从 players 里过滤:不在 results 里 且 status="folded"
- 倒计时 < 2s 时文字变红色警告
- 提交 message: feat(frontend): #006 摊牌结算 UI + 多局模式配置
```

### 后端 Agent
```
【任务】实现 #006 多局模式(后端部分)

【背景】
- 需求文档: docs/features/006-hand-end-ui-multi-rounds.md  
- 前端已实现摊牌 UI,后端需支持游戏模式(单局/连续/限定局数)
- table:hand_end 事件已 emit,需根据模式设置 next_hand_in 并自动开下局

【要做什么】

任务 A: 引擎增加游戏模式字段
位置: backend/app/game/texas/engine.py
修改:
  - __init__ 增加参数: game_mode="continuous", max_hands=None
  - 存为实例字段: self.game_mode, self.max_hands, self.hands_played=0
  - _finish_hand() 末尾根据模式计算 next_hand_in:
    * single → 0
    * continuous → 5000 if can_start() else 0
    * limited → 已打满(hands_played >= max_hands) ? 0 : (5000 if can_start() else 0)
  - _finish_hand() 开头 self.hands_played += 1 (仅 continuous/limited 计数)
  - get_hand_end_payload() 使用计算好的 next_hand_in

任务 B: sio.py 自动开下局
位置: backend/app/sio.py
修改:
  - lobby_create_table: 从 data 提取 game_mode / max_hands,传给引擎构造函数
  - _broadcast_table_state 之后(emit table:hand_end 之后),如果 engine.is_hand_over() and next_hand_in > 0:
      asyncio.create_task(_auto_start_next_hand(table_id, next_hand_in))
  - 新增异步函数 _auto_start_next_hand(table_id, delay_ms):
    * await asyncio.sleep(delay_ms / 1000.0)
    * engine = lobby.get_table(table_id)
    * if engine and engine.can_start() and not engine.hand_in_progress:
        engine.start_hand()
        await _broadcast_table_state(table_id)
        await _run_bot_loop(table_id)

任务 C: 同步到其他引擎
位置: backend/app/game/brag/engine.py, backend/app/game/guandan/engine.py
修改: 同 texas 引擎,增加 game_mode / max_hands / hands_played 逻辑

任务 D: 单元测试
位置: backend/tests/test_game_modes.py (新建)
覆盖:
  - test_single_mode: 打完一局 next_hand_in=0,不自动开
  - test_continuous_mode: 打完一局 next_hand_in=5000,模拟 5s 后 can_start=True 自动开
  - test_limited_mode: max_hands=3,打满 3 局后 next_hand_in=0,第 4 局不开
  - test_continuous_insufficient_players: 打完一局后 players 不足,next_hand_in=0

【验收】
- [ ] pytest backend/tests/test_game_modes.py 全绿
- [ ] 创建德扑桌(game_mode=continuous),打完一局 5s 后自动 start_hand,emit table:state (phase=preflop)
- [ ] 创建德扑桌(game_mode=limited, max_hands=2),打满 2 局后 hand_end.next_hand_in=0
- [ ] 创建德扑桌(game_mode=single),打完一局 hand_end.next_hand_in=0,需手动 start_hand

【约定】
- 默认 game_mode="continuous"(向后兼容,前端不传字段时走连续)
- _auto_start_next_hand 不要 block 其他事件,用 create_task 异步
- 如果用户手动 start_hand 在定时器触发前,engine.hand_in_progress=True 会阻止重复开局
- 提交 message: feat(backend): #006 多局模式(single/continuous/limited)
```

## 7. 关联

- 依赖: [bugfix-create-stuck-card-display](./bugfix-create-stuck-card-display.md) 必须先修(牌面显示)
- 后续: M4 UI 精修(动效、音效)可以增强摊牌浮层的动画效果
