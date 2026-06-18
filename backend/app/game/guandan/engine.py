"""掼蛋引擎：实现 GameEngine 接口。

规则：
- 4 人固定：座位 0&2 为 A 队，1&3 为 B 队
- 2 副牌 108 张（含 4 王）
- 每人 27 张
- v1 简化：固定打 2，关进贡，首局红心 4 先出
- 先出完者名次为 1，依次 2/3/4
- 结算：双上 +3，一三 +2，一四 +1
"""
from enum import Enum
from collections import defaultdict

from ..cards import Deck, Card
from .combos import identify_combo, can_beat


class Stage(str, Enum):
    WAITING = "waiting"
    TRIBUTE = "tribute"  # v1 关闭
    PLAY = "play"
    SETTLING = "settling"


class Player:
    def __init__(self, sid: str, name: str, seat: int,
                 is_bot: bool = False, bot_level: str | None = None):
        self.sid = sid
        self.name = name
        self.seat = seat
        self.is_bot = is_bot
        self.bot_level = bot_level
        self.hole: list[Card] = []
        self.rank: int | None = None  # 1/2/3/4
        self.sitting_out = False

    def reset_for_hand(self):
        self.hole = []
        self.rank = None


class GuandanEngine:
    """掼蛋引擎。"""

    game_type = "guandan"
    min_players = 4
    max_players = 4  # 固定 4 人

    def __init__(self, table_id: str, name: str):
        self.id = table_id
        self.name = name
        self.players: dict[str, Player] = {}
        self.deck: Deck | None = None
        self.stage = Stage.WAITING
        self.level_card = 2  # v1 固定打 2
        self.current_turn: str | None = None
        self.last_play: dict | None = None  # {"sid", "combo", "cards"}
        self.pass_streak = 0  # 连续 pass 计数
        self.rankings: list[dict] = []  # [{"sid", "rank"}, ...]
        self.hand_in_progress = False
        self.hand_id = 0

    # ---- GameEngine 接口实现 ----
    def add_player(self, sid: str, name: str, seat: int,
                   is_bot: bool = False, bot_level: str | None = None) -> None:
        if len(self.players) >= 4:
            raise ValueError("掼蛋固定 4 人")
        player = Player(sid, name, seat, is_bot, bot_level)
        self.players[sid] = player

    def remove_player(self, sid: str) -> None:
        self.players.pop(sid, None)

    def can_start(self) -> bool:
        return len(self.players) == 4

    def start_hand(self) -> None:
        if len(self.players) != 4:
            raise ValueError("掼蛋需要 4 人")

        for p in self.players.values():
            p.reset_for_hand()

        # 2 副牌 = 108 张
        self.deck = Deck()
        deck2 = Deck()
        all_cards = self.deck.cards + deck2.cards
        # 添加 4 王
        all_cards += [Card(15, "J"), Card(16, "J"), Card(15, "J"), Card(16, "J")]
        import random
        random.shuffle(all_cards)

        self.stage = Stage.PLAY  # v1 跳过进贡
        self.hand_in_progress = True
        self.hand_id += 1
        self.last_play = None
        self.pass_streak = 0
        self.rankings = []

        # 每人 27 张
        seated = self._seated_players()
        for i, p in enumerate(seated):
            p.hole = all_cards[i * 27:(i + 1) * 27]

        # v1 首局：持有红心 4 者先出
        first_sid = self._find_heart_4_holder()
        self.current_turn = first_sid if first_sid else seated[0].sid

    def handle_action(self, sid: str, action: str, payload: dict) -> tuple[bool, str]:
        if sid != self.current_turn:
            return False, "还没轮到你"
        player = self.players.get(sid)
        if not player or player.rank is not None:
            return False, "无法行动"

        if action == "play":
            cards_data = payload.get("cards", [])
            if not cards_data:
                return False, "未选择牌"

            # 从手牌中移除
            played_cards = self._remove_cards_from_hole(player, cards_data)
            if not played_cards:
                return False, "所选牌不在手牌中"

            # 识别牌型
            combo = identify_combo(played_cards, self.level_card)
            if not combo:
                # 回滚
                player.hole.extend(played_cards)
                return False, "不是合法牌型"

            # 判断是否能压过上家
            if not can_beat(combo, self.last_play["combo"] if self.last_play else None):
                player.hole.extend(played_cards)
                return False, "无法压过上家"

            self.last_play = {"sid": sid, "combo": combo, "cards": played_cards}
            self.pass_streak = 0

            # 检查是否清手
            if not player.hole:
                player.rank = len(self.rankings) + 1
                self.rankings.append({"sid": sid, "rank": player.rank})
                # 检查是否结束
                if len(self.rankings) == 4:
                    self._finish_hand()
                    return True, ""

        elif action == "pass":
            self.pass_streak += 1
            # 连续 3 人 pass → 上家重新开张
            if self.pass_streak >= 3 and self.last_play:
                self.last_play = None
                self.pass_streak = 0
        else:
            return False, "未知操作"

        self._advance()
        return True, ""

    def public_state(self) -> dict:
        """公开状态，不含底牌。"""
        def _player_dict(p: Player):
            return {
                "sid": p.sid,
                "name": p.name,
                "seat": p.seat,
                "is_bot": p.is_bot,
                "bot_level": p.bot_level,
                "status": "won" if p.rank else "active",
            }

        team_a = [p.sid for p in self.players.values() if p.seat in [0, 2]]
        team_b = [p.sid for p in self.players.values() if p.seat in [1, 3]]

        return {
            "table_id": self.id,
            "game_type": self.game_type,
            "hand_id": str(self.hand_id),
            "stage": self.stage.value,
            "current_turn": {"sid": self.current_turn, "deadline": ""} if self.current_turn else None,
            "players": [_player_dict(p) for p in self._seated_players()],
            "payload": {
                "level_card": self.level_card,
                "team_a": team_a,
                "team_b": team_b,
                "hand_counts": {p.sid: len(p.hole) for p in self.players.values()},
                "last_play": {
                    "sid": self.last_play["sid"],
                    "combo_type": self.last_play["combo"]["type"],
                    "cards": [c.to_dict() for c in self.last_play["cards"]],
                } if self.last_play else None,
                "pass_streak": self.pass_streak,
                "rankings": self.rankings,
            },
            "log": [],
        }

    def private_state(self, sid: str) -> dict:
        """私有状态：底牌 + 合法操作。"""
        player = self.players.get(sid)
        if not player:
            return {"table_id": self.id, "hand_id": str(self.hand_id), "hole": [], "legal_actions": []}

        legal = self._legal_actions(player)
        return {
            "table_id": self.id,
            "hand_id": str(self.hand_id),
            "hole": [c.to_dict() for c in player.hole],
            "legal_actions": legal,
        }

    def is_hand_over(self) -> bool:
        return not self.hand_in_progress

    def get_hand_end_payload(self) -> dict:
        """返回 table:hand_end 事件的 payload。"""
        return {
            "table_id": self.id,
            "hand_id": str(self.hand_id),
            "results": self.hand_result if hasattr(self, 'hand_result') else [],
            "next_hand_in": 0,  # 0 表示等手动 start_hand
        }

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

    def _legal_actions(self, player: Player) -> list[dict]:
        if player.sid != self.current_turn or player.rank is not None:
            return []

        actions = []
        actions.append({"action": "play", "payload_schema": {"cards": "card[]"}})
        if self.last_play:
            actions.append({"action": "pass", "payload_schema": {}})
        return actions

    def _find_heart_4_holder(self) -> str | None:
        """找到持有红心 4 的玩家。"""
        for p in self.players.values():
            for c in p.hole:
                if c.rank == 4 and c.suit == "h":
                    return p.sid
        return None

    def _remove_cards_from_hole(self, player: Player, cards_data: list[dict]) -> list[Card]:
        """从手牌中移除指定牌，返回移除的 Card 对象。"""
        removed = []
        for cd in cards_data:
            for c in player.hole:
                if c.rank == cd["rank"] and c.suit == cd["suit"]:
                    player.hole.remove(c)
                    removed.append(c)
                    break
        return removed if len(removed) == len(cards_data) else []

    def _advance(self):
        """推进到下一位活跃玩家。"""
        active = [p for p in self._seated_players() if p.rank is None]
        if len(active) <= 1:
            self._finish_hand()
            return

        from_seat = self.players[self.current_turn].seat
        seats = [p.seat for p in active]
        next_seat = self._next_seat(from_seat, seats)
        for p in active:
            if p.seat == next_seat:
                self.current_turn = p.sid
                break

    def _next_seat(self, from_seat: int, seats: list[int]) -> int:
        ordered = sorted(seats)
        for s in ordered:
            if s > from_seat:
                return s
        return ordered[0]

    def _finish_hand(self):
        """结算。"""
        self.current_turn = None
        self.stage = Stage.SETTLING
        self.hand_in_progress = False

        # 剩余未清手的玩家按座位顺序排名
        for p in self._seated_players():
            if p.rank is None:
                p.rank = len(self.rankings) + 1
                self.rankings.append({"sid": p.sid, "rank": p.rank})

        # 计算结果
        rank_by_sid = {r["sid"]: r["rank"] for r in self.rankings}
        team_a_sids = [p.sid for p in self.players.values() if p.seat in [0, 2]]
        team_b_sids = [p.sid for p in self.players.values() if p.seat in [1, 3]]

        team_a_ranks = sorted([rank_by_sid[sid] for sid in team_a_sids])
        team_b_ranks = sorted([rank_by_sid[sid] for sid in team_b_sids])

        # 双上：1、2 名为同队
        if team_a_ranks == [1, 2]:
            outcome = "double_up"
            score_delta = 3
        elif team_b_ranks == [1, 2]:
            outcome = "double_up"
            score_delta = -3
        # 一三：1、3 名为同队
        elif team_a_ranks == [1, 3]:
            outcome = "first_third"
            score_delta = 2
        elif team_b_ranks == [1, 3]:
            outcome = "first_third"
            score_delta = -2
        # 一四：1、4 名为同队
        else:
            outcome = "first_fourth"
            if 1 in team_a_ranks:
                score_delta = 1
            else:
                score_delta = -1

        # v1 不维护长期积分，仅返回本局结果
        self.hand_result = [
            {"team": "A", "outcome": outcome, "score_delta": score_delta if score_delta > 0 else 0},
            {"team": "B", "outcome": outcome, "score_delta": -score_delta if score_delta < 0 else 0},
        ]