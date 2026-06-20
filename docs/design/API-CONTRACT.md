# API 契约

> ⚠️ **前后端的硬契约**。任何字段改动必须在此文档先行落地，再改代码。

## 0. 通用约定

- 时间戳：ISO 8601 UTC（`"2026-06-18T14:30:00Z"`）。
- 金额 / 筹码：整数，单位无量纲。
- ID：服务端生成 UUID v4 字符串。
- 错误：HTTP 4xx/5xx 返 `{ error: { code, message } }`；Socket.IO 用 `error` 事件 `{ code, message, context? }`。

---

## 1. REST API

### 1.1 健康检查
```
GET /api/health → 200 { "status": "ok", "version": "1.0.0" }
```

### 1.2 登录
```
POST /api/login
Body: { "name": "Alice" }
200 → { "token": "<jwt>", "name": "Alice" }
401 → { "error": { "code": "NOT_ALLOWED", "message": "用户不在白名单" } }
```

### 1.3 当前用户
```
GET /api/me      Authorization: Bearer <token>
200 → { "name": "Alice", "expires_at": "..." }
```

### 1.4 大厅快照（首次进入大厅前可用，之后走 socket 推送）
```
GET /api/lobby   Authorization: Bearer <token>
200 → { "tables": LobbyTable[] }
```

`LobbyTable`:
```ts
{
  id: string;
  name: string;
  game_type: "texas" | "guandan" | "brag";
  seats_taken: number;
  seats_total: number;
  has_bots: boolean;
  status: "waiting" | "playing";
  spectatable: boolean;
}
```

### 1.5 白名单管理（仅 admin）

> 配合 #008，白名单从 `allowed_users.json` 迁入 SQLite `users` 表（见 §1.6）。以下接口让管理员在线增删白名单，无需改 JSON 重启。

所有接口都走 `Authorization: Bearer <token>` 鉴权，并额外要求调用者 `is_admin = true`。**非 admin 一律返回 403** `{ "error": { "code": "FORBIDDEN", "message": "需要管理员权限" } }`。

```
GET /api/admin/whitelist        Authorization: Bearer <token>(admin)
200 → { "users": WhitelistUser[] }
403 → FORBIDDEN

WhitelistUser = {
  name: string;
  allowed: boolean;     // 是否在白名单（可登录）
  is_admin: boolean;
  created_at: string | null;  // ISO 8601 UTC
  points: number;       // 顺带回带，admin 页可展示
}
```

```
POST /api/admin/whitelist       Authorization: Bearer <token>(admin)
Body: { "name": "Bob", "is_admin"?: false }   // is_admin 缺省 false
200 → { "user": WhitelistUser }               // 新增或将已存在用户重新置为 allowed
400 → { "error": { "code": "INVALID_INPUT", "message": "name 不能为空" } }
403 → FORBIDDEN
```
- 幂等：name 已存在则把 `allowed` 置 true（不报错），可选地更新 `is_admin`。
- name 两端空白由服务端 strip。

```
DELETE /api/admin/whitelist/{name}   Authorization: Bearer <token>(admin)
200 → { "removed": "Bob" }
400 → { "error": { "code": "INVALID_INPUT", "message": "不能移除自己" } }
403 → FORBIDDEN
404 → { "error": { "code": "USER_NOT_FOUND", "message": "用户不存在" } }
```
- **不删行**，只把 `allowed` 置 false（保留积分/对局历史）。被移除者已签发的 token 在过期前仍有效，但无法再次登录。
- 不能移除自己（`name == 当前 admin`）；不建议移除最后一个 admin（前端禁用按钮即可，服务端可不强校验）。

### 1.6 用户表新增字段（`users`）

配合 #008，`users` 表新增两列：

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `allowed` | INTEGER(0/1) | 1 | 是否在白名单。登录时校验此字段，取代旧的 `allowed_users.json` 读取。 |
| `is_admin` | INTEGER(0/1) | 0 | 是否管理员。仅 admin 可调 §1.5 接口。 |

