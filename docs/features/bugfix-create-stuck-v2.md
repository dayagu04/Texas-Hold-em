# bugfix-create-stuck-v2: 创建房间永不跳转 + 花色点数显示异常

> **报告**: 2026-06-19 用户反馈  
> **影响**: 无法通过创建流程进入牌桌 + 牌面显示错误  
> **优先级**: 🔴 P0(阻断核心流程)

## 1. 问题 A: 创建房间后永久卡"创建中"

### 现象
用户日志:
```
[socket] connected, socket.id: CWXWMj5AsAgurv5zAAAD
```
Socket **已连接**，但点"创建"后模态框永久显示"创建中..."，不跳转。刷新后大厅能看到房间已创建成功。

### 已尝试修复（均无效）
1. ✅ Lobby.tsx 用 useCallback 稳定 onCreated 引用 → 无效
2. ✅ CreateTableModal useEffect deps 正确 `[subscribe, onCreated]` → 仍卡

### 根因分析

**嫌疑点 1: 后端 emit 了但前端没收到**
- 后端执行到 `await sio.emit("lobby:joined", {...}, room=sid)` 但 socket.io 的 room join 有问题
- 或 emit 的 sid 与前端 socket.id 不一致

**嫌疑点 2: 前端订阅建立太晚**
- CreateTableModal 挂载时才订阅，如果挂载慢于后端响应(极低概率但不能排除)
- React 18 并发渲染可能延迟 useEffect 执行

**嫌疑点 3: 事件名不匹配**
- 前端订阅 `"lobby:joined"`，后端 emit `"lobby:joined"` — 看起来一致
- 但 socket.io 版本/配置问题可能导致静默失败

### 诊断方案

在后端 `lobby_create_table` 的 emit 前后加日志:
```python
print(f"[create_table] BEFORE emit lobby:joined to sid={sid}, table={table_id}")
await sio.emit("lobby:joined", {"table_id": table_id, "your_seat": 0}, room=sid)
print(f"[create_table] AFTER emit")
```

在前端 CreateTableModal useEffect 加日志:
```ts
const off = subscribe("lobby:joined", (data) => {
  console.log("[CreateTableModal] received lobby:joined:", data);
  onCreated(data.table_id);
});
console.log("[CreateTableModal] subscribed to lobby:joined");
```

**预期**:
- 后端看到 BEFORE + AFTER → emit 已执行
- 前端看到 "subscribed" 但没有 "received" → 事件丢失，socket.io 传输问题
- 前端根本没 "subscribed" → useEffect 没跑，React 渲染问题

---

## 2. 问题 B: 花色点数仍然显示不全

### 现象
用户报告 #007 修复后**仍然**有牌显示异常（花色"?"或点数"?"）。

### 已尝试修复（均无效）
1. ✅ CardSprite SUIT_SYMBOL 改小写 key + toLowerCase 归一 → 无效
2. ✅ 兜底符号改 🂠 → 仍看到异常
3. ✅ rank=1 防御分支 → 仍有点数"?"

### 可能根因

**后端发送的数据格式异常**:
- brag/guandan 引擎的 `card.to_dict()` 返回的 suit/rank 值不在预期范围
- 或某些特殊牌型(大小王/癞子)的数据结构不同

**前端渲染路径遗漏**:
- SeatCard / TexasBoard 等组件可能直接用 `card.code` 而非 CardSprite
- 或有其他组件渲染牌但没走 CardSprite

### 诊断方案

**后端**: 在 cards.py 的 `to_dict()` 加断言:
```python
def to_dict(self) -> dict:
    assert self.suit in ["s", "h", "d", "c"], f"Invalid suit: {self.suit}"
    assert 2 <= self.rank <= 14, f"Invalid rank: {self.rank}"
    return {"rank": self.rank, "suit": self.suit, "code": self.code}
```

**前端**: 在 CardSprite 入口加日志:
```tsx
if (!SUIT_SYMBOL[suitKey]) {
  console.warn(`[CardSprite] Unknown suit: "${card.suit}" (key: "${suitKey}")`);
}
if (rankLabel === "?") {
  console.warn(`[CardSprite] Unknown rank: ${card.rank}`);
}
```

