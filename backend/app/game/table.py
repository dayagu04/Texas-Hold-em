"""牌桌与游戏状态机：管理座位、下注轮、底池与结算。"""
from enum import Enum

from .cards import Deck
from .evaluator import CATEGORY_NAMES, evaluate_best


class Stage(str, Enum):
    WAITING = "waiting"      # 等待开局
    PREFLOP = "preflop"
    FLOP = "flop"
    TURN = "turn"
    RIVER = "river"
    SHOWDOWN = "showdown"


class Player:
    def __init__(self, sid: str, name: str, seat: int, chips: int = 1000):
        self.sid = sid
        self.name = name
        self.seat = seat
        self.chips = chips
        self.hole: list = []          # 底牌
        self.bet = 0                  # 本轮已下注
        self.total_bet = 0            # 本手累计下注（算边池用）
        self.folded = False
        self.all_in = False
        self.acted = False            # 本轮是否已行动
        self.sitting_out = False      # 筹码耗尽时观战

    def reset_for_hand(self):
        self.hole = []
        self.bet = 0
        self.total_bet = 0
        self.folded = False
        self.all_in = False
        self.acted = False


class Table:
    """单张牌桌。最多 6 人，小盲 10 / 大盲 20。"""

    def __init__(self, table_id: str, name: str, small_blind: int = 10):
        self.id = table_id
        self.name = name
        self.small_blind = small_blind
        self.big_blind = small_blind * 2
        self.max_seats = 6
        self.players: dict[str, Player] = {}   # sid -> Player
        self.deck: Deck | None = None
        self.community: list = []              # 公共牌
        self.stage = Stage.WAITING
        self.pot = 0
        self.current_bet = 0                   # 本轮需跟到的注额
        self.min_raise = self.big_blind        # 最小加注增量
        self.button = -1                       # 庄家按钮座位号
        self.current_turn: str | None = None   # 当前行动者 sid
        self.last_aggressor: str | None = None
        self.winners_info: list = []           # 上一手结算展示
        self.hand_in_progress = False

    # ---- 座位管理 ----
    def seated_players(self) -> list[Player]:
        return sorted(self.players.values(), key=lambda p: p.seat)

    def take_seat(self, sid: str, name: str) -> Player:
        used = {p.seat for p in self.players.values()}
        seat = next(i for i in range(self.max_seats) if i not in used)
        player = Player(sid, name, seat)
        self.players[sid] = player
        return player

    def remove_player(self, sid: str):
        self.players.pop(sid, None)

    def active_players(self) -> list[Player]:
        """未弃牌且参与本手的玩家。"""
        return [p for p in self.players.values()
                if not p.folded and not p.sitting_out and p.hole]

    def ready_players(self) -> list[Player]:
        """有筹码、可参与下一手的玩家。"""
        return [p for p in self.seated_players()
                if p.chips > 0 and not p.sitting_out]

    # ---- 开始新的一手 ----
    def start_hand(self) -> bool:
        ready = self.ready_players()
        if len(ready) < 2:
            return False
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

        ready = self.ready_players()
        seats = [p.seat for p in ready]
        # 推进按钮到下一个有效座位
        self.button = self._next_seat(self.button, seats)
        # 发底牌
        for p in ready:
            p.hole = self.deck.deal(2)

        self._post_blinds(ready, seats)
        return True

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
            # 单挑：按钮位下小盲
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
        # 第一个行动者：大盲下一位
        first_seat = self._next_seat(bb_seat, seats)
        first = self._seat_player(first_seat)
        self.current_turn = first.sid

    def _place_bet(self, player: Player, amount: int):
        """下注，自动处理筹码不足的全下。"""
        amount = min(amount, player.chips)
        player.chips -= amount
        player.bet += amount
        player.total_bet += amount
        self.pot += amount
        if player.chips == 0:
            player.all_in = True
        return amount

    # ---- 玩家行动 ----
    def apply_action(self, sid: str, action: str, amount: int = 0) -> tuple[bool, str]:
        """处理一个行动。返回 (是否合法, 错误信息)。"""
        if sid != self.current_turn:
            return False, "还没轮到你"
        player = self.players.get(sid)
        if player is None or player.folded or player.all_in:
            return False, "无法行动"

        to_call = self.current_bet - player.bet

        if action == "fold":
            player.folded = True
        elif action == "check":
            if to_call > 0:
                return False, "当前无法过牌，需要跟注"
        elif action == "call":
            if to_call <= 0:
                return False, "无需跟注，请过牌"
            self._place_bet(player, to_call)
        elif action == "raise":
            # amount 为加注到的总额
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
        elif action == "allin":
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

    def _reset_acted_except(self, sid: str):
        """有人加注后，其余未全下玩家需要重新行动。"""
        for p in self.players.values():
            if p.sid != sid and not p.folded and not p.all_in:
                p.acted = False

    def _contenders(self) -> list[Player]:
        """仍可争夺底池（未弃牌）的玩家。"""
        return [p for p in self.players.values() if not p.folded and p.hole]

    def _to_act(self) -> list[Player]:
        """本轮仍需行动的玩家。"""
        return [p for p in self._contenders()
                if not p.all_in and (not p.acted or p.bet < self.current_bet)]

    def _advance(self, from_sid: str):
        """推进到下一行动者，或进入下一阶段。"""
        contenders = self._contenders()
        # 只剩一人未弃牌 → 直接结算
        if len(contenders) <= 1:
            self._finish_hand()
            return
        if not self._to_act():
            self._next_stage()
            return
        # 找到下一个需要行动的玩家
        from_seat = self.players[from_sid].seat
        seats = [p.seat for p in contenders if not p.all_in]
        nxt_seat = self._next_seat(from_seat, sorted(seats + [from_seat]))
        # 跳过已全下者，循环找下一个有效行动者
        ordered = sorted(self._contenders(), key=lambda p: p.seat)
        n = len(ordered)
        idx = next(i for i, p in enumerate(ordered) if p.seat == from_seat)
        for step in range(1, n + 1):
            cand = ordered[(idx + step) % n]
            if not cand.all_in and (not cand.acted or cand.bet < self.current_bet):
                self.current_turn = cand.sid
                return
        self._next_stage()

    def _next_stage(self):
        """结束当前下注轮，发公共牌或进入摊牌。"""
        for p in self.players.values():
            p.bet = 0
            p.acted = False
        self.current_bet = 0
        self.min_raise = self.big_blind

        # 若可行动者不足 2，直接发完剩余公共牌并摊牌
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
            # 无人可继续下注：自动发完到河牌再结算
            if self.stage != Stage.RIVER:
                self._next_stage()
            else:
                self._finish_hand()
            return
        # 设定本轮首个行动者：按钮后第一个可行动者
        seats = [p.seat for p in can_act]
        first_seat = self._next_seat(self.button, sorted(seats))
        self.current_turn = self._seat_player(first_seat).sid
        self.last_aggressor = None

    # ---- 结算 ----
    def _finish_hand(self):
        self.current_turn = None
        contenders = self._contenders()

        if len(contenders) == 1:
            # 其余全部弃牌，唯一玩家通吃
            winner = contenders[0]
            winner.chips += self.pot
            self.winners_info = [{
                "name": winner.name, "amount": self.pot,
                "hand": "对手弃牌", "cards": [],
            }]
        else:
            self._settle_showdown(contenders)

        self.pot = 0
        self.stage = Stage.SHOWDOWN
        self.hand_in_progress = False

    def _settle_showdown(self, contenders: list[Player]):
        """按边池分配奖金。"""
        scores = {p.sid: evaluate_best(p.hole + self.community) for p in contenders}
        # 依据每位玩家的累计下注构造边池
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
        """构造边池列表: [(金额, [有资格的 sid]), ...]"""
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
        self.winners_info = []
        for sid, amt in payouts.items():
            if amt <= 0:
                continue
            player = self.players[sid]
            player.chips += amt
            cat, *vals = scores[sid]
            hand_name = CATEGORY_NAMES.get(cat, "未知牌型")
            self.winners_info.append({
                "name": player.name,
                "amount": amt,
                "hand": hand_name,
                "cards": [c.to_dict() for c in player.hole],
            })

    # ---- 状态序列化 ----
    def serialize(self, viewer_sid: str = None) -> dict:
        """返回给前端的完整桌面状态。viewer_sid 指定视角玩家（隐藏其他底牌）。"""
        def _player_dict(p: Player, reveal_hole: bool = False):
            return {
                "sid": p.sid,
                "name": p.name,
                "seat": p.seat,
                "chips": p.chips,
                "bet": p.bet,
                "hole": [c.to_dict() for c in p.hole] if reveal_hole else len(p.hole),
                "folded": p.folded,
                "all_in": p.all_in,
                "sitting_out": p.sitting_out,
            }

        return {
            "id": self.id,
            "name": self.name,
            "stage": self.stage.value,
            "pot": self.pot,
            "current_bet": self.current_bet,
            "button": self.button,
            "current_turn": self.current_turn,
            "community": [c.to_dict() for c in self.community],
            "players": [
                _player_dict(p, p.sid == viewer_sid or self.stage == Stage.SHOWDOWN)
                for p in self.seated_players()
            ],
            "winners": self.winners_info,
        }
