# M4 里程碑 - UI 精修与稳定性

> **版本**: v1.0  
> **日期**: 2026-06-19  
> **负责**: 前端 + 后端并行  
> **前置**: M1-M3 已完成，联调已通

---

## 1. 目标

**M4 定位**（PRD §6）:
> UI 精修（动效 / 音效 / 暗金主题） + 断线重连

**核心交付**:
- 前端：6 种核心动效 + 倒计时红色警告 + aria-live 无障碍支持
- 后端：30s 超时自动 fold/pass + 断线重连状态恢复
- 视觉：暗金主题全面应用（当前已部分应用）

**验收标准**:
- 前端动效流畅（60fps），无掉帧
- 后端超时机制准确（±500ms）
- 断线重连后能完整恢复到当前局面

---

## 2. 前端任务清单

### 2.1 核心动效（6 种）

参考 [UI-DESIGN.md §8](../design/UI-DESIGN.md)

| 动效 | 触发时机 | 实现要点 | 优先级 |
|------|----------|----------|--------|
| **发牌动画** | `hand` 开始 | 从牌堆飞向座位，单张 220ms，错峰 80ms | P0 |
| **翻公共牌** | flop/turn/river | y 轴 3D rotate，360ms | P0 |
| **筹码入池** | call/raise/all_in | 沿曲线轨迹飞入，320ms | P0 |
| **赢家光晕** | `table:hand_end` | 金色径向渐变脉动 1 次，1200ms | P1 |
| **行动倒计时** | 轮到我 | 进度条 25s，最后 5s 红色警告 | P0 |
| **Bot 思考** | bot 回合 | 座位卡上 `...` 闪烁，1.5-4s | P2 |

#### 实现工具
- 简单动效：CSS `transition` / `@keyframes`
- 复杂轨迹：`framer-motion`（已安装）

#### 关键组件

**1. 发牌动画**
```tsx
// frontend/src/components/DealAnimation.tsx
import { motion } from "framer-motion";

export function DealAnimation({ from, to, delay }: Props) {
  return (
    <motion.div
      className="absolute w-12 h-16 bg-card"
      initial={{ x: from.x, y: from.y, scale: 0.8 }}
      animate={{ x: to.x, y: to.y, scale: 1 }}
      transition={{ duration: 0.22, delay }}
    />
  );
}
```

**2. 倒计时进度条（含红色警告）**
```tsx
// frontend/src/components/Countdown.tsx 改造
export function Countdown({ deadline }: Props) {
  const remaining = useCountdown(deadline);
  const isUrgent = remaining <= 5;
  
  return (
    <div className={`countdown ${isUrgent ? 'urgent' : ''}`}>
      <div className="bar" style={{ width: `${(remaining / 25) * 100}%` }} />
      <span>{remaining}s</span>
    </div>
  );
}
```

**CSS**:
```css
.countdown.urgent .bar {
  background: linear-gradient(90deg, var(--color-error), var(--color-warning));
  animation: pulse 0.5s infinite;
}
```

**3. 筹码入池动画**
```tsx
// frontend/src/components/ChipFlyIn.tsx
import { motion } from "framer-motion";

export function ChipFlyIn({ from, to, amount }: Props) {
  return (
    <motion.div
      className="chip"
      initial={{ x: from.x, y: from.y }}
      animate={{ x: to.x, y: to.y }}
      transition={{ 
        duration: 0.32,
        ease: [0.4, 0, 0.2, 1] // cubic-bezier
      }}
    >
      {amount}
    </motion.div>
  );
}
```

### 2.2 无障碍支持（aria-live）

**要求**（UI-DESIGN.md §9）:
- 关键动作用 `aria-live="polite"` 朗读

**实现**:
```tsx
// frontend/src/components/TableShell.tsx
export function TableShell() {
  const [announcement, setAnnouncement] = useState("");
  
  useEffect(() => {
    const off = subscribe("table:state", (state) => {
      const lastLog = state.log[state.log.length - 1];
      if (lastLog) {
        setAnnouncement(`${lastLog.name} ${lastLog.action} ${lastLog.detail || ""}`);
      }
    });
    return off;
  }, []);
  
  return (
    <div>
      <div aria-live="polite" className="sr-only">{announcement}</div>
      {/* 桌面内容 */}
    </div>
  );
}
```

