# 010 - 摊牌展示 + 聊天打磨

> **编号**: 010
> **状态**: 待排期
> **优先级**: P1(核心体验)
> **依赖**: #006 HandEndModal、聊天事件已存在
> **契约**: [API-CONTRACT.md](../design/API-CONTRACT.md) §2.4(`table:hand_end` / `table:chat`)
> **预估**: 后端 1-2h,前端 2-3h

## 1. 需求背景

三个体验缺口:

1. **摊牌只看得到自己的牌**。德扑/炸金花摊牌时,玩家想看到所有未弃牌对手的底牌(这是德扑的核心乐趣),目前 `table:private` 只下发自己的 `hole`,看不到别人。
2. **聊天没有时间戳**。`table:chat` 的 `ts` 历史上一直是空串(见 [backend/app/sio.py:528](../../backend/app/sio.py#L528) 的 TODO),前端无法显示发送时间。
3. **打字麻烦**。牌桌上手快,逐字打"加注吗"很慢,需要快捷预设表情/短语。

## 2. 方案

### 2.1 摊牌展示所有未弃牌玩家底牌

**数据来源:用 `table:hand_end` 的 `results`,不动 `table:private`。**

理由:`table:private` 是"私有"语义,往里塞别人的牌违背设计;摊牌是一次性结算事件,放进 `hand_end.results` 最自然,且契约里 `HandResult` 已经预留了 `cards?: Card[]` 字段。

后端在构造 `hand_end` 时,对**进入摊牌且未弃牌**的玩家,在其 `HandResult` 里填:
- `cards`: 该玩家底牌(Card[])
- `hand`: 牌型描述(德扑如"两对 A/K",已有 evaluator 可给)
- (Texas)`revealed` 语义对齐 Brag 已有的 `revealed: boolean`

弃牌玩家不下发 `cards`(`cards` 省略或空),前端不展示其底牌。掼蛋无"底牌摊开"概念,本需求只覆盖 Texas / Brag。

> 安全红线:**只在 `hand_end` 时下发对手底牌**,牌局进行中绝不通过任何事件泄露他人手牌。后端要确认 `cards` 只在结算路径填充。

前端:HandEndModal 渲染每个 result 时,若有 `cards` 则展示底牌 + `hand` 牌型;弃牌者标注"已弃牌"不显示牌。

### 2.2 聊天时间戳

- 后端:`table:chat` emit 时 `ts = int(time.time() * 1000)`(Unix 毫秒),替换现有空串 TODO。
- 契约已更新(§2.4):`ts` 为 number(毫秒)。
- 前端:聊天行显示 `HH:mm`(本地时区,由 ts 格式化)。兼容旧空串:`ts` 为空/0 时回退到收到的本地时间。

### 2.3 快捷表情 / 预设消息

聊天输入框旁加一排快捷按钮,点了直接作为聊天消息发送(走现有 `table:chat`,无需新事件):

预设(6-8 个,中文,赌场语气):
```
"加注?"  "跟!"  "弃了"  "好牌!"  "稳住"  "梭哈?"  "👍"  "😏"
```

- 点击即发,不需先填输入框。
- 走现有 200 字限制和频率(若后端有限流则复用)。
- 可选:轻量防刷,前端两次快捷发送间隔 ≥ 1s(本期可不做,后端不强制)。

## 3. 契约影响

- `table:hand_end` 的 `HandResult.cards` / `hand` 在 Texas 摊牌时**必填非弃牌玩家**(契约已有字段,无需改结构,只明确填充时机)。
- `table:chat` 的 `ts` 由空串改为 Unix 毫秒 number(契约 §2.4 已更新)。
- 快捷消息无新事件,复用 `table:chat`。

## 4. 前后端分工

### 后端
- [ ] `texas/engine.py`:构造 hand_end results 时,对未弃牌玩家填 `cards` + `hand`
- [ ] 确认 `cards` 仅在结算路径出现,过程态不泄露
- [ ] `sio.py:528`:`table:chat` 的 `ts` 改为 `int(time.time()*1000)`
- [ ] 测试:摊牌 results 含对手牌、弃牌者不含牌、进行中 private 不含他人牌

### 前端
- [ ] HandEndModal:渲染对手底牌 + 牌型;弃牌者标注不显示牌
- [ ] 聊天行显示时间(ts 格式化 HH:mm,兼容空 ts)
- [ ] 聊天区快捷消息按钮排,点击即发
- [ ] 文案全中文(zhCN)

## 5. 验收标准

- [ ] 德扑摊牌时,HandEndModal 显示所有未弃牌玩家的底牌和牌型
- [ ] 弃牌玩家不显示底牌,标注"已弃牌"
- [ ] 牌局进行中,任何手段都看不到对手底牌(开发者工具查 socket 也查不到)
- [ ] 每条聊天显示发送时间(本地时区 HH:mm)
- [ ] 快捷消息按钮点击后立即作为聊天发出,他人可见
- [ ] 炸金花摊牌同样能看到比牌双方亮出的牌(沿用 Brag `revealed`)

## 6. 关联

- 依赖:#006 HandEndModal
- 契约:[API-CONTRACT.md](../design/API-CONTRACT.md) §2.4
