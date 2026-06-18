# 人机（AI Bot）设计

> 受众：后端 agent。前端只需读 `is_bot` / `bot_level` 字段渲染图标。

## 1. 目标与边界

- **不是 AI 教练**，仅为凑齐人数与制造紧张感而存在。
- 不可"开挂"——只能看到自己的私有状态（与真人对等的 `private_state`）。
- 决策必须在 **5 秒** 内返回（`asyncio.wait_for` 兜底）。
- 失败兜底：决策异常时执行最保守动作（fold / pass / call 0）。

## 2. 抽象

```python
# backend/app/game/bot.py

from typing import Protocol

class Bot(Protocol):
    level: Literal["easy", "normal"]
    game_type: Literal["texas", "guandan", "brag"]

    def decide(self, public: dict, private: dict, legal_actions: list[dict]) -> tuple[str, dict]:
        """返回 (action, payload)。必须落在 legal_actions 内。"""

# 注册表
BOTS: dict[tuple[str, str], type[Bot]] = {
    ("texas", "easy"):    TexasEasyBot,
    ("texas", "normal"):  TexasNormalBot,
    ("guandan", "easy"):  GuandanEasyBot,
    ("guandan", "normal"):GuandanNormalBot,
    ("brag", "easy"):     BragEasyBot,
    ("brag", "normal"):   BragNormalBot,
}

def make_bot(game_type: str, level: str) -> Bot:
    return BOTS[(game_type, level)]()
```

## 3. 调度

`backend/app/sio.py`：

```python
async def maybe_run_bot(table_id: str):
    engine = registry.get(table_id)
    turn = engine.public_state().get("current_turn")
    if not turn: return
    player = engine.find(turn["sid"])
    if not player.is_bot: return
    await asyncio.sleep(random.uniform(1.5, 4.0))   # 拟人延迟
    bot = make_bot(engine.game_type, player.bot_level)
    action, payload = bot.decide(
        public=engine.public_state(),
        private=engine.private_state(player.sid),
        legal_actions=engine.legal_actions(player.sid),
    )
    engine.handle_action(player.sid, action, payload)
    await broadcast_state(table_id)
    await maybe_run_bot(table_id)   # 链式：可能下一手仍是 bot
```

## 4. 各玩法策略大纲

### 4.1 德州扑克

#### Easy
- 用蒙特卡洛胜率近似（10 次随机模拟即可，拼速度不拼精度）。
- 阈值：
  - 胜率 < 0.30 → check 优先 / 否则 fold
  - 0.30 ≤ 胜率 < 0.55 → call
  - 胜率 ≥ 0.55 → 加注 min_raise；若 ≥ 0.80 → 加注 1/2 pot
- 不下大注，不 all-in（除非筹码 ≤ 大盲 × 4 时随机 30% all-in）。

#### Normal
- 蒙特卡洛 200 次提升精度。
- 加入位置感（在 button 后位时阈值降 0.05）。
- 5% 概率"虚张声势"：在弱牌时 raise 一档，制造变数。
- 跟随对手节奏：若对手已 all-in，按 pot odds 严格判断。

### 4.2 掼蛋

#### Easy
- 候选：枚举手牌中所有合法牌型 → 过滤 ≥ `last_play` 的最小那个。
- 没得出 → pass。
- 不主动用炸弹（保留到必要时）。
- 自己开张时出最小单张。

#### Normal
- 引入"团队意识"：若搭档已上岸或当前出牌人是搭档且场面对方接不动，主动 pass 让位。
- 炸弹策略：当队友手牌少于 5 张时不炸；当对手即将清空时果断炸。
- 拆牌优化：避免拆掉对子打单张（除非剩余手牌 ≤ 5）。

### 4.3 炸金花

#### Easy
- 决策只看自己 3 张牌的牌型档位：
  - 散牌 → 50% fold / 50% call 一次后再 fold
  - 对子 → 一直 call
  - 顺子 / 同花及以上 → 必看牌 + 适度加注
  - 豹子 → 闷牌到底，最后 compare
- 不主动 compare，除非剩 2 人。

#### Normal
- 跟踪 `pot_odds`：跟注成本 / 池底，用于判断散牌时是否值得搏一手。
- 加入"对手强度估计"：观察对手是否看牌、是否多次 raise，对应调整阈值。
- 仅剩 2 人时若自己强牌主动 compare；弱牌 30% 概率 bluff raise。

## 5. 配置

- 环境变量 `BOT_THINK_MIN_MS=1500`、`BOT_THINK_MAX_MS=4000` 可覆盖默认延迟。
- 可在 `backend/bots.json` 自定义"AI 昵称池"，创建 Bot 时随机抽取一个用作 `name`（如"机器猫"、"AI-7"），便于聊天日志可读。

## 6. 测试

`backend/tests/test_bots.py` 覆盖：
- 决策 100 次都落在 `legal_actions` 里。
- 异常输入（缺字段）兜底为 fold/pass。
- 平均决策时间 < 50ms（不含 sleep）。
