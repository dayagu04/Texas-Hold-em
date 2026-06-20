/*
 * useTableState hook - 统一管理牌桌 socket 订阅和状态。
 * 从 TableShell 提取，减少组件复杂度。
 */
import { useState, useEffect } from "react";
import { subscribe } from "../socket";
import { soundManager } from "../utils/sound";
import type { ChatMessage, HandEnd } from "../types";

interface UseTableStateOptions {
  mySid: string;
  onHandEnd?: (data: HandEnd) => void;
}

export function useTableState({ mySid, onHandEnd }: UseTableStateOptions) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [handEndData, setHandEndData] = useState<HandEnd | null>(null);
  const [showHandEnd, setShowHandEnd] = useState(false);

  // 订阅聊天消息
  useEffect(() => {
    const off = subscribe("table:chat", (msg) => {
      setChatMessages((prev) => [...prev, msg]);
      soundManager.play("chat");
    });
    return off;
  }, []);

  // 订阅摊牌结算
  useEffect(() => {
    const off = subscribe("table:hand_end", (data) => {
      setHandEndData(data);
      setShowHandEnd(true);

      // 检查是否获胜（仅对 Texas/Brag 玩家结算）
      const myResult = data.results.find((r: any) => r.sid === mySid);
      if (myResult && "amount" in myResult && myResult.amount > 0) {
        soundManager.play("win");
      }

      onHandEnd?.(data);
    });
    return off;
  }, [mySid, onHandEnd]);

  return {
    chatMessages,
    setChatMessages,
    handEndData,
    showHandEnd,
    setShowHandEnd,
  };
}
