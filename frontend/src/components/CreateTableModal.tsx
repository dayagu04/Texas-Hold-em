/*
 * 创建房间弹窗（docs/UI-DESIGN.md §6.1）。
 * 三步式：① 选玩法（3 大卡片）→ ② 参数（座位 / 盲注 / 筹码）→ ③ AI 配置（每座位独立行）。
 * 右侧实时预览：座位数 + 玩法图标 + AI 计数。
 * M2 骨架版：基础表单 + 发 lobby:create_table；UI 精修（卡片高亮 / 动画）在 M4。
 */
import { useState, useEffect } from "react";
import { zhCN } from "../i18n/zh-CN";
import { useSocket } from "../hooks/useSocket";
import type { BotLevel, CreateTablePayload, GameType } from "../types";

interface Props {
  onClose: () => void;
  onCreated: (tableId: string) => void;
  preselectedGame?: GameType;
}

const GAME_SEATS: Record<GameType, { min: number; max: number; default: number }> = {
  texas: { min: 2, max: 6, default: 6 },
  guandan: { min: 4, max: 4, default: 4 },
  brag: { min: 2, max: 6, default: 6 },
};

export default function CreateTableModal({ onClose, onCreated, preselectedGame }: Props) {
  const { subscribe, emit } = useSocket();
  const [step, setStep] = useState(preselectedGame ? 2 : 1);
  const [gameType, setGameType] = useState<GameType | null>(preselectedGame || null);
  const [tableName, setTableName] = useState("");
  const [seats, setSeats] = useState(6);
  const [initialChips, setInitialChips] = useState(1000);
  const [smallBlind, setSmallBlind] = useState(10);
  const [ante, setAnte] = useState(10);
  const [spectatable, setSpectatable] = useState(true);
  const [bots, setBots] = useState<Record<number, BotLevel | null>>({});
  const [isCreating, setIsCreating] = useState(false);

  // 如果有预选玩法，初始化座位数
  useEffect(() => {
    if (preselectedGame) {
      const cfg = GAME_SEATS[preselectedGame];
      setSeats(cfg.default);
    }
  }, [preselectedGame]);

  useEffect(() => {
    const off = subscribe("lobby:joined", (data) => {
      if (isCreating) {
        onCreated(data.table_id);
      }
    });
    return off;
  }, [subscribe, onCreated, isCreating]);

  const handleGameSelect = (g: GameType) => {
    setGameType(g);
    const cfg = GAME_SEATS[g];
    setSeats(cfg.default);
    setStep(2);
  };

  const handleCreate = () => {
    if (!gameType) return;
    const payload: CreateTablePayload = {
      name: tableName.trim() || `${zhCN.gameType[gameType]} 桌`,
      game_type: gameType,
      seats,
      spectatable,
    };
    if (gameType === "texas") {
      payload.initial_chips = initialChips;
      payload.small_blind = smallBlind;
    } else if (gameType === "brag") {
      payload.initial_chips = initialChips;
      payload.ante = ante;
    }
    const botList = Object.entries(bots)
      .filter(([, lv]) => lv !== null)
      .map(([seat, level]) => ({ seat: Number(seat), level: level! }));
    if (botList.length) payload.bots = botList;

    setIsCreating(true);
    emit("lobby:create_table", payload);
  };

  const botCount = Object.values(bots).filter(Boolean).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-panel border border-gold/40 bg-elev shadow-elev"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <header className="flex items-center justify-between border-b border-rim/50 px-6 py-4">
          <h2 className="text-lg font-medium text-text-hi">
            {zhCN.createTable.title}
          </h2>
          <button
            onClick={onClose}
            className="text-text-lo transition hover:text-text-hi"
          >
            ✕
          </button>
        </header>

        {/* 步骤指示 */}
        <div className="flex items-center justify-center gap-4 border-b border-rim/50 px-6 py-3 text-sm">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`flex items-center gap-2 ${
                s === step ? "text-gold" : "text-text-lo"
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full ${
                  s === step
                    ? "bg-gold text-base font-bold"
                    : "border border-rim text-text-lo"
                }`}
              >
                {s}
              </span>
              <span>
                {s === 1 && zhCN.createTable.stepGame}
                {s === 2 && zhCN.createTable.stepParams}
                {s === 3 && zhCN.createTable.stepBots}
              </span>
            </div>
          ))}
        </div>

        {/* 主体 */}
        <div className="flex">
          {/* 左：表单 */}
          <div className="flex-1 p-6">
            {step === 1 && (
              <div className="grid grid-cols-3 gap-4">
                {(["texas", "guandan", "brag"] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => handleGameSelect(g)}
                    className="rounded-panel border border-gold/30 bg-base p-6 text-center transition hover:border-gold hover:bg-base/80"
                  >
                    <div className="mb-2 text-3xl">
                      {g === "texas" && "♠️"}
                      {g === "guandan" && "🃏"}
                      {g === "brag" && "🎴"}
                    </div>
                    <div className="font-medium text-text-hi">
                      {zhCN.gameType[g]}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {step === 2 && gameType && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm text-text-lo">
                    {zhCN.createTable.tableName}
                  </label>
                  <input
                    type="text"
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value)}
                    placeholder={`${zhCN.gameType[gameType]} 桌`}
                    className="w-full rounded-card border border-rim bg-base px-3 py-2 text-text-hi placeholder:text-text-lo focus:border-gold-soft focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-text-lo">
                    {zhCN.createTable.seats}
                  </label>
                  <input
                    type="number"
                    value={seats}
                    onChange={(e) => setSeats(Number(e.target.value))}
                    min={GAME_SEATS[gameType].min}
                    max={GAME_SEATS[gameType].max}
                    disabled={gameType === "guandan"}
                    className="w-full rounded-card border border-rim bg-base px-3 py-2 text-text-hi disabled:opacity-50"
                  />
                </div>
                {(gameType === "texas" || gameType === "brag") && (
                  <div>
                    <label className="mb-1 block text-sm text-text-lo">
                      {zhCN.createTable.initialChips}
                    </label>
                    <input
                      type="number"
                      value={initialChips}
                      onChange={(e) => setInitialChips(Number(e.target.value))}
                      min={100}
                      step={100}
                      className="w-full rounded-card border border-rim bg-base px-3 py-2 text-text-hi"
                    />
                  </div>
                )}
                {gameType === "texas" && (
                  <div>
                    <label className="mb-1 block text-sm text-text-lo">
                      {zhCN.createTable.smallBlind}
                    </label>
                    <input
                      type="number"
                      value={smallBlind}
                      onChange={(e) => setSmallBlind(Number(e.target.value))}
                      min={1}
                      className="w-full rounded-card border border-rim bg-base px-3 py-2 text-text-hi"
                    />
                  </div>
                )}
                {gameType === "brag" && (
                  <div>
                    <label className="mb-1 block text-sm text-text-lo">
                      {zhCN.createTable.ante}
                    </label>
                    <input
                      type="number"
                      value={ante}
                      onChange={(e) => setAnte(Number(e.target.value))}
                      min={1}
                      className="w-full rounded-card border border-rim bg-base px-3 py-2 text-text-hi"
                    />
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm text-text-lo">
                  <input
                    type="checkbox"
                    checked={spectatable}
                    onChange={(e) => setSpectatable(e.target.checked)}
                    className="accent-gold"
                  />
                  {zhCN.createTable.allowSpectate}
                </label>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-2">
                {Array.from({ length: seats }, (_, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="w-16 text-text-lo">
                      {zhCN.createTable.seatLabel(i)}
                    </span>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`seat-${i}`}
                        checked={!bots[i]}
                        onChange={() => {
                          const next = { ...bots };
                          delete next[i];
                          setBots(next);
                        }}
                        className="accent-gold"
                      />
                      <span className="text-text-lo">
                        {zhCN.createTable.botNone}
                      </span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`seat-${i}`}
                        checked={bots[i] === "easy"}
                        onChange={() => setBots({ ...bots, [i]: "easy" })}
                        className="accent-gold"
                      />
                      <span className="text-text-lo">
                        {zhCN.createTable.botEasy}
                      </span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`seat-${i}`}
                        checked={bots[i] === "normal"}
                        onChange={() => setBots({ ...bots, [i]: "normal" })}
                        className="accent-gold"
                      />
                      <span className="text-text-lo">
                        {zhCN.createTable.botNormal}
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 右：预览 */}
          <aside className="w-48 border-l border-rim/50 bg-base/40 p-6">
            <h3 className="mb-3 text-sm font-medium text-text-lo">预览</h3>
            {gameType && (
              <div className="space-y-2 text-sm text-text-hi">
                <p>{zhCN.gameType[gameType]}</p>
                <p>
                  {seats} {zhCN.createTable.seats}
                </p>
                {botCount > 0 && (
                  <p className="text-text-lo">
                    {zhCN.createTable.previewBots(botCount)}
                  </p>
                )}
              </div>
            )}
          </aside>
        </div>

        {/* 底部按钮 */}
        <footer className="flex justify-between border-t border-rim/50 px-6 py-4">
          <button
            onClick={() => (step > 1 ? setStep(step - 1) : onClose())}
            className="rounded-card border border-rim px-4 py-2 text-sm text-text-lo transition hover:border-gold/50 hover:text-text-hi"
          >
            {step === 1 ? zhCN.common.cancel : zhCN.common.back}
          </button>
          <button
            onClick={() => (step < 3 ? setStep(step + 1) : handleCreate())}
            disabled={(step === 1 && !gameType) || isCreating}
            className="rounded-card bg-gold px-4 py-2 text-sm font-bold text-base transition hover:bg-gold-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            {step === 3 ? (isCreating ? "创建中..." : zhCN.common.create) : zhCN.common.next}
          </button>
        </footer>
      </div>
    </div>
  );
}
