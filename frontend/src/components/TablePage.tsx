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
import TableShell from "./TableShell";
import TexasBoard from "./tables/TexasBoard";
import BragBoard from "./tables/BragBoard";
import GuandanBoard from "./tables/GuandanBoard";
import ReconnectBanner from "./ReconnectBanner";
import type { PrivateState, TableState } from "../types";

export default function TablePage() {
  const { id = "" } = useParams();
  const { subscribe } = useSocket();
  const { name } = useAuth();
  const [state, setState] = useState<TableState | null>(null);
  const [priv, setPriv] = useState<PrivateState | null>(null);

  useEffect(() => {
    const offState = subscribe("table:state", setState);
    const offPriv = subscribe("table:private", setPriv);
    return () => {
      offState();
      offPriv();
    };
  }, [subscribe]);

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-felt">
        <ReconnectBanner />
        <p className="text-text-lo">加载中…</p>
      </div>
    );
  }

  // 推断 mySid（从 players 找同名；mock 模式用 fixture 的 MOCK_SELF_SID）
  const mySid =
    state.players.find((p) => p.name === name)?.sid ?? "sid-me";

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
