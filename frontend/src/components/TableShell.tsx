/*
 * 牌桌通用容器（docs/UI-DESIGN.md §7，docs/ARCHITECTURE §2 TableShell）。
 * 布局：顶部栏 + 中央 board（Slot 出） + 右侧聊天 + 底部行动条（我的回合显示）。
 * 自己永远在屏幕底部中央；行动条按 private.legal_actions 渲染按钮。
 * M3 骨架版：布局 + 聊天输入 + 行动按钮框架；M4 精修动效 / aria-live。
 */
import { useState, useEffect, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { zhCN } from "../i18n/zh-CN";
import { emit, subscribe } from "../socket";
import { debugLog } from "../utils/debug";
import Countdown from "./Countdown";
import HandEndModal from "./HandEndModal";
import type { ActionLog, ChatMessage, CurrentTurn, GameType, HandEnd, LegalAction, PrivateState, PublicPlayer } from "../types";

/* 各玩法最小开局人数（对齐后端 min_players 校验）。 */
const MIN_PLAYERS: Record<GameType, number> = {
  texas: 2,
  brag: 2,
  guandan: 4,
};

interface Props {
  tableId: string;
  handId: string;
  currentTurn: CurrentTurn | null;
  privateState: PrivateState | null;
  mySid: string;
  log: ActionLog[]; // 行动日志（来自 table:state）
  gameType: GameType;
  stage: string; // 牌局阶段；"waiting" = 未开局
  players: PublicPlayer[];
  children: ReactNode; // board 区域
}

export default function TableShell({
  tableId,
  handId,
  currentTurn,
  privateState,
  mySid,
  log,
  gameType,
  stage,
  players,
  children,
}: Props) {
  const navigate = useNavigate();
  const [chatText, setChatText] = useState("");
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [liveAnnounce, setLiveAnnounce] = useState("");
  const [showHandEnd, setShowHandEnd] = useState(false);
  const [handEndData, setHandEndData] = useState<HandEnd | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const isMyTurn = currentTurn?.sid === mySid;
  const legalActions = privateState?.legal_actions ?? [];

  // 房主 = 0 号位玩家；牌局未开局（waiting）时才展示开始入口。
  const hostSid = players.find((p) => p.seat === 0)?.sid;
  const isHost = hostSid != null && hostSid === mySid;
  const notStarted = stage === "waiting";
  const minPlayers = MIN_PLAYERS[gameType];
  const seatedCount = players.length;
  const enoughPlayers = seatedCount >= minPlayers;

  // 准备机制：≥2 真人时改用"准备"流程，全部真人准备后端自动开局。
  const humanPlayers = players.filter((p) => !p.is_bot);
  const humanCount = humanPlayers.length;
  const me = players.find((p) => p.sid === mySid);
  const iAmReady = me?.ready ?? false;
  const readyCount = humanPlayers.filter((p) => p.ready).length;
  const useReadyFlow = humanCount >= 2;

  // 诊断日志：开始按钮显示条件
  useEffect(() => {
    if (notStarted) {
      debugLog("[TableShell] Game not started", {
        isHost,
        hostSid,
        mySid,
        enoughPlayers,
        seatedCount,
        minPlayers,
        gameType,
        stage,
      });
    }
  }, [
    notStarted,
    isHost,
    hostSid,
    mySid,
    enoughPlayers,
    seatedCount,
    minPlayers,
    gameType,
    stage,
  ]);

  const handleStartHand = () => {
    emit("table:start_hand", { table_id: tableId });
  };

  const handleToggleReady = () => {
    emit("table:set_ready", { table_id: tableId, ready: !iAmReady });
  };

  // 订阅聊天消息
  useEffect(() => {
    const off = subscribe("table:chat", (msg) => {
      setChatMessages((prev) => [...prev, msg]);
    });
    return off;
  }, []);

  // 订阅摊牌结算：收到 table:hand_end 弹出结算浮层。
  useEffect(() => {
    const off = subscribe("table:hand_end", (data) => {
      setHandEndData(data);
      setShowHandEnd(true);
    });
    return off;
  }, []);

  // 滚动聊天到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // 行动日志变化时朗读（aria-live），延迟 setState 避免同步调用
  useEffect(() => {
    if (log.length === 0) return;
    const latest = log[log.length - 1];
    const text = `${latest.name} ${latest.action}${latest.detail ? " " + latest.detail : ""}`;
    const timer = setTimeout(() => {
      setLiveAnnounce(text);
      setTimeout(() => setLiveAnnounce(""), 100);
    }, 0);
    return () => clearTimeout(timer);
  }, [log]);

  const handleChat = () => {
    if (!chatText.trim()) return;
    emit("table:chat", { table_id: tableId, text: chatText.trim() });
    setChatText("");
  };

  const handleAction = (action: string, payload: unknown = {}) => {
    emit("table:action", { table_id: tableId, action, payload });
  };

  return (
    <div className="flex min-h-screen flex-col bg-felt">
      {/* 顶部栏 */}
      <header className="flex items-center justify-between border-b border-rim/30 bg-base/80 px-6 py-3 backdrop-blur-sm">
        <button
          onClick={() => navigate("/lobby")}
          className="rounded-card border border-rim px-3 py-1.5 text-sm text-text-lo transition hover:border-gold/50 hover:text-text-hi"
        >
          ← {zhCN.table.leave}
        </button>
        <span className="text-sm text-text-lo">
          {zhCN.table.handNo(handId)}
        </span>
        <div className="w-24"></div>
      </header>

      <div className="flex flex-1">
        {/* 中央 board 区 */}
        <main className="relative flex-1 p-6">
          {/* 开始游戏入口（仅未开局时） */}
          {notStarted && (
            <div className="mb-4 flex items-center justify-center">
              {useReadyFlow ? (
                /* ≥2 真人：准备流程（每个真人自己点，全部准备后端自动开局） */
                <div className="flex flex-col items-center gap-3">
                  <button
                    onClick={handleToggleReady}
                    className={`rounded-card px-6 py-2.5 text-sm font-bold transition ${
                      iAmReady
                        ? "border-2 border-gold bg-transparent text-gold hover:bg-gold/10"
                        : "bg-gold text-base hover:bg-gold-soft"
                    }`}
                  >
                    {iAmReady ? zhCN.table.cancelReady : zhCN.table.ready}
                  </button>
                  <span className="text-xs text-text-lo">
                    {zhCN.table.readyStatus(readyCount, humanCount)}
                  </span>
                  <ul className="flex flex-col gap-1 text-xs">
                    {humanPlayers.map((p) => (
                      <li key={p.sid} className="flex items-center gap-2">
                        <span
                          className={p.ready ? "text-gold" : "text-text-lo"}
                        >
                          {p.ready ? "✓" : "○"}
                        </span>
                        <span className="text-text-hi">{p.name}</span>
                        <span className="text-text-lo">
                          {p.ready
                            ? zhCN.table.playerReady
                            : zhCN.table.playerNotReady}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <span className="text-xs text-text-lo/70">
                    {zhCN.table.waitingReady}
                  </span>
                </div>
              ) : isHost ? (
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={handleStartHand}
                    disabled={!enoughPlayers}
                    className="rounded-card bg-gold px-6 py-2.5 text-sm font-bold text-base transition hover:bg-gold-soft disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {zhCN.table.startGame}
                  </button>
                  {!enoughPlayers && (
                    <span className="text-xs text-text-lo">
                      {zhCN.table.needMorePlayers(minPlayers)}
                    </span>
                  )}
                </div>
              ) : (
                <span className="rounded-card border border-rim/50 px-4 py-2 text-sm text-text-lo">
                  {zhCN.table.waitingHost}
                </span>
              )}
            </div>
          )}
          {children}

          {/* 实时牌型预览框（仅自己可见，数据来自 private_state.hand_rank；掼蛋为 null 不显示） */}
          {privateState?.hand_rank?.name && (
            <div className="absolute bottom-4 right-4 rounded-panel border border-gold/40 bg-base/80 px-4 py-2 backdrop-blur-sm">
              <span className="text-xs text-text-lo">
                {zhCN.table.currentHand}
              </span>
              <span className="ml-2 text-sm font-bold text-gold">
                {privateState.hand_rank.name}
              </span>
            </div>
          )}
        </main>

        {/* 右侧聊天 */}
        <aside className="w-64 border-l border-rim/30 bg-base/60 p-4 backdrop-blur-sm">
          <h3 className="mb-3 text-sm font-medium text-text-hi">
            {zhCN.table.chat}
          </h3>
          <div className="mb-3 h-64 overflow-y-auto rounded-card border border-rim bg-base/40 p-2 text-xs">
            {chatMessages.length === 0 ? (
              <p className="text-text-lo/50">暂无消息</p>
            ) : (
              chatMessages.map((m, i) => (
                <div key={i} className="mb-2">
                  <span className="font-medium text-gold">{m.name}</span>
                  <span className="ml-1 text-text-hi">{m.text}</span>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleChat()}
              placeholder={zhCN.table.chatPlaceholder}
              className="flex-1 rounded-card border border-rim bg-base px-2 py-1 text-sm text-text-hi placeholder:text-text-lo focus:border-gold-soft focus:outline-none"
            />
            <button
              onClick={handleChat}
              className="rounded-card bg-gold px-3 text-sm font-bold text-base transition hover:bg-gold-soft"
            >
              ↑
            </button>
          </div>
        </aside>
      </div>

      {/* 底部行动条（常驻，非我回合时透明隐藏） */}
      <footer
        className={`h-24 border-t border-rim/30 bg-base/90 px-6 py-4 backdrop-blur-sm transition-opacity duration-300 ${
          isMyTurn && currentTurn ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {isMyTurn && currentTurn && (
          <div className="mx-auto flex h-full max-w-4xl items-center gap-4">
            <Countdown deadline={currentTurn.deadline} />
            <div className="flex flex-1 flex-wrap gap-2">
              {legalActions.map((a) => (
                <ActionButton
                  key={a.action}
                  action={a}
                  onAction={handleAction}
                  raiseAmount={raiseAmount}
                  setRaiseAmount={setRaiseAmount}
                />
              ))}
            </div>
          </div>
        )}
      </footer>

      {/* aria-live 朗读关键动作 */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnounce}
      </div>

      {/* 摊牌结算浮层 */}
      {showHandEnd && handEndData && (
        <HandEndModal
          results={handEndData.results}
          players={players}
          nextHandIn={handEndData.next_hand_in}
          onClose={() => setShowHandEnd(false)}
          onLeave={() => {
            emit("lobby:leave_table", { table_id: tableId });
            navigate("/lobby");
          }}
        />
      )}
    </div>
  );
}

/* 行动按钮（根据 LegalAction 渲染，raise 带滑块） */
function ActionButton({
  action,
  onAction,
  raiseAmount,
  setRaiseAmount,
}: {
  action: LegalAction;
  onAction: (act: string, payload?: unknown) => void;
  raiseAmount: number;
  setRaiseAmount: (v: number) => void;
}) {
  const { action: name, payload_schema } = action;
  const needsAmount = payload_schema?.amount === "int";

  const buttonClass = (color: string) =>
    `rounded-card border-2 px-4 py-2 text-sm font-bold transition ${color}`;

  if (name === "fold") {
    return (
      <button
        onClick={() => onAction("fold")}
        className={buttonClass("border-danger bg-danger/20 text-danger hover:bg-danger/30")}
      >
        {zhCN.actions.fold}
      </button>
    );
  }
  if (name === "check") {
    return (
      <button
        onClick={() => onAction("check")}
        className={buttonClass("border-info bg-info/20 text-info hover:bg-info/30")}
      >
        {zhCN.actions.check}
      </button>
    );
  }
  if (name === "call") {
    return (
      <button
        onClick={() => onAction("call")}
        className={buttonClass("border-gold bg-gold/20 text-gold hover:bg-gold/30")}
      >
        {zhCN.actions.call}
      </button>
    );
  }
  if (name === "raise" && needsAmount) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={raiseAmount}
          onChange={(e) => setRaiseAmount(Number(e.target.value))}
          className="w-24 rounded-card border border-rim bg-base px-2 py-1 text-sm text-text-hi"
          style={{ fontFamily: "var(--font-mono)" }}
        />
        <button
          onClick={() => onAction("raise", { amount: raiseAmount })}
          className={buttonClass("border-gold bg-gold text-base hover:bg-gold-soft")}
        >
          {zhCN.actions.raise}
        </button>
      </div>
    );
  }
  if (name === "all_in") {
    return (
      <button
        onClick={() => onAction("all_in")}
        className={buttonClass("border-gold bg-gold text-base hover:bg-gold-soft animate-pulse")}
      >
        {zhCN.actions.all_in}
      </button>
    );
  }
  if (name === "pass") {
    return (
      <button
        onClick={() => onAction("pass")}
        className={buttonClass("border-rim bg-rim/20 text-text-lo hover:bg-rim/30")}
      >
        {zhCN.actions.pass}
      </button>
    );
  }
  if (name === "look") {
    return (
      <button
        onClick={() => onAction("look")}
        className={buttonClass("border-gold bg-gold text-base hover:bg-gold-soft")}
      >
        {zhCN.actions.look}
      </button>
    );
  }
  // 兜底：通用按钮
  return (
    <button
      onClick={() => onAction(name)}
      className={buttonClass("border-text-lo bg-elev text-text-hi hover:bg-elev/80")}
    >
      {name}
    </button>
  );
}