迁移规则（首次启动）：读 `allowed_users.json`，为每个名字 upsert 一行并置 `allowed=1`；**列表中第一个用户置 `is_admin=1`** 作为初始管理员。迁移完成后 JSON 不再被读取（保留作备份）。

`GET /api/me` 响应同步新增 `is_admin: boolean` 字段，前端据此决定是否显示「白名单管理」入口。

### 1.7 积分榜（#011）

```
GET /api/leaderboard?metric=points|net|winrate&limit=10
Authorization: Bearer <token>
200 → { "metric": "points", "entries": LeaderboardEntry[] }
```
- `metric` 缺省 `points`；非法值回退 `points`。
- `limit` 缺省 10，范围 1..50（服务端 clamp）。
- 仅统计真人（`is_bot` 不入 users 表，天然排除）；`winrate` 需 `hands_played >= 10` 才入榜（样本太小不参与排名），不足者过滤掉。

```ts
LeaderboardEntry = {
  rank: number;          // 1-based，并列时同名次（可选，简单实现按行号即可）
  name: string;
  avatar: string | null; // 裸路径，前端自行拼 ?v=
  points: number;
  hands_played: number;
  hands_won: number;
  total_net: number;
  winrate: number;       // hands_won / hands_played，0..1，两位小数
}
```
- 排序键：`points` → points DESC；`net` → total_net DESC；`winrate` → winrate DESC。

### 1.8 牌局回放（#013）

> 配合 #013。需后端新增 `hand_actions` 表持久化逐 action 序列（建表与埋点见 `docs/features/013-hand-replay.md`）。本接口在该表就绪后提供。

```
GET /api/hand/{hand_id}/replay   Authorization: Bearer <token>
200 → ReplayData
403 → { "error": { "code": "FORBIDDEN", "message": "无权查看该局回放" } }
404 → { "error": { "code": "HAND_NOT_FOUND", "message": "对局不存在" } }
```

- **权限**：仅该局参与者可看——查 `hand_players` 是否含当前用户，否则 403。
- 起手牌（`players[].hole`）仅在回放数据里给（对局已结束，无泄露风险）。
- 老对局（`hand_actions` 无记录）：`actions` 返回空数组 `[]`，前端据此提示"该局无回放数据"（不报 404，hands 摘要仍在）。

```ts
ReplayData = {
  hand_id: number;
  game_type: "texas" | "guandan" | "brag";
  board: string;          // 公共牌 code 串，如 "AsKdQh"；无则空串
  pot: number;
  ended_at: string;       // ISO 8601 UTC
  players: ReplayPlayer[];
  actions: ReplayAction[]; // 按 seq 升序；空数组表示该局无逐 action 记录
}

ReplayPlayer = {
  name: string;
  seat: number;
  is_bot: boolean;
  hole: string;           // 起手牌 code 串，如 "AsKd"；掼蛋等无则空串
}

ReplayAction = {
  seq: number;            // 局内序号，从 0 起，唯一且递增
  name: string;           // 行动者展示名（sid 重连会变，回放用 name）
  action: string;         // fold|call|raise|check|all_in|play|pass|look|compare|...
  payload: Record<string, unknown> | null;  // 如 { amount: 50 } / { cards: ["As","Kd"] }
  stage: string;          // 动作发生时的 stage（preflop/flop/.../betting/play）
  ts: string;             // ISO 8601 UTC
}
```

> 字段命名与 §2.4 `ActionLog` 对齐（`action`/`name`），但 replay 多了 `seq`/`stage`/`payload` 用于精确重建。前端回放播放器按 `actions` 逐步推进，复用牌桌只读渲染。

新增错误码：`HAND_NOT_FOUND`（加入 §2.6 枚举）。

---

## 2. Socket.IO

### 2.1 命名空间与连接
- 默认命名空间 `/`。
- 连接握手必须带 `auth.token`，否则 `connect_error("AUTH_REQUIRED")`。

### 2.2 命名规范
- **客户端 → 服务端**：动词在前，`lobby:create_table`、`table:action`。
- **服务端 → 客户端**：受影响域在前，`lobby:update`、`table:state`、`table:private`。

