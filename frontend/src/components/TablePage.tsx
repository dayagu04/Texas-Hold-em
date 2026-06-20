/*
 * 牌桌页（docs/UI-DESIGN.md §7）。
 * 订阅 table:state / table:private，按 game_type 路由到对应 board，包裹在 TableShell。
 * M3 完整版：三种 board 联动 + TableShell 行动条。
 * 挂 ReconnectBanner。
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useSocket } from "../hooks/useSocket";
import { useAuth } from "../auth";
import { getSid, onStatus } from "../socket";
import { debugLog } from "../utils/debug";
import TableShell from "./TableShell";
import TexasBoard from "./tables/TexasBoard";
import BragBoard from "./tables/BragBoard";
import GuandanBoard from "./tables/GuandanBoard";
import ReconnectBanner from "./ReconnectBanner";
import type { PrivateState, TableState } from "../types";

export default function TablePage() {
  const { id = "" } = useParams();
  const { subscribe, emit } = useSocket();
  const { name } = useAuth();
  const [state, setState] = useState<TableState | null>(null);
  const [priv, setPriv] = useState<PrivateState | null>(null);
  // 真实 socket.id;mock 下为 fixture self sid。重连后会变,故订阅 status 刷新。
  const [sid, setSid] = useState<string | null>(() => getSid());

  useEffect(() => {
    const offState = subscribe("table:state", (s) => {
      debugLog("[TablePage] table:state received", {
        stage: s.stage,
        current_turn: s.current_turn,
        players_count: s.players.length,
      });
      setState(s);
    });
    const offPriv = subscribe("table:private", (p) => {
      debugLog("[TablePage] table:private received", {
        legal_actions: p.legal_actions?.map((a) => a.action),
        hole_count: p.hole?.length,
      });
      setPriv(p);
    });
    // 挂载晚于后端创建桌子那次 table:state 广播会错过它,导致 state 永远为 null
    // 卡在"加载中"。订阅完成后主动请求一次,后端会定向重推 table:state + table:private。
    debugLog("[TablePage] emit table:sync", { table_id: id });
    emit("table:sync", { table_id: id });
    return () => {
      offState();
      offPriv();
    };
  }, [subscribe, emit, id]);

  // connect/reconnect 后 socket.id 会刷新,后端 connect 钩子会迁移
  // engine.players 里的 sid → 这里跟随 status 重取,保证 mySid 一致。
  useEffect(
    () =>
      onStatus((s) => {
        if (s === "connected") setSid(getSid());
      }),
    [],
  );

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-felt">
        <ReconnectBanner />
        <p className="text-text-lo">加载中…</p>
      </div>
    );
  }

  // 优先用真实 socket.id;name 兜底兼容 mock / 极早期渲染。
  // 不再首选 name 匹配,避免同名残留 player 命中错误的旧 sid
  // (见 docs/features/bugfix-stale-player-no-actions.md)。
  const mySid =
    sid ?? state.players.find((p) => p.name === name)?.sid ?? "sid-me";

  // 从 state.payload 中提取 community（德州）, 其他玩法传空数组
  const community =
    state.game_type === "texas" ? state.payload.community : [];

  return (
    <>
      <ReconnectBanner />
      <TableShell
        tableId={id}
      handId={state.hand_id}
      currentTurn={state.current_turn}
      privateState={priv}
      mySid={mySid}
      log={state.log}
      gameType={state.game_type}
      stage={state.stage}
      players={state.players}
        community={community}
    >
      {state.game_type === "texas" && (
        <TexasBoard state={state} privateState={priv} mySid={mySid} />
      )}
      {state.game_type === "guandan" && (
        <GuandanBoard state={state} privateState={priv} mySid={mySid} />
      )}
      {state.game_type === "brag" && (
        <BragBoard state={state} privateState={priv} mySid={mySid} />
      )}
    </TableShell>
    </>
  );
}
