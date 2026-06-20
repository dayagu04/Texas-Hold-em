# 013 - 牌局回放

> **编号**: 013
> **状态**: 待排期(前瞻,排到后面)
> **优先级**: P2(前瞻性,较大改动)
> **依赖**: SQLite 持久化层;摊牌数据(#010)
> **契约**: [API-CONTRACT.md](../design/API-CONTRACT.md) 需新增回放接口(本需求落地前先在契约补 §)
> **预估**: 后端 4-6h(新表+写入埋点+接口),前端 4-6h(回放播放器)

> ⚠️ **这是较大改动,排在产品力需求之后**。当前 DB 只存每局**摘要**(`hands` + `hand_players`,见 [backend/app/db.py](../../backend/app/db.py)),不存 action 序列,无法回放。本需求要新增逐 action 记录,涉及全引擎埋点,工作量和回归风险都不小。

## 1. 需求背景

玩家想复盘"刚才那把我是怎么输的"。现在结束后只有一个 HandEndModal 快照,看不到过程。要支持回放,必须把每一步动作(谁、什么动作、下注多少、什么时候)持久化下来,结束后能逐步重放。

## 2. 方案

### 2.1 新增 `hand_actions` 表

```sql
CREATE TABLE IF NOT EXISTS hand_actions (
    hand_id INTEGER NOT NULL,
    seq     INTEGER NOT NULL,   -- 局内自增序号,从 0 起
    sid     TEXT,               -- 行动者(回放展示用 name,但 sid 记录原始)
    name    TEXT,
    action  TEXT NOT NULL,      -- fold/call/raise/check/all_in/play/pass/look/compare...
    payload TEXT,               -- JSON 串,如 {"amount":50} / {"cards":["As","Kd"]}
    stage   TEXT,               -- 动作发生时的 stage(preflop/flop/.../betting/play)
    ts      TEXT,               -- ISO 8601 UTC
    PRIMARY KEY (hand_id, seq),
    FOREIGN KEY (hand_id) REFERENCES hands(id)
);
CREATE INDEX IF NOT EXISTS idx_ha_hand ON hand_actions(hand_id);
```

每个动作一行。卡牌/金额放 `payload` JSON,保持表结构稳定跨三种玩法。

### 2.2 写入埋点

挑战:动作发生在各引擎内部(`texas/engine.py`、`brag/engine.py`、`guandan/engine.py` 的 apply_action),而 db 写入现在集中在 `sio.py` 的局结束钩子。两个方案:

- **A(推荐,低耦合)**:引擎在内存里累积一个 `action_log`(本就有 rolling log,扩展成完整序列),局结束时一次性批量写入 `hand_actions`。一次事务,写入量集中,不影响热路径。
- **B**:每个动作实时写库——写入频繁,热路径上加 IO,不推荐。

采用 A:引擎维护 `self.full_action_log: list[dict]`,`record_hand` 时连同摘要一起落 `hand_actions`。

> 注意 sid 重连会变(见 stale-player 修复历史),回放展示用 `name` 更稳,`sid` 仅作原始留痕。

### 2.3 回放接口(契约需新增)

```
GET /api/hand/{hand_id}/replay   Authorization: Bearer <token>
200 → {
  hand_id, game_type, board, pot, ended_at,
  players: [{ name, seat, is_bot, hole }],   // 起手牌(摊牌信息)
  actions: [{ seq, name, action, payload, stage, ts }]
}
```
- 权限:仅参与该局的玩家可看(查 `hand_players` 是否含当前用户),否则 403。
- 起手牌只在回放里给(局已结束,无泄露风险)。

### 2.4 前端回放播放器

入口:个人中心对局历史每条加「回放」按钮 → 打开回放页/Modal。

播放器:
```
[⏮][⏯ 播放][⏭]  进度 ●──────  3/18 步
按步重放:发牌 → 下注 → 翻牌 → …
```
- 按 `actions` 序列逐步推进,重建每步桌面状态(复用牌桌只读渲染)。
- 支持上一步/下一步/自动播放(可调速)。
- 复用现有牌桌/座位/卡牌组件的只读模式渲染,不要另写一套。

## 3. 前后端分工

### 后端
- [ ] `db.py`:`hand_actions` 表 + 旧库兜底
- [ ] 各引擎:累积完整 action 序列(扩展现有 log)
- [ ] `sio.py`/`db.py`:局结束时批量写 `hand_actions`(单事务)
- [ ] `main.py`:`GET /api/hand/{hand_id}/replay`(参与者鉴权)
- [ ] 契约:补回放接口 §
- [ ] 测试:三玩法 action 序列完整、参与者鉴权、非参与者 403

### 前端
- [ ] 对局历史每条加「回放」入口
- [ ] 回放播放器(逐步/自动/调速,只读复用牌桌组件)

## 4. 验收标准

- [ ] 一局结束后,`hand_actions` 完整记录了该局所有动作(顺序正确)
- [ ] 三种玩法的动作都能记录(德扑下注、掼蛋出牌、炸金花看牌/比牌)
- [ ] 参与者能拉到回放数据并逐步重放;非参与者 403
- [ ] 回放能正确重建每一步的桌面状态(下注、翻牌、弃牌)
- [ ] 老数据(没有 action 记录的历史局)回放入口禁用或提示"该局无回放数据"

## 5. 关联

- 数据基础:`hands`/`hand_players`(摘要已有)
- 强相关:#010(摊牌底牌数据来源)
- 标注:**改动较大,排在 M3 产品力之后**(见 roadmap M3/M4)