---

### 2.3 大厅事件

| 方向 | 事件 | payload | 说明 |
|------|------|---------|------|
| C→S | `lobby:list` | `{}` | 主动拉一次完整列表 |
| C→S | `lobby:create_table` | `CreateTablePayload` | 创建并自动入座 0 |
| C→S | `lobby:join_table` | `{ table_id, seat?: number, spectate?: boolean }` | seat 不传则自动选最小空位 |
| C→S | `lobby:leave_table` | `{ table_id }` | 离桌（不退出大厅） |
| C→S | `lobby:quick_match` | `{ game_type }` | 快速匹配（#009）：服务端挑一个 `status=waiting && 未满` 的最近房间并自动入座最小空位 |
| S→C | `lobby:update` | `{ tables: LobbyTable[] }` | 任意房间变化时广播 |
| S→C | `lobby:joined` | `{ table_id, your_seat: number \| null }` | 加入成功回执（含 quick_match 命中后的回执） |
| S→C | `lobby:no_match` | `{ game_type }` | quick_match 找不到可入座房间时回执，前端据此引导用户去创建 |

`CreateTablePayload`:
```ts
{
  name: string;
  game_type: "texas" | "guandan" | "brag";
  seats: number;             // texas: 2-6, guandan: 4(固定), brag: 2-6
  initial_chips?: number;    // texas / brag
  small_blind?: number;      // texas
  ante?: number;             // brag
  bots?: { seat: number; level: "easy" | "normal" }[];
  spectatable?: boolean;
}
```

---

### 2.4 桌面通用事件

#### S→C: `table:state`（公开状态，所有人）
```ts
{
  table_id: string;
  game_type: "texas" | "guandan" | "brag";
  hand_id: string;          // 每开新一局递增
  stage: string;            // 各玩法语义见下
  current_turn: {
    sid: string;
    deadline: string;       // ISO 8601 UTC，回合超时的绝对时刻
    turn_total_ms: number;  // 本回合总时长（毫秒）。前端用 (deadline - now) / turn_total_ms 画倒计时进度环，无需自己假设总时长
  } | null;
  players: PublicPlayer[];
  payload: TexasPublic | GuandanPublic | BragPublic;  // 玩法专属字段
  log: ActionLog[];         // 最近 20 条（rolling）
}

PublicPlayer = {
  sid: string;
  name: string;
  seat: number;
  is_bot: boolean;
  bot_level?: "easy" | "normal";
  chips: number;
  status: "active" | "folded" | "all_in" | "sitting_out" | "won" | "lost";
}

ActionLog = { ts: string; sid: string; name: string; action: string; detail?: string }
```

#### S→C: `table:private`（仅推给某 sid）
```ts
{
  table_id: string;
  hand_id: string;
  hole: Card[];               // 自己的手牌
  legal_actions: LegalAction[]; // 当前回合可用动作（前端按钮直接绑定）
}

LegalAction = { action: string; payload_schema?: Record<string, "int" | "card[]" | "sid"> }
```

#### C→S: `table:action`
```ts
{ table_id: string; action: string; payload: any }
```

#### C→S: `table:chat`
```ts
{ table_id: string; text: string }   // 长度 ≤ 200，空串/超长被服务端静默丢弃
```
S→C: `table:chat`
```ts
{
  sid: string;
  name: string;
  text: string;
  ts: number;   // Unix 毫秒时间戳（服务端 emit 时刻），前端据此显示发送时间。
                // 注意：是 number（毫秒整数），不是 §0 约定的 ISO 字符串——聊天高频且只用于本地展示，用毫秒整数最省事。
}
```
> ⚠️ 历史实现里 `ts` 曾下发空串 `""`（占位 TODO）。本契约把它定为 Unix 毫秒整数；后端须改为 `int(time.time() * 1000)`，前端按 number 解析（兼容旧空串时回退为收到的本地时间）。

