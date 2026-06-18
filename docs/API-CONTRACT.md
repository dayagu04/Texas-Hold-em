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
| S→C | `lobby:update` | `{ tables: LobbyTable[] }` | 任意房间变化时广播 |
| S→C | `lobby:joined` | `{ table_id, your_seat: number \| null }` | 加入成功回执 |

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
  current_turn: { sid: string; deadline: string } | null;
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
{ table_id: string; text: string }   // 长度 ≤ 200
```
S→C: `table:chat` `{ sid, name, text, ts }`

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
`AUTH_REQUIRED | NOT_ALLOWED | INVALID_TOKEN | TABLE_NOT_FOUND | SEAT_TAKEN | FORBIDDEN | INVALID_ACTION | OUT_OF_TURN | RULE_VIOLATION`

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
