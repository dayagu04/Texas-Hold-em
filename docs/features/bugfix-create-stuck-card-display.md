# Bug: 创建房间卡"创建中" + 牌面显示"?"

> **报告**: 2026-06-19 用户反馈  
> **影响**: 创建房间后模态框不跳转 + 游戏中看不清牌  
> **优先级**: 🟡 P1(影响体验但有 workaround)

## 1. 问题 A: 创建房间后卡在"创建中"

### 现象
用户点"创建房间" → 后端成功创建 → 前端模态框永久显示"创建中...",不跳转到牌桌页。刷新后大厅能看到房间已存在。

### 根因
[frontend/src/components/Lobby.tsx:222-224](../../frontend/src/components/Lobby.tsx#L222):
```tsx
<CreateTableModal
  onClose={() => setShowCreateModal(false)}
  onCreated={(id) => {
    navigate(`/table/${id}`);  // ← 没有 setShowCreateModal(false)
  }}
/>
```

**`onCreated` 是内联箭头函数 → 每次 Lobby 渲染都是新引用**。

[CreateTableModal.tsx:39-48](../../frontend/src/components/CreateTableModal.tsx#L39):
```tsx
useEffect(() => {
    const off = subscribe("lobby:joined", (data) => {
      onCreated(data.table_id);
    });
    return off;
  }, [subscribe, onCreated]);  // ← onCreated 在依赖数组里
```

**执行序列(触发 bug 的时序)**:
1. 用户点"创建" → `setIsCreating(true)` 调度 re-render
2. 立即 `emit("lobby:create_table")`  
3. React flush:Lobby re-render → `onCreated` 新引用 → CreateTableModal 的 useEffect cleanup 运行(`off()`)
4. **这一帧内,旧订阅已解除,新订阅还没建立**
5. 后端极快响应(localhost,1-2ms)→ `lobby:joined` 事件到达
6. **Socket.IO 事件队列里没有 handler → 事件丢失**
7. useEffect 继续:新 `subscribe()` 建立,但事件已过去
8. 模态框永久等待 `onCreated` 调用 → 卡"创建中"

**React 严格模式放大了这个问题**:开发时 useEffect 跑两遍(mount → cleanup → mount),生产环境跑一遍但 `onCreated` 引用不稳定仍会触发。

### 修复
在 Lobby.tsx 用 `useCallback` 包裹 `onCreated`,让引用稳定 → useEffect 不频繁重跑 → 事件不丢。

```tsx
const handleCreated = useCallback((id: string) => {
  navigate(`/table/${id}`);
  setShowCreateModal(false);  // 显式关闭模态框(防御性,navigate 会卸载但加上更健壮)
}, [navigate]);

<CreateTableModal
  onClose={() => setShowCreateModal(false)}
  onCreated={handleCreated}
/>
```

---

## 2. 问题 B: 扑克牌显示"?"而非花色符号

### 现象
所有扑克牌显示为 rank + "?" (如 "A?", "2?"),花色符号不显示。

### 根因

**后端发送 suit 为小写**: [backend/app/game/cards.py:8](../../backend/app/game/cards.py#L8)
```python
SUITS = ["s", "h", "d", "c"]  # 小写
```

**前端期待 suit 为大写**: [frontend/src/components/CardSprite.tsx:15-22](../../frontend/src/components/CardSprite.tsx#L15)
```tsx
const SUIT_SYMBOL: Record<string, string> = {
  S: "♠",  // 大写 key
  H: "♥",
  D: "♦",
  C: "♣",
  J: "🃏",
};
// ...
const suitSymbol = SUIT_SYMBOL[card.suit] ?? "?";  // 小写 key 找不到 → fallback "?"
```

`card.suit = "s"` → `SUIT_SYMBOL["s"]` = `undefined` → fallback `"?"` → 显示"?"。

### 修复
前端 `SUIT_SYMBOL` 改用**小写 key**,与后端一致:
```tsx
const SUIT_SYMBOL: Record<string, string> = {
  s: "♠",  // ← 改小写
  h: "♥",
  d: "♦",
  c: "♣",
  j: "🃏",
};
```

**为什么前端改而不是后端改**:
- 后端 `cards.py` 被 evaluator 大量依赖,改成大写会破坏牌型判定逻辑
- 前端改只动一个组件,影响面小

---

## 3. 验收

### 问题 A
- [ ] 创建德扑桌 → 立即跳转到牌桌页(不卡"创建中")
- [ ] 创建掼蛋桌 + 2 个 bot → 立即跳转
- [ ] React strict mode 开启时仍正常(开发环境默认)

### 问题 B  
- [ ] 德扑手牌显示 "A♠ K♥"(而非 "A? K?")
- [ ] 公共牌 5 张都有花色符号
- [ ] 红心/方块显示红色,黑桃/梅花显示黑色(CardSprite 已有 SUIT_COLOR 配置)

---

## 4. 关联
- 前置: [bugfix-stale-player-no-actions](./bugfix-stale-player-no-actions.md) 修了 join 重连,create 流程遗漏了 onCreated 稳定性
- 后续: #006 需求(摊牌 UI、结算显示)依赖牌面正确显示,本 bug 必须先修
