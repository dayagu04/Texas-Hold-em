"""炸金花引擎：实现 GameEngine 接口。

规则：
- 每人发 3 张暗牌
- 看牌后下注 × 2
- 比牌：双方亮牌，输家弃牌
- 仅剩 2 人时禁止 raise
- 连续 N 圈无加注强制摊牌（N=3）
"""
from enum import Enum

from ..cards import Deck
# from ..logger import log  # logger 模块暂不存在，暂时禁用
from .evaluator import evaluate_brag_hand, CATEGORY_NAMES


class Stage(str, Enum):
    WAITING = "waiting"
    BETTING = "betting"
    SHOWDOWN = "showdown"


class Player:
    def __init__(self, sid: str, name: str, seat: int, chips: int = 1000,
                 is_bot: bool = False, bot_level: str | None = None):
        self.sid = sid
        self.name = name
        self.seat = seat
        self.chips = chips
        self.is_bot = is_bot
        self.bot_level = bot_level
        self.hole: list = []
        self.looked = False  # 是否已看牌
        self.folded = False
        self.sitting_out = False
        self.ready = False  # 准备机制（多真人自动开局）；bot 在 add_player 置 True

    def reset_for_hand(self):
        self.hole = []
        self.looked = False
        self.folded = False


class BragEngine:
    """炸金花引擎。"""

    game_type = "brag"
    min_players = 2
    max_players = 6

    def __init__(self, table_id: str, name: str, ante: int = 10,
                 initial_chips: int = 1000, max_seats: int = 6,
                 game_mode: str = "continuous", max_hands: int | None = None):
        self.id = table_id
        self.name = name
        self.ante = ante  # 底注
        self.initial_chips = initial_chips
        self.max_players = max_seats
        self.players: dict[str, Player] = {}
        self.deck: Deck | None = None
        self.stage = Stage.WAITING
        self.pot = 0
        self.current_bet = ante  # 当前一注的基础金额
        self.current_turn: str | None = None
        self.button = -1
        self.last_raiser: str | None = None
        self.no_raise_rounds = 0  # 连续无加注轮数
        self.winners_info: list = []
        self.hand_in_progress = False
        self.hand_id = 0
        # 多局模式（#006）：single / continuous / limited
        self.game_mode = game_mode
        self.max_hands = max_hands
        self.hands_played = 0
        self.next_hand_in = 0

    # ---- GameEngine 接口实现 ----
    def add_player(self, sid: str, name: str, seat: int,
                   is_bot: bool = False, bot_level: str | None = None) -> None:
        player = Player(sid, name, seat, self.initial_chips, is_bot, bot_level)
        if is_bot:
            player.ready = True
        self.players[sid] = player

    def remove_player(self, sid: str) -> None:
        self.players.pop(sid, None)

    def can_start(self) -> bool:
        ready = self._ready_players()
        return len(ready) >= self.min_players

    def start_hand(self) -> None:
        ready = self._ready_players()
        if len(ready) < self.min_players:
            raise ValueError("玩家人数不足")

        for p in self.players.values():
            p.reset_for_hand()
            if p.chips <= 0:
                p.sitting_out = True

        self.deck = Deck()
        self.pot = 0
        self.winners_info = []
        self.stage = Stage.BETTING
        self.hand_in_progress = True
        self.hand_id += 1
        self.current_bet = self.ante
        self.last_raiser = None
        self.no_raise_rounds = 0

        ready = self._ready_players()
        seats = [p.seat for p in ready]
        self.button = self._next_seat(self.button, seats)

        # 收取底注进底池
        for p in ready:
            self._place_bet(p, self.ante)
        # log(f"[brag start_hand] collected ante: {self.ante} from {len(ready)} players, pot={self.pot}")

        # 发 3 张暗牌
        for p in ready:
            p.hole = self.deck.deal(3)

        # 首个行动者：庄家后第一位
        first_seat = self._next_seat(self.button, seats)
        self.current_turn = self._seat_player(first_seat).sid

        # 准备机制：开局成功后重置真人 ready，bot 保持 True
        for p in self.players.values():
            p.ready = p.is_bot

    def handle_action(self, sid: str, action: str, payload: dict) -> tuple[bool, str]:
        if sid != self.current_turn:
            return False, "还没轮到你"
        player = self.players.get(sid)
        if not player or player.folded:
            return False, "无法行动"

        active = self._active_players()

        if action == "look":
            # 看牌（不推进回合，玩家可继续行动）
            player.looked = True
            return True, ""
        elif action == "fold":
            player.folded = True
        elif action == "call":
            # 跟注：未看牌付 1×，已看牌付 2×
            multiplier = 2 if player.looked else 1
            to_pay = self.current_bet * multiplier
            paid = self._place_bet(player, to_pay)
            if paid < to_pay:
                return False, "筹码不足"
        elif action == "raise":
            # 加注
            if len(active) == 2:
                return False, "仅剩 2 人时禁止加注"
            amount = payload.get("amount", 0)
            if amount < self.current_bet:
                return False, f"加注至少到 {self.current_bet}"
            multiplier = 2 if player.looked else 1
            to_pay = amount * multiplier
            paid = self._place_bet(player, to_pay)
            if paid < to_pay:
                return False, "筹码不足"
            self.current_bet = amount
            self.last_raiser = sid
            self.no_raise_rounds = 0
        elif action == "compare":
            # 比牌：必须先看牌，且支付双倍当前注
            if not player.looked:
                return False, "必须先看牌"
            target_sid = payload.get("target_sid")
            target = self.players.get(target_sid)
            if not target or target.folded or target.sid == sid:
                return False, "无效的比牌目标"
            # 支付双倍当前注
            to_pay = self.current_bet * 2
            paid = self._place_bet(player, to_pay)
            if paid < to_pay:
                return False, "筹码不足"
            # 比牌：双方亮牌
            my_score = evaluate_brag_hand([c.to_dict() for c in player.hole])
            target_score = evaluate_brag_hand([c.to_dict() for c in target.hole])
            if my_score > target_score:
                target.folded = True
            elif my_score < target_score:
                player.folded = True
            else:
                # 平局：发起方判负
                player.folded = True
        else:
            return False, "未知操作"

        self._advance(sid)
        return True, ""

    def public_state(self) -> dict:
        """公开状态，不含任何底牌。"""
        def _player_dict(p: Player):
            return {
                "sid": p.sid,
                "name": p.name,
                "seat": p.seat,
                "is_bot": p.is_bot,
                "bot_level": p.bot_level,
                "chips": p.chips,
                "status": self._player_status(p),
                "ready": p.ready,
            }

        active_sids = [p.sid for p in self._active_players()]
        return {
            "table_id": self.id,
            "game_type": self.game_type,
            "hand_id": str(self.hand_id),
            "stage": self.stage.value,
            "current_turn": {"sid": self.current_turn, "deadline": ""} if self.current_turn else None,
            "players": [_player_dict(p) for p in self._seated_players()],
            "payload": {
                "pot": self.pot,
                "ante": self.ante,
                "current_bet": self.current_bet,
                "looked": {p.sid: p.looked for p in self.players.values()},
                "active_sids": active_sids,
                "last_raiser_sid": self.last_raiser,
                "no_raise_rounds": self.no_raise_rounds,
            },
            "log": [],
        }

    def private_state(self, sid: str) -> dict:
        """私有状态：底牌 + 合法操作。"""
        player = self.players.get(sid)
        if not player:
            return {"table_id": self.id, "hand_id": str(self.hand_id), "hole": [], "legal_actions": [], "hand_rank": None}

        legal = self._legal_actions(player)
        hand_rank = None
        if player.hole and len(player.hole) == 3:
            cat, *_ = evaluate_brag_hand([c.to_dict() for c in player.hole])
            hand_rank = {"category": cat, "name": CATEGORY_NAMES.get(cat, "")}
        return {
            "table_id": self.id,
            "hand_id": str(self.hand_id),
            "hole": [c.to_dict() for c in player.hole],
            "legal_actions": legal,
            "hand_rank": hand_rank,
        }

    def is_hand_over(self) -> bool:
        # 仅当一手牌真正摊牌结束才算结束；建桌/开局前的 WAITING 状态
        # 不能误判为结束，否则会触发空的 table:hand_end（见 M5 E2E BUG-2）
        return self.stage == Stage.SHOWDOWN and not self.hand_in_progress

    def get_hand_end_payload(self) -> dict:
        """返回 table:hand_end 事件的 payload。"""
        return {
            "table_id": self.id,
            "hand_id": str(self.hand_id),
            "results": self.winners_info,
            "next_hand_in": self.next_hand_in,
        }

    def _compute_next_hand_in(self) -> int:
        """根据游戏模式决定下一局倒计时（ms）。0 表示等手动 start_hand。"""
        if self.game_mode == "single":
            return 0
        if self.game_mode == "limited":
            if self.max_hands is not None and self.hands_played >= self.max_hands:
                return 0
            return 5000 if self.can_start() else 0
        return 5000 if self.can_start() else 0

    def next_bot_action(self) -> tuple[str, str, dict] | None:
        """若当前回合是 Bot，返回其决策。"""
        if not self.current_turn:
            return None
        player = self.players.get(self.current_turn)
        if not player or not player.is_bot:
            return None

        from .bot import decide_bot_action
        action, payload = decide_bot_action(
            player, self.public_state(), self.private_state(player.sid)
        )
        return player.sid, action, payload

    # ---- 辅助方法 ----
    def _seated_players(self) -> list[Player]:
        return sorted(self.players.values(), key=lambda p: p.seat)

    def _ready_players(self) -> list[Player]:
        return [p for p in self._seated_players()
                if p.chips > 0 and not p.sitting_out]

    def _active_players(self) -> list[Player]:
        """未弃牌且参与本手的玩家。"""
        return [p for p in self.players.values()
                if not p.folded and p.hole]

    def _player_status(self, p: Player) -> str:
        if p.sitting_out:
            return "sitting_out"
        if p.folded:
            return "folded"
        return "active"

    def _legal_actions(self, player: Player) -> list[dict]:
        if player.sid != self.current_turn or player.folded:
            return []

        actions = []
        if not player.looked:
            actions.append({"action": "look", "payload_schema": {}})

        actions.append({"action": "fold", "payload_schema": {}})
        actions.append({"action": "call", "payload_schema": {}})

        active = self._active_players()
        if len(active) > 2:
            actions.append({"action": "raise", "payload_schema": {"amount": "int"}})

        if player.looked:
            # 比牌目标：其他活跃玩家
            actions.append({"action": "compare", "payload_schema": {"target_sid": "sid"}})

        return actions

    def _next_seat(self, from_seat: int, seats: list[int]) -> int:
        ordered = sorted(seats)
        for s in ordered:
            if s > from_seat:
                return s
        return ordered[0]

    def _seat_player(self, seat: int) -> Player | None:
        for p in self.players.values():
            if p.seat == seat:
                return p
        return None

    def _place_bet(self, player: Player, amount: int) -> int:
        """下注，返回实际支付金额。"""
        paid = min(amount, player.chips)
        player.chips -= paid
        self.pot += paid
        return paid

    def _advance(self, from_sid: str):
        """推进到下一行动者或结束。"""
        active = self._active_players()
        if len(active) <= 1:
            self._finish_hand()
            return

        # 连续 3 圈无加注 → 强制摊牌
        if self.no_raise_rounds >= 3:
            self._finish_hand()
            return

        # 找下一个活跃玩家
        from_seat = self.players[from_sid].seat
        seats = [p.seat for p in active]
        next_seat = self._next_seat(from_seat, seats)
        self.current_turn = self._seat_player(next_seat).sid

        # 如果回到上次加注者，说明一圈结束
        if self.current_turn == self.last_raiser:
            self.no_raise_rounds += 1

    def _finish_hand(self):
        """结算。"""
        self.current_turn = None
        self.hands_played += 1
        active = self._active_players()

        if len(active) == 1:
            winner = active[0]
            winner.chips += self.pot
            self.winners_info = [{
                "sid": winner.sid,
                "name": winner.name,
                "amount": self.pot,
                "hand": "对手弃牌",
                "cards": [],
                "revealed": False,
            }]
        else:
            # 摊牌
            scores = {p.sid: evaluate_brag_hand([c.to_dict() for c in p.hole]) for p in active}
            best = max(scores.values())
            winners = [p for p in active if scores[p.sid] == best]
            share = self.pot // len(winners)
            rem = self.pot - share * len(winners)

            self.winners_info = []
            for i, p in enumerate(sorted(winners, key=lambda x: x.seat)):
                amt = share + (1 if i < rem else 0)
                p.chips += amt
                cat, *vals = scores[p.sid]
                hand_name = CATEGORY_NAMES.get(cat, "未知牌型")
                self.winners_info.append({
                    "sid": p.sid,
                    "name": p.name,
                    "amount": amt,
                    "hand": hand_name,
                    "cards": [c.to_dict() for c in p.hole],
                    "revealed": True,
                })

        self.pot = 0
        self.stage = Stage.SHOWDOWN
        self.hand_in_progress = False
        self.next_hand_in = self._compute_next_hand_in()