# PM 交接文档 — 2026-06-19

> 交接对象:接手「多玩法扑克平台」的下一任 PM(AI Agent)。
> 本文聚焦**当前两个未解决的 bug**,以及已经铺好的调试设施。
> 你的职责是**产品经理,不写代码**——只诊断、写需求/修复提示词,派给前端/后端 Agent 执行。

---

## 1. 项目速览

- **后端**:FastAPI + Socket.IO,启动入口 `app.main:sio_app`,端口 **8000**
  - 启动:`./start-backend.sh`(根目录)
  - 健康检查:`curl http://localhost:8000/api/health`
  - 本地需要 `backend/allowed_users.json`(白名单登录)
- **前端**:React 19 + TS + Vite + Tailwind,端口 **5166**
  - 启动:`cd frontend && npm run dev`
  - **Vite 代理已指向 8000**(`frontend/vite.config.ts`,曾误配 7999 已修)
- **三种玩法**:德州(texas)/掼蛋(guandan)/炸金花(brag),引擎在 `backend/app/engines/`
- **协议**:Socket.IO 冒号事件
  - 上行:`lobby:create_table` / `lobby:join_table` / `table:start_hand` / `table:action`
  - 下行:`lobby:joined` / `table:state`(公共,广播) / `table:private`(私密,定向)

---

## 2. 调试设施(已就绪,直接用)

**所有前后端日志统一汇总到根目录 `backend_debug.log` 一个文件**,带 `[HH:MM:SS.mmm]` 时间戳。

- 后端:`backend/app/logger.py` 的 `log()`,写文件 + 控制台,每行 flush。
  - `sio.py` 全程已打点:`[connect]` `[create_table]` `[join_table]` `[broadcast]` 等。
- 前端:`frontend/src/utils/debug.ts` 的 `debugLog()`,console + POST `/api/debug/log` 推到后端,前缀 `[FRONTEND]`。
  - 已打点:socket 生命周期、CreateTableModal、TablePage、TableShell、CardSprite。
- 收集端点:后端 `POST /api/debug/log`(`backend/app/main.py`)。

**用法**:让用户复现 → 你直接 `Read backend_debug.log` 看时序,不用让用户复制 console。

---

## 3. 待解决 Bug ①:创建房间卡"创建中"(高优先级)

### 现象
点"创建房间"后一直卡"创建中/加载中",**刷新页面后却能进入房间**。

### 真正的根因(已用日志锁定,推翻此前所有猜测)
**不是** CreateTableModal 的订阅时机问题,**也不是** onCreated 回调问题。日志(`backend_debug.log` line 1200-1231)证明这条链路全部成功:
```
calling onCreated → onCreated returned → fallback navigate → unmount
```
跳转**确实发生了**。问题在跳转后的目标页 **TablePage**:

> `frontend/src/components/TablePage.tsx` 挂载后**只被动 `subscribe("table:state")`,从不主动请求状态**。
>
> 时序竞争:后端在创建桌子时(`lobby_create_table`)**立即广播了一次** `table:state(waiting)`,但那一刻前端还停留在大厅页,TablePage 尚未挂载、尚未订阅 → **这次广播被错过**。
> TablePage 挂载完成后开始等待下一次广播,但 `waiting` 状态在 host 点"开始游戏"前不会再自动广播 → `state` 永远是 `null` → 卡在 `if (!state) return 加载中`(TablePage.tsx:61)。

**为什么刷新能进**:刷新触发 socket 重连,后端 `connect` 钩子检测到 reconnect 会**主动重推** `table:state`(见 sio.py `connect` 的 RECONNECT 分支),此时 TablePage 已订阅好,于是收到、渲染成功。

### 后端现状
`sio.py` 事件列表里**没有**"请求当前状态"的事件(无 `table:sync`/`table:request_state`)。只有 `lobby:join_table`。

