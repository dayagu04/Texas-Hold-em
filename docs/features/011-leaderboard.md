# 011 - 积分榜

> **编号**: 011
> **状态**: 待排期
> **优先级**: P1(留存/社交)
> **依赖**: SQLite `users` 表(已有 `points`/`hands_played`/`hands_won`/`total_net`)
> **契约**: [API-CONTRACT.md](../design/API-CONTRACT.md) §1.7
> **预估**: 后端 1h,前端 2h

## 1. 需求背景

DB 已经在累计每个真人的 `points`、`hands_played`、`hands_won`、`total_net`(见 [backend/app/db.py](../../backend/app/db.py) `record_hand`)。数据现成,但没有任何榜单展示,玩家看不到自己和别人的相对水平。加一个积分榜能制造攀比和留存。

## 2. 方案

### 2.1 后端接口

```
GET /api/leaderboard?metric=points|net|winrate&limit=10
```

返回 `{ metric, entries: LeaderboardEntry[] }`(结构见契约 §1.7)。

- `metric=points`:按 `points` 降序(默认)。
- `metric=net`:按 `total_net` 降序。
- `metric=winrate`:按 `hands_won/hands_played` 降序,**且 `hands_played >= 10` 才入榜**(样本太小不参与排名)。
- `limit` 缺省 10,clamp 到 1..50。
- 只查 `users` 表,bot 本就不入表,天然排除。
- `winrate` 在 SQL 里算或取出后算都行,保留两位小数。

db 层加 `get_leaderboard(metric, limit) -> list[dict]`。

### 2.2 前端展示

两处:

**A. 大厅侧栏 Top 10**

```
┌─ 排行榜 ───────────────┐
│ [积分][净胜][胜率]      │  ← tab 切 metric
├────────────────────────┤
│ 1 🥇 Alice      1280    │
│ 2 🥈 Bob        1150    │
│ 3 🥉 Carol      1090    │
│ 4    Dave       1000    │
│ …                       │
└────────────────────────┘
```

- 三个 tab 切 metric,切换时重新拉接口。
- 前三名加奖牌图标。
- 头像缩略(LeaderboardEntry.avatar 拼 `?v=` 走现有头像缓存逻辑)。

**B. 个人中心「我的排名」**

- 个人中心展示「我在积分榜第 N 名」(前端可拉一次较大 limit 找自己,或后端另给"我的名次"——本期前端在 Top 50 内找自己,找不到显示"未上榜")。

## 3. 前后端分工

### 后端
- [ ] `db.py`:`get_leaderboard(metric, limit)`,winrate 过滤 `hands_played >= 10`
- [ ] `main.py`:`GET /api/leaderboard`(鉴权,clamp limit,metric 回退)
- [ ] 测试:三种 metric 排序正确、winrate 样本过滤、limit clamp

### 前端
- [ ] 大厅侧栏排行榜组件(三 tab + Top 10 + 奖牌 + 头像)
- [ ] 个人中心「我的排名」
- [ ] 文案全中文(zhCN)

## 4. 验收标准

- [ ] `GET /api/leaderboard?metric=points` 返回按积分降序的 Top N
- [ ] `metric=net` 按净胜分降序,`metric=winrate` 按胜率降序
- [ ] 胜率榜排除 `hands_played < 10` 的用户
- [ ] `limit` 超过 50 被 clamp 到 50,非法 metric 回退 points
- [ ] 大厅侧栏显示 Top 10,可切三个维度,前三有奖牌
- [ ] 个人中心显示我的名次(或"未上榜")
- [ ] bot 不出现在榜单上

## 5. 关联

- 数据基础:`record_hand` 已累计统计字段
- 契约:[API-CONTRACT.md](../design/API-CONTRACT.md) §1.7