#### C→S: `table:add_bot` / `table:remove_bot`
```ts
add_bot:    { table_id, seat, level: "easy" | "normal" }
remove_bot: { table_id, seat }
```
仅房主或空桌阶段允许，违规返 `error.code = "FORBIDDEN"`。

#### S→C: `table:hand_end`
```ts
{
  table_id: string;
  hand_id: string;
  results: HandResult[];     // 玩法专属
  next_hand_in: number;      // ms，0 表示等房主点开始
}
```

#### C→S: `table:start_hand`
```ts
{ table_id: string }
```
任意座位玩家可发起，需满足 `min_players` 条件。

---

### 2.5 玩法专属 payload

#### Texas Hold'em
`stage`: `"waiting" | "preflop" | "flop" | "turn" | "river" | "showdown"`

`TexasPublic`:
```ts
{
  pot: number;
  side_pots: { amount: number; eligible_sids: string[] }[];
  current_bet: number;
  min_raise: number;
  community: Card[];
  button_seat: number;
  player_bets: Record<string /*sid*/, number>;   // 本街已下注
}
```

合法 actions：`fold | check | call | raise | all_in`，`raise` payload `{ amount: int }`。

`HandResult`:
```ts
{ sid: string; name: string; amount: number; hand?: string; cards?: Card[] }
```

#### Guandan
`stage`: `"waiting" | "tribute" | "play" | "settling"`

`GuandanPublic`:
```ts
{
  level_card: number;            // 当前级牌，v1 = 2
  team_a: string[];              // sid，座位 0/2
  team_b: string[];              // 座位 1/3
  hand_counts: Record<string /*sid*/, number>;
  last_play: { sid: string; combo_type: string; cards: Card[] } | null;
  pass_streak: number;
  rankings: { sid: string; rank: 1 | 2 | 3 | 4 }[];   // 已上岸者
}
```

合法 actions：`play { cards: Card[] } | pass | hint(可选)`。

`HandResult`:
```ts
{ team: "A" | "B"; outcome: "double_up" | "first_third" | "first_fourth"; score_delta: number }[]
```

#### Three-Card Brag
`stage`: `"waiting" | "betting" | "showdown"`

`BragPublic`:
```ts
{
  pot: number;
  ante: number;
  current_bet: number;            // 未看牌的基础注
  looked: Record<string, boolean>;
  active_sids: string[];          // 仍在局中
  last_raiser_sid: string | null;
  no_raise_rounds: number;        // 用于触发强制摊牌
}
```

合法 actions：`look | call | raise { amount } | compare { target_sid } | fold`。

`HandResult`:
```ts
{ sid: string; name: string; amount: number; hand?: string; cards?: Card[]; revealed: boolean }
```

---

### 2.6 全局事件

| 方向 | 事件 | 说明 |
|------|------|------|
| S→C | `kicked` `{ reason }` | 被同名顶替时 |
| S→C | `error` `{ code, message, context? }` | 通用错误 |
| S→C | `system:announce` `{ text }` | 维护通知（v1 可不发） |

`error.code` 枚举：
`AUTH_REQUIRED | NOT_ALLOWED | INVALID_TOKEN | TABLE_NOT_FOUND | SEAT_TAKEN | FORBIDDEN | INVALID_ACTION | OUT_OF_TURN | RULE_VIOLATION | INVALID_INPUT | USER_NOT_FOUND | NO_MATCH | HAND_NOT_FOUND`

---

## 3. 类型基元

```ts
type Card = {
  rank: number;       // 2..14 普通；15=小王，16=大王
  suit: "S" | "H" | "D" | "C" | "J";  // J=Joker
  code: string;       // 例 "As" "Td" "JL"=小王 "JB"=大王
}
```

---

## 4. 心跳与重连

- Socket.IO 自带 ping。
- 客户端重连成功后立即发 `lobby:list`；若之前在桌内，服务端在 `connect` 钩子中自动 emit 一次 `table:state` + `table:private`。
- 若离线 > 30s 未回，视为掉线（详见 PRD §4.6）。

---

## 5. 版本号

本契约语义版本 `v1.0.0`，破坏性改动需提升 major 并通告两端。