### 修复方向(供新 PM 写提示词时参考,二选一)
- **方案 A(推荐,改后端 + 前端)**:新增轻量事件 `table:sync`(或复用 `lobby:join_table` 的幂等路径)。前端 TablePage 挂载后 emit 一次,后端收到后**对该 sid 定向重推**一次 `table:state` + `table:private`。
- **方案 B(纯前端)**:TablePage 挂载后直接 emit `lobby:join_table {table_id}`。但需先确认后端 `lobby_join_table` 对**已在座的同一玩家**是否幂等(会不会重复占座/报错)——看 sio.py:273 的 STALE/NEW SEAT 分支。

> 注意:别再去改 CreateTableModal 了,那条链路是好的。根因在 TablePage 的首次状态获取。

---

## 4. 待解决 Bug ②:牌面花色/点数显示不全(中优先级)

### 现象
牌桌上扑克牌的花色或点数"显示不全"。

### 已排除的可能(用日志确认)
后端推送的牌面数据**100% 正确**。`backend_debug.log` 里几百条 `[CardSprite] render` 显示:
```
{"suit":"h","rank":4,"suitKey":"h","suitSymbol":"♥","rankLabel":"4"}
{"suit":"s","rank":14,"suitKey":"s","suitSymbol":"♠","rankLabel":"A"}
{"suit":"d","rank":2,...♦...} {"suit":"c","rank":8,...♣...}
```
- 花色映射全对(♠♥♦♣),**无一条 `Unknown suit/rank`**。
- 点数 2–10/J/Q/K/A 全对。
- 已加字体兜底(`CardSprite.tsx` suit span 的 inline `fontFamily` 覆盖 macOS/Win/Linux)+ `leading-none`。

### 结论:这是纯前端视觉/CSS 问题,不是数据问题
数据层无需再查。**必须拿到用户的视觉证据才能定位**,可能原因:
1. 卡片尺寸偏小(当前 `h-20 w-14` ≈ 80×56px)导致点数+花色挤不下。
2. CSS 裁剪/overflow / 定位重叠遮挡。
3. 颜色对比不足(某花色色值接近卡面底色 `#f5efe0`)。
4. 浏览器缩放。

### 新 PM 下一步动作
**先让用户提供证据**,再写修复提示词:
- F12 → Elements,点一张"显示不全"的牌,看 `<span>` 实际内容与计算样式(字号/颜色/overflow)。
- 或直接截图牌桌。

不要在没有视觉证据前盲目改 CSS(此前已多轮盲改未中)。

---

## 5. 其他已知项

- **重连/重进房间**:用户曾反馈"刷新加入房间需退出再进才能开始"。这与 Bug ① 同源(首次进房拿不到 state)。修好 Bug ① 后回归验证此项。
- **bot 偶发错误**:`backend_debug.log` 见 `[bot_error] ... raise: 加注至少到 40`——bot 加注额低于最小加注被引擎拒。已被 try/except 隔离(不会崩主流程),但属于 bot 策略 bug,低优先级,可后续单开任务。
- **stale-player 修复**:见 memory「Stale player bugfix」,前后端已提交(c2c5bab + 39f43cd)等验收。

---

## 6. 工作纪律(沿用)

- PM **不写业务代码**。只读代码/日志做诊断,产出提示词派给子 Agent。
- 子 Agent 完成后**不要 push**,等 PM(你)验收。
- 改完让用户复现 → 你 `Read backend_debug.log` 验证 → 通过才收尾。
- 中文沟通、中文文档。
- 端口:后端 8000 / 前端 5166。代理配置勿再误改回 7999。

---

## 7. 相关文件索引

| 用途 | 路径 |
|------|------|
| 创建房间弹窗(链路 OK,勿动) | `frontend/src/components/CreateTableModal.tsx` |
| **牌桌页(Bug ① 根因在此)** | `frontend/src/components/TablePage.tsx` |
| 牌组件(Bug ② 视觉,数据已确认 OK) | `frontend/src/components/CardSprite.tsx` |
| 后端 socket 事件 | `backend/app/sio.py` |
| 后端日志工具 | `backend/app/logger.py` |
| 前端日志工具 | `frontend/src/utils/debug.ts` |
| 统一日志输出 | `backend_debug.log`(根目录) |