**CSS**:
```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
```

### 2.3 暗金主题完善

**检查点**:
- [ ] 所有按钮使用 `--color-gold` 高亮色
- [ ] 卡片边框使用 `--color-border-accent`
- [ ] 赢家光晕使用 `radial-gradient(circle, var(--color-gold) 0%, transparent 70%)`
- [ ] 颜色对比 ≥ AA（金色文字不放在浅色背景上）

**验证工具**: Chrome DevTools → Lighthouse → Accessibility

### 2.4 验收标准

- [ ] 发牌动画流畅，无掉帧（Chrome DevTools → Performance，FPS ≥ 55）
- [ ] 倒计时最后 5s 变红色且有脉动效果
- [ ] 筹码入池沿曲线轨迹，不是直线
- [ ] `table:hand_end` 后赢家座位有金色光晕 1.2s
- [ ] 屏幕阅读器能朗读 "Alice raised to 100"
- [ ] Lighthouse Accessibility 得分 ≥ 90

---

## 3. 后端任务清单

### 3.1 超时自动 fold/pass（P0）

**要求**（HANDOFF.md §M4）:
- 玩家轮到但 30s 未操作 → 自动 `auto-fold`（德扑/炸金花）或 `auto-pass`（掼蛋）

**实现位置**: `backend/app/sio.py`

**设计方案**:

```python
# sio.py 全局变量
turn_timers: dict[str, asyncio.Task] = {}  # table_id -> timeout task

async def _start_turn_timer(table_id: str, sid: str, timeout: int = 30):
    """启动回合超时计时器"""
    # 取消旧计时器（如果有）
    if table_id in turn_timers:
        turn_timers[table_id].cancel()
    
    async def timeout_handler():
        await asyncio.sleep(timeout)
        engine = lobby.get_table(table_id)
        if not engine or engine.current_turn != sid:
            return  # 已不是该玩家回合
        
        # 自动行动
        if engine.game_type in ["texas", "brag"]:
            action = "fold"
        elif engine.game_type == "guandan":
            action = "pass"
        
        print(f"⏱️  [timeout] {sid} auto-{action} after {timeout}s", flush=True)
        await engine.handle_action(sid, action, {})
        await _broadcast_table_state(table_id)
    
    turn_timers[table_id] = asyncio.create_task(timeout_handler())

# 在 _broadcast_table_state 中调用
async def _broadcast_table_state(table_id: str):
    engine = lobby.get_table(table_id)
    # ... 广播状态 ...
    
    # 如果有当前回合玩家，启动计时器
    if engine.current_turn:
        player = engine.players[engine.current_turn]
        if not player.is_bot:  # 只对真人设超时
            await _start_turn_timer(table_id, engine.current_turn, timeout=30)
```

**验收**:
- [ ] 真人玩家 30s 未操作自动 fold
- [ ] 后端控制台打印 `⏱️  [timeout] <sid> auto-fold after 30s`
- [ ] Bot 不触发超时（Bot 有自己的决策延迟）

### 3.2 断线重连状态恢复（已实现，验证）

**要求**: 30s 内重连自动恢复到原座位与手牌视图

**已有实现**: `backend/app/sio.py:32-96` 的 `connect` 钩子

**验证方法**:
1. 创建房间 + 开局
2. 关闭浏览器 tab（或刷新页面）
3. 30s 内重新登录同一用户名
4. 检查是否回到原座位，能看到手牌

**验收**:
- [ ] 30s 内重连恢复座位 + 手牌
- [ ] 后端控制台打印 `[reconnect] <old_sid> -> <new_sid> (Alice)`
- [ ] 前端收到 `table:state` 和 `table:private` 事件

### 3.3 验收标准

