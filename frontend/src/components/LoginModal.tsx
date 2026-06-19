/*
 * 登录弹窗（延迟登录流程用）。
 * 只输用户名 → POST /api/login → 存 token → connectSocket → 关闭 modal。
 * 调用方在 onSuccess 里自行跳转（通常到 /lobby）。
 */
import { useState } from "react";
import { ApiError, login } from "../api";
import { useAuth } from "../auth";
import { connectSocket, IS_MOCK } from "../socket";
import { errorText, zhCN } from "../i18n/zh-CN";

interface Props {
  onClose: () => void;
  onSuccess: () => void; // 登录成功后的回调（通常是 navigate("/lobby")）
}

export default function LoginModal({ onClose, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError("");
    try {
      if (IS_MOCK) {
        signIn("mock-token", trimmed);
      } else {
        const res = await login(trimmed);
        signIn(res.token, res.name);
      }
      // 登录成功后建立 socket 连接
      connectSocket();
      onClose();
      onSuccess();
    } catch (e) {
      setError(e instanceof ApiError ? errorText(e.code) : errorText("UNKNOWN"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-panel border border-gold/40 bg-elev p-8 shadow-elev">
        {/* 标题 */}
        <div className="mb-6 text-center">
          <h2
            className="mb-2 text-3xl text-gold"
            style={{ fontFamily: "var(--font-brand)" }}
          >
            {zhCN.login.title}
          </h2>
          <p className="text-sm text-text-lo">{zhCN.login.subtitle}</p>
        </div>

        {/* 输入框 */}
        <div className="space-y-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder={zhCN.login.placeholder}
            disabled={loading}
            autoFocus
            className="w-full rounded-card border border-gold/50 bg-base px-4 py-3 text-text-hi placeholder:text-text-lo transition-all focus:border-gold-soft focus:shadow-[0_0_0_1px_var(--color-gold-soft)] focus:outline-none disabled:opacity-50"
          />
          {error && (
            <p className="animate-[slideDown_var(--duration-fast)_ease-out] text-sm text-danger">
              {error}
            </p>
          )}

          {/* 按钮行 */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-card border border-rim px-4 py-3 font-bold text-text-lo transition hover:border-gold/50 hover:text-text-hi disabled:opacity-50"
            >
              {zhCN.common.cancel}
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !name.trim()}
              className="flex-1 rounded-card bg-gold py-3 font-bold text-base transition-all hover:shadow-[0_0_6px_var(--color-gold)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? zhCN.login.submitting : zhCN.login.submit}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
