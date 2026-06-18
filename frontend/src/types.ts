export interface Card {
  rank: number;
  suit: string;
  code: string;
}

export interface Player {
  sid: string;
  name: string;
  seat: number;
  chips: number;
  bet: number;
  hole: Card[] | number;  // 数组=自己的底牌，数字=别人的底牌数量
  folded: boolean;
  all_in: boolean;
  sitting_out: boolean;
}

export interface Winner {
  name: string;
  amount: number;
  hand: string;
  cards: Card[];
}

export interface TableState {
  id: string;
  name: string;
  stage: string;
  pot: number;
  current_bet: number;
  button: number;
  current_turn: string | null;
  community: Card[];
  players: Player[];
  winners: Winner[];
}

export interface LobbyTable {
  id: string;
  name: string;
  seats: string;
}