- [ ] 后端测试通过：`pytest backend/tests/ -q` → 22 passed
- [ ] 超时机制准确（±500ms）
- [ ] 断线重连流畅（无需重新创建房间）

---

## 4. 端到端验收路径

### 4.1 动效验收

1. 启动双端（后端 + 前端）
2. 登录 → 创建德扑房间 + 3 bot
3. 开局后观察：
   - ✅ 发牌动画（从牌堆飞向座位）
   - ✅ 翻牌动画（flop 3 张翻面）
   - ✅ 筹码入池（call/raise 时飞入中央）
   - ✅ 倒计时进度条（最后 5s 变红）
   - ✅ 赢家光晕（一局结束时）

### 4.2 超时验收

1. 创建德扑房间 + 2 bot（你是玩家 1）
2. 开局后轮到你时**不操作**
3. 等待 30s
4. ✅ 自动 fold，后端打印 `⏱️  [timeout]`
5. ✅ 游戏继续（轮到下一位）

### 4.3 重连验收

1. 创建房间 + 开局
2. 刷新浏览器页面
3. 重新登录同一用户名
4. ✅ 回到原座位
5. ✅ 能看到手牌
6. ✅ 如果轮到你，倒计时继续

---

## 5. 技术要点

### 5.1 性能优化

**避免重渲染**:
```tsx
// 使用 React.memo 包裹动画组件
export const DealAnimation = React.memo(({ from, to }: Props) => {
  // ...
});
```

**节流状态更新**:
```tsx
// 倒计时每秒更新，而非每帧
const remaining = Math.ceil((deadline - Date.now()) / 1000);
```

### 5.2 动画时序

**发牌序列**:
```tsx
// 错峰发牌，每张延迟 80ms
{players.map((p, i) => (
  <DealAnimation key={p.sid} delay={i * 0.08} />
))}
```

**筹码 → 发牌 → 翻牌**:
```tsx
// 按顺序触发，总时长约 1.5s
useEffect(() => {
  if (stage === "FLOP") {
    setTimeout(() => setShowFlop(true), 800); // 等发牌完成
  }
}, [stage]);
```

### 5.3 错误处理

**动画中断**:
```tsx
// 如果组件卸载，清理定时器
useEffect(() => {
  const timer = setTimeout(...);
  return () => clearTimeout(timer);
}, []);
```

---

## 6. 里程碑完成标志

### 前端
- [ ] 6 种动效全部实现且流畅
- [ ] aria-live 朗读关键动作
- [ ] Lighthouse Accessibility ≥ 90
- [ ] 暗金主题颜色对比 ≥ AA

### 后端
- [ ] 30s 超时自动 fold/pass
- [ ] 断线重连状态恢复验证通过
- [ ] 测试覆盖率 ≥ 80%

### 联调
- [ ] 端到端验收路径全部通过
- [ ] 无控制台错误或警告
- [ ] 性能分析：FPS ≥ 55，无内存泄漏

---

## 7. 风险与对策

| 风险 | 对策 |
|------|------|
| 动画掉帧 | 使用 CSS `will-change`，限制同时动画元素 ≤ 10 个 |
| 超时计时器不准 | 使用 `asyncio.sleep` 而非 `time.sleep`，避免阻塞 |
| 重连后状态不一致 | 在 `connect` 钩子中完整推送 `table:state` + `table:private` |
| framer-motion 包体积大 | 按需导入：`import { motion } from "framer-motion"`，tree-shaking 自动优化 |

---

## 8. 参考文档

- [docs/design/UI-DESIGN.md](../design/UI-DESIGN.md) - 动效规范（§8）
- [docs/design/PRD.md](../design/PRD.md) - 里程碑定义（§6）
- [docs/onboarding/HANDOFF.md](../onboarding/HANDOFF.md) - 任务清单（M4 段）
- [docs/design/API-CONTRACT.md](../design/API-CONTRACT.md) - 事件契约

---

**PM 签发**: 2026-06-19  
**预计工时**: 前端 8-10h，后端 3-4h
