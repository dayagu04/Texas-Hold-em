"""德州扑克引擎：实现 GameEngine 接口。

从原 table.py 重构而来，保留所有现有功能。
"""
from ...profiles import load_profile
from enum import Enum

from ..cards import Deck
from .evaluator import CATEGORY_NAMES, evaluate_best, evaluate_partial


class Stage(str, Enum):
    WAITING = "waiting"
    PREFLOP = "preflop"
    FLOP = "flop"
    TURN = "turn"
    RIVER = "river"
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
        self.bet = 0
        self.total_bet = 0
        self.folded = False
        self.all_in = False
        self.acted = False
        self.sitting_out = False
        self.ready = False  # 准备机制（多真人自动开局）；bot 在 add_player 置 True

    def reset_for_hand(self):
        self.hole = []
        self.bet = 0
        self.total_bet = 0
        self.folded = False
        self.all_in = False
        self.acted = False


class TexasEngine:
    """德州扑克引擎。"""

    game_type = "texas"
    min_players = 2
    max_players = 6

    def __init__(self, table_id: str, name: str, small_blind: int = 10,
                 initial_chips: int = 1000, max_seats: int = 6,
                 game_mode: str = "continuous", max_hands: int | None = None):
        self.id = table_id
        self.name = name
        self.small_blind = small_blind
        self.big_blind = small_blind * 2
        self.initial_chips = initial_chips
        self.max_seats = max_seats
        self.players: dict[str, Player] = {}
        self.deck: Deck | None = None
        self.community: list = []
        self.stage = Stage.WAITING
        self.pot = 0
        self.current_bet = 0
        self.min_raise = self.big_blind
        self.button = -1
        self.current_turn: str | None = None
        self.last_aggressor: str | None = None
        self.winners_info: list = []
        self.hand_in_progress = False
        self.hand_id = 0
        # 多局模式（#006）：single 单局 / continuous 连续 / limited 限定局数
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
        self.community = []
        self.pot = 0
        self.winners_info = []
        self.stage = Stage.PREFLOP
        self.hand_in_progress = True
        self.hand_id += 1

        ready = self._ready_players()
        seats = [p.seat for p in ready]
        self.button = self._next_seat(self.button, seats)
        for p in ready:
            p.hole = self.deck.deal(2)

        self._post_blinds(ready, seats)

        # 准备机制：开局成功后重置真人 ready，bot 保持 True
        for p in self.players.values():
            p.ready = p.is_bot

    def handle_action(self, sid: str, action: str, payload: dict) -> tuple[bool, str]:
        if sid != self.current_turn:
            return False, "还没轮到你"
        player = self.players.get(sid)
        if player is None or player.folded or player.all_in:
            return False, "无法行动"

        to_call = self.current_bet - player.bet
        amount = payload.get("amount", 0)

        if action == "fold":
            player.folded = True
        elif action == "check":
            if to_call > 0:
                return False, "当前无法过牌"
        elif action == "call":
            if to_call <= 0:
                return False, "无需跟注"
            self._place_bet(player, to_call)
        elif action == "raise":
            min_total = self.current_bet + self.min_raise
            if amount < min_total and amount < player.bet + player.chips:
                return False, f"加注至少到 {min_total}"
            target = min(amount, player.bet + player.chips)
            raise_increment = target - self.current_bet
            self._place_bet(player, target - player.bet)
            if raise_increment >= self.min_raise:
                self.min_raise = raise_increment
            self.current_bet = max(self.current_bet, player.bet)
            self.last_aggressor = sid
            self._reset_acted_except(sid)
        elif action == "all_in":
            self._place_bet(player, player.chips)
            if player.bet > self.current_bet:
                inc = player.bet - self.current_bet
                if inc >= self.min_raise:
                    self.min_raise = inc
                self.current_bet = player.bet
                self.last_aggressor = sid
                self._reset_acted_except(sid)
        else:
            return False, "未知操作"

        player.acted = True
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
                "avatar": load_profile(p.name).get("avatar"),
            }

        return {
            "table_id": self.id,
            "game_type": self.game_type,
            "hand_id": str(self.hand_id),
            "stage": self.stage.value,
            "current_turn": {"sid": self.current_turn, "deadline": ""} if self.current_turn else None,
            "players": [_player_dict(p) for p in self._seated_players()],
            "payload": {
                "pot": self.pot,
                "side_pots": [],
                "current_bet": self.current_bet,
                "min_raise": self.min_raise,
                "community": [c.to_dict() for c in self.community],
                "button_seat": self.button,
                "player_bets": {p.sid: p.bet for p in self.players.values()},
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
        if player.hole:
            cards = player.hole + self.community  # 翻牌前 community 为 []
            cat, *_ = evaluate_partial(cards)
            hand_rank = {"category": cat, "name": CATEGORY_NAMES.get(cat, "")}
        return {
            "table_id": self.id,
            "hand_id": str(self.hand_id),
            "hole": [c.to_dict() for c in player.hole],
            "legal_actions": legal,
            "hand_rank": hand_rank,
        }

    def is_hand_over(self) -> bool:
        # 仅当一手牌真正打到摊牌结束才算结束；初始 WAITING 状态（房间刚建、
        # 尚未开局）不能误判为结束，否则会触发空的 table:hand_end
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
        """根据游戏模式决定下一局倒计时（ms）。0 表示等手动 start_hand。

        在 _finish_hand 末尾调用（此时 hands_played 已自增）。
        """
        if self.game_mode == "single":
            return 0
        if self.game_mode == "limited":
            if self.max_hands is not None and self.hands_played >= self.max_hands:
                return 0
            return 5000 if self.can_start() else 0
        # continuous（默认）
        return 5000 if self.can_start() else 0

    def next_bot_action(self) -> tuple[str, str, dict] | None:
        """若当前回合是 Bot，返回其决策。"""
        if not self.current_turn:
            return None
        player = self.players.get(self.current_turn)
        if not player or not player.is_bot:
            return None

        # 调用 bot 策略
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

    def _contenders(self) -> list[Player]:
        return [p for p in self.players.values() if not p.folded and p.hole]

    def _to_act(self) -> list[Player]:
        return [p for p in self._contenders()
                if not p.all_in and (not p.acted or p.bet < self.current_bet)]

    def _player_status(self, p: Player) -> str:
        if p.sitting_out:
            return "sitting_out"
        if p.folded:
            return "folded"
        if p.all_in:
            return "all_in"
        return "active"

    def _legal_actions(self, player: Player) -> list[dict]:
        if player.sid != self.current_turn or player.folded or player.all_in:
            return []

        to_call = self.current_bet - player.bet
        actions = [{"action": "fold", "payload_schema": {}}]

        if to_call == 0:
            actions.append({"action": "check", "payload_schema": {}})
        else:
            actions.append({"action": "call", "payload_schema": {}})

        if player.chips > to_call:
            actions.append({
                "action": "raise",
                "payload_schema": {"amount": "int"}
            })

        actions.append({"action": "all_in", "payload_schema": {}})
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

    def _post_blinds(self, ready: list[Player], seats: list[int]):
        if len(ready) == 2:
            sb_seat = self.button
            bb_seat = self._next_seat(self.button, seats)
        else:
            sb_seat = self._next_seat(self.button, seats)
            bb_seat = self._next_seat(sb_seat, seats)

        sb_player = self._seat_player(sb_seat)
        bb_player = self._seat_player(bb_seat)
        self._place_bet(sb_player, self.small_blind)
        self._place_bet(bb_player, self.big_blind)
        self.current_bet = self.big_blind
        self.min_raise = self.big_blind
        self.last_aggressor = bb_player.sid
        first_seat = self._next_seat(bb_seat, seats)
        first = self._seat_player(first_seat)
        self.current_turn = first.sid

    def _place_bet(self, player: Player, amount: int):
        amount = min(amount, player.chips)
        player.chips -= amount
        player.bet += amount
        player.total_bet += amount
        self.pot += amount
        if player.chips == 0:
            player.all_in = True
        return amount

    def _reset_acted_except(self, sid: str):
        for p in self.players.values():
            if p.sid != sid and not p.folded and not p.all_in:
                p.acted = False

    def _advance(self, from_sid: str):
        contenders = self._contenders()
        if len(contenders) <= 1:
            self._finish_hand()
            return
        if not self._to_act():
            self._next_stage()
            return

        from_seat = self.players[from_sid].seat
        ordered = sorted(self._contenders(), key=lambda p: p.seat)
        n = len(ordered)
        # 从 from_seat 之后的第一个在局玩家开始扫描；刚弃牌的玩家可能
        # 已不在 _contenders() 中，因此用"首个 seat > from_seat"定位而非精确匹配
        start = next((i for i, p in enumerate(ordered) if p.seat > from_seat), 0)
        for step in range(n):
            cand = ordered[(start + step) % n]
            if not cand.all_in and (not cand.acted or cand.bet < self.current_bet):
                self.current_turn = cand.sid
                return
        self._next_stage()

    def _next_stage(self):
        for p in self.players.values():
            p.bet = 0
            p.acted = False
        self.current_bet = 0
        self.min_raise = self.big_blind

        contenders = self._contenders()
        can_act = [p for p in contenders if not p.all_in]

        if self.stage == Stage.PREFLOP:
            self.stage = Stage.FLOP
            self.community += self.deck.deal(3)
        elif self.stage == Stage.FLOP:
            self.stage = Stage.TURN
            self.community += self.deck.deal(1)
        elif self.stage == Stage.TURN:
            self.stage = Stage.RIVER
            self.community += self.deck.deal(1)
        elif self.stage == Stage.RIVER:
            self._finish_hand()
            return

        if len(can_act) < 2:
            if self.stage != Stage.RIVER:
                self._next_stage()
            else:
                self._finish_hand()
            return

        seats = [p.seat for p in can_act]
        first_seat = self._next_seat(self.button, sorted(seats))
        self.current_turn = self._seat_player(first_seat).sid
        self.last_aggressor = None

    def _finish_hand(self):
        self.current_turn = None
        self.hands_played += 1
        contenders = self._contenders()

        if len(contenders) == 1:
            winner = contenders[0]
            winner.chips += self.pot
            self.winners_info = [{
                "sid": winner.sid,
                "name": winner.name,
                "amount": self.pot,
                "hand": "对手弃牌",
                "cards": [],
            }]
        else:
            self._settle_showdown(contenders)

        self.pot = 0
        self.stage = Stage.SHOWDOWN
        self.hand_in_progress = False
        self.next_hand_in = self._compute_next_hand_in()

    def _settle_showdown(self, contenders: list[Player]):
        scores = {p.sid: evaluate_best(p.hole + self.community) for p in contenders}
        pots = self._build_side_pots()
        payouts: dict[str, int] = {p.sid: 0 for p in contenders}

        for amount, eligible_sids in pots:
            in_play = [sid for sid in eligible_sids if sid in scores]
            if not in_play:
                continue
            best = max(scores[sid] for sid in in_play)
            winners = [sid for sid in in_play if scores[sid] == best]
            share = amount // len(winners)
            rem = amount - share * len(winners)
            for i, sid in enumerate(sorted(winners, key=lambda s: self.players[s].seat)):
                payouts[sid] += share + (1 if i < rem else 0)

        self._record_winners(payouts, scores)

    def _build_side_pots(self) -> list[tuple[int, list[str]]]:
        contenders = self._contenders()
        breakpoints = sorted(set(p.total_bet for p in contenders))
        if not breakpoints:
            return []
        pots = []
        last = 0
        for bp in breakpoints:
            contrib = bp - last
            eligible = [p.sid for p in contenders if p.total_bet >= bp]
            pots.append((contrib * len(eligible), eligible))
            last = bp
        return pots

    def _record_winners(self, payouts: dict[str, int], scores: dict[str, tuple]):
        """记录本局结果。payouts 是赢家分成,scores 是所有摊牌玩家评分。

        输出顺序:赢家在前(按 payout 降序),输家在后(按 seat 升序)。
        所有摊牌玩家(scores 内)都填 cards + hand,弃牌者不在 scores 里。
        """
        self.winners_info = []

        # 先收集赢家(payout > 0)
        winners = []
        for sid, amt in payouts.items():
            if amt > 0:
                player = self.players[sid]
                cat, *vals = scores[sid]
                hand_name = CATEGORY_NAMES.get(cat, "未知牌型")
                winners.append({
                    "sid": sid,
                    "name": player.name,
                    "amount": amt,
                    "hand": hand_name,
                    "cards": [c.to_dict() for c in player.hole],
                })
        # 按赢得金额降序(多赢的在前)
        winners.sort(key=lambda w: w["amount"], reverse=True)
        self.winners_info.extend(winners)

        # 再收集输家(在 scores 里但 payout == 0)
        losers = []
        for sid, score in scores.items():
            if payouts.get(sid, 0) == 0:
                player = self.players[sid]
                cat, *vals = score
                hand_name = CATEGORY_NAMES.get(cat, "未知牌型")
                losers.append({
                    "sid": sid,
                    "name": player.name,
                    "amount": 0,
                    "hand": hand_name,
                    "cards": [c.to_dict() for c in player.hole],
                })
        # 输家按 seat 升序
        losers.sort(key=lambda l: self.players[l["sid"]].seat)
        self.winners_info.extend(losers)

        # 给赢家加筹码(输家不用减,已在下注时扣)
        for sid, amt in payouts.items():
            if amt > 0:
                self.players[sid].chips += amt