**预期**: 
- 如果后端断言触发 → 数据源问题(引擎 bug)
- 如果前端 warn 触发 → 记录具体的异常值,补充到 SUIT_SYMBOL

---

## 3. 修复提示词(给后端 Agent)

```
【紧急任务】诊断创建卡住问题 - 后端日志注入

【背景】
用户 socket 已连接(socket.id: CWXWMj5AsAgurv5zAAAD),但创建房间后前端永不收到 lobby:joined。
需要验证后端是否执行了 emit,以及 emit 的目标 sid 是否正确。

【要做什么】

在 backend/app/sio.py 的 lobby_create_table handler 增加 3 处日志:

位置 1: handler 入口(~line 212):
  print(f"[DEBUG create_table] sid={sid}, name={sess.get('name')}, data={data}")

位置 2: emit lobby:joined 之前(~line 256):
  print(f"[DEBUG] BEFORE emit lobby:joined: sid={sid}, table={table_id}, room list={list(sio.manager.rooms.get(sid, set()))}")

位置 3: emit 之后:
  print(f"[DEBUG] AFTER emit lobby:joined")

【验收】
用户点创建后,后端终端应看到:
  [DEBUG create_table] sid=xxx, name=用户名, data={...}
  [DEBUG] BEFORE emit: sid=xxx, table=t-xxx, room list=[...]
  [DEBUG] AFTER emit

如果只有第一行没后两行 → 中途 return 或异常
如果有 BEFORE 没 AFTER → emit 卡死(极罕见)
如果都有但前端没收到 → socket.io room 机制问题

提交 message: debug: 创建卡住问题诊断日志注入
```

---

## 4. 修复提示词(给前端 Agent)

```
【紧急任务】诊断创建卡住 + 花色点数异常 - 前端日志注入

【背景】
问题 A: 创建房间后永不收到 lobby:joined,模态框卡"创建中"
问题 B: 部分牌仍显示异常花色/点数

【要做什么】

任务 A: CreateTableModal 订阅日志
位置: frontend/src/components/CreateTableModal.tsx useEffect (~line 48)
修改:
  useEffect(() => {
    console.log("[DEBUG CreateTableModal] subscribing to lobby:joined");
    const off = subscribe("lobby:joined", (data) => {
      console.log("[DEBUG CreateTableModal] ✅ RECEIVED lobby:joined:", data);
      onCreated(data.table_id);
    });
    console.log("[DEBUG CreateTableModal] ✅ subscribed, off function ready");
    return off;
  }, [subscribe, onCreated]);

任务 B: CardSprite 异常值日志
位置: frontend/src/components/CardSprite.tsx (~line 68-70)
修改:
  const suitKey = (card.suit || "").toLowerCase();
  const suitSymbol = SUIT_SYMBOL[suitKey] ?? "🂠";
  const suitColor = SUIT_COLOR[suitKey] ?? "text-text-lo";

  // 诊断日志
  if (!SUIT_SYMBOL[suitKey] && card.suit) {
    console.warn(`[CardSprite] ⚠️ Unknown suit: original="${card.suit}", key="${suitKey}", rank=${card.rank}`);
  }
  if (rankLabel === "?") {
    console.warn(`[CardSprite] ⚠️ Unknown rank: ${card.rank}, suit=${card.suit}`);
  }

【验收】
问题 A:
- 打开控制台,点创建房间
- 应看到 "[DEBUG CreateTableModal] subscribing..." 和 "subscribed"
- 如果看到 "RECEIVED",说明事件到了,onCreated 没执行 → 检查 navigate
- 如果没看到 "RECEIVED",配合后端日志定位

问题 B:
- 进入牌桌,看到异常牌时控制台会打 warn
- 记录 warn 里的 suit/rank 原始值,反馈给 PM

提交 message: debug: 创建卡住 + 花色异常诊断日志注入
```

---

你现在调用**两个** Agent(前端+后端)注入这些日志,然后:
1. 后端终端 + 前端控制台的日志都截图给我
2. 我根据日志精准锁定 bug,立即修复
