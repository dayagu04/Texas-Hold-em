/*
 * 登录页（docs/UI-DESIGN.md §5）。
 * 调 POST /api/login，存 token，跳 /lobby；失败按 error.code 映射文案。
 * M1 骨架版：暗金主题落地，动效精修在 M4。
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, login } from "../api";
import { useAuth } from "../auth";
import { errorText } from "../i18n/zh-CN";
import { zhCN } from "../i18n/zh-CN";
import { IS_MOCK } from "../socket";

export default function Login() {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

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
      navigate("/lobby", { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? errorText(e.code) : errorText("UNKNOWN"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-vignette p-4">
      <div className="w-full max-w-md rounded-panel border border-gold/40 bg-elev p-8 shadow-elev">
        <div className="mb-8 text-center">
          <h1
            className="mb-2 text-4xl text-gold"
            style={{ fontFamily: "var(--font-brand)" }}
          >
            {zhCN.login.title}
          </h1>
          <p className="text-sm text-text-lo">— {zhCN.brandSub} —</p>
        </div>
        <div className="space-y-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder={zhCN.login.placeholder}
            disabled={loading}
            className="w-full rounded-card border border-gold/50 bg-base px-4 py-3 text-text-hi placeholder:text-text-lo transition-all focus:border-gold-soft focus:shadow-[0_0_0_1px_var(--color-gold-soft)] focus:outline-none disabled:opacity-50"
          />
          {error && (
            <p className="animate-[slideDown_var(--duration-fast)_ease-out] text-sm text-danger">
              {error}
            </p>
          )}
          <button
            onClick={handleSubmit}
            disabled={loading || !name.trim()}
            className="w-full rounded-card bg-gold py-3 font-bold text-base transition-all hover:shadow-[0_0_6px_var(--color-gold)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? zhCN.login.submitting : zhCN.login.submit}
          </button>
        </div>
      </div>
    </div>
  );
}
