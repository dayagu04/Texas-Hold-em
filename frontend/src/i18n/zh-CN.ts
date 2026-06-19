/*
 * 文案字典 · 所有玩家可见字符串集中于此（docs/UI-DESIGN.md §10）。
 * v1 仅简体中文；PRD §2 非目标不做国际化，但集中以便日后扩展。
 */
import type { ErrorCode, GameType } from "../types";

export const zhCN = {
  brand: "Card House",
  brandSub: "私享扑克房 · 仅限受邀名单",

  common: {
    enter: "进入",
    create: "创建",
    cancel: "取消",
    confirm: "确认",
    back: "上一步",
    next: "下一步",
    logout: "登出",
    loading: "加载中…",
    reconnecting: "正在重连…",
    spectate: "观战",
    sit: "入座",
  },

  login: {
    title: "CARD HOUSE",
    subtitle: "— 多人在线纸牌游戏 —",
    placeholder: "输入用户名",
    submit: "进入",
    submitting: "登录中…",
  },

  gameSelection: {
    title: "选择你的游戏",
    subtitle: "挑战智慧，享受博弈乐趣",
    startGame: "开始游戏",
    toLobby: "进入大厅",
    hint: "选择一个游戏开始，或前往大厅查看正在进行的房间",
  },

  lobby: {
    title: "游戏大厅",
    welcome: (name: string) => `欢迎，${name}`,
    empty: "暂无牌桌，创建一个开始游戏",
    createTable: "新建房间",
    filterGame: "玩法",
    filterStatus: "状态",
    all: "全部",
    statusWaiting: "等待",
    statusPlaying: "进行中",
    seats: (taken: number, total: number) => `${taken}/${total}`,
    hasBots: "含 AI",
  },

  createTable: {
    title: "新建房间",
    stepGame: "选玩法",
    stepParams: "参数",
    stepBots: "AI 配置",
    tableName: "房间名",
    seats: "座位数",
    initialChips: "初始筹码",
    smallBlind: "小盲",
    ante: "底注",
    allowSpectate: "允许观战",
    botNone: "不加",
    botEasy: "简单",
    botNormal: "进阶",
    seatLabel: (n: number) => `座位 ${n}`,
    youHost: "你（房主）",
    previewBots: (n: number) => `AI ${n} 个`,
    previewComposition: (real: number, ai: number, empty: number) =>
      `${real} 真人（你）+ ${ai} 个 AI + ${empty} 个空位`,
  },

  table: {
    handNo: (id: string) => `第 ${id} 手`,
    pot: "底池",
    sidePot: "边池",
    currentBet: "当前注",
    levelCard: (lv: string) => `打 ${lv}`,
    leave: "退出",
    startHand: "开始新局",
    startGame: "开始游戏",
    starting: "开始中…",
    waitingHost: "等待房主开始",
    needMorePlayers: (n: number) => `需至少 ${n} 人`,
    waitingStart: "等待开始",
    dealer: "庄家",
    addBot: "加入 AI",
    chat: "聊天",
    chatPlaceholder: "说点什么…",
    timeout: (s: number) => `${s}s`,
  },

  actions: {
    fold: "弃牌",
    check: "过牌",
    call: "跟注",
    raise: "加注",
    all_in: "全下",
    look: "看牌",
    compare: "比牌",
    play: "出牌",
    pass: "要不起",
    hint: "提示",
    halfPot: "½ 池",
    pot: "底池",
    raiseTo: (n: number) => `加到 ${n}`,
    callAmount: (n: number) => `跟注 ${n}`,
    playN: (n: number) => `出牌 (${n})`,
  },

  stage: {
    waiting: "等待开始",
    preflop: "翻牌前",
    flop: "翻牌",
    turn: "转牌",
    river: "河牌",
    showdown: "摊牌",
    tribute: "进贡",
    play: "出牌",
    settling: "结算",
    betting: "下注",
  } satisfies Record<string, string>,

  playerStatus: {
    active: "",
    folded: "已弃牌",
    all_in: "全下",
    sitting_out: "暂离",
    won: "赢",
    lost: "败",
  },

  gameType: {
    texas: "德州扑克",
    guandan: "掼蛋",
    brag: "炸金花",
  } satisfies Record<GameType, string>,

  gameTag: {
    texas: "德扑",
    guandan: "掼蛋",
    brag: "炸金花",
  } satisfies Record<GameType, string>,

  errors: {
    AUTH_REQUIRED: "需要登录",
    NOT_ALLOWED: "用户不在白名单",
    INVALID_TOKEN: "登录已失效，请重新登录",
    TABLE_NOT_FOUND: "房间不存在",
    SEAT_TAKEN: "座位已被占用",
    FORBIDDEN: "无权操作",
    INVALID_ACTION: "非法动作",
    OUT_OF_TURN: "还没轮到你",
    RULE_VIOLATION: "不符合规则",
    UNKNOWN: "出错了，请重试",
  } satisfies Record<ErrorCode | "UNKNOWN", string>,
} as const;

/** 按错误码取文案，未知码兜底。 */
export function errorText(code: string): string {
  const map = zhCN.errors as Record<string, string>;
  return map[code] ?? zhCN.errors.UNKNOWN;
}

export type Dict = typeof zhCN;
