/*
 * 白名单管理页面（仅 admin 可访问）。
 * 列表展示 + 添加表单 + 移除按钮，不能移除自己。
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import * as api from "../api";
import { zhCN } from "../i18n/zh-CN";
import type { WhitelistUser } from "../types";

export default function WhitelistAdminPage() {
  const { name: currentUser } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<WhitelistUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadWhitelist();
  }, []);

  const loadWhitelist = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getWhitelist();
      setUsers(res.users);
    } catch (err) {
      if (err instanceof api.ApiError && err.code === "FORBIDDEN") {
        // 非 admin，重定向到大厅
        navigate("/lobby", { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    setAdding(true);
    setError(null);
    try {
      await api.addToWhitelist(trimmed, newIsAdmin);
      setNewName("");
      setNewIsAdmin(false);
      await loadWhitelist();
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加失败");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (name: string) => {
    if (name === currentUser) {
      setError(zhCN.admin.cannotRemoveSelf);
      return;
    }

    if (!confirm(zhCN.admin.confirmRemove(name))) {
      return;
    }

    setError(null);
    try {
      await api.removeFromWhitelist(name);
      await loadWhitelist();
    } catch (err) {
      setError(err instanceof Error ? err.message : "移除失败");
    }
  };

  return (
    <div className="min-h-screen bg-vignette">
      {/* 顶部栏 */}
      <header className="border-b border-rim/50 bg-base/80 px-6 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <h1
            className="text-2xl text-gold"
            style={{ fontFamily: "var(--font-brand)" }}
          >
            {zhCN.brand}
          </h1>
          <button
            onClick={() => navigate("/lobby")}
            className="rounded-card border border-rim px-3 py-1 text-sm text-text-lo transition hover:border-gold/50 hover:text-text-hi"
          >
            返回大厅
          </button>
        </div>
      </header>

      {/* 主内容 */}
      <main className="mx-auto max-w-4xl space-y-6 px-6 py-12">
        <div className="rounded-panel border border-gold/30 bg-elev p-8 shadow-card">
          <h2 className="mb-6 text-2xl font-bold text-text-hi">
            {zhCN.admin.whitelist}
          </h2>

          {/* 添加表单 */}
          <div className="mb-8 rounded-card border border-rim/70 bg-base/50 p-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="mb-2 block text-sm text-text-lo">
                  {zhCN.admin.usernamePlaceholder}
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  placeholder={zhCN.admin.usernamePlaceholder}
                  className="w-full rounded-card border border-rim bg-base px-3 py-2 text-text-hi placeholder-text-lo focus:border-gold focus:outline-none"
                />
              </div>
              <button
                onClick={handleAdd}
                disabled={adding || !newName.trim()}
                className="rounded-card bg-gold px-6 py-2 font-bold text-base transition hover:bg-gold-soft disabled:opacity-50"
              >
                {adding ? zhCN.common.loading : zhCN.admin.addUser}
              </button>
            </div>

            <label className="mt-3 flex items-center gap-2 text-sm text-text-lo">
              <input
                type="checkbox"
                checked={newIsAdmin}
                onChange={(e) => setNewIsAdmin(e.target.checked)}
                className="h-4 w-4 rounded border-rim"
              />
              {zhCN.admin.setAsAdmin}
            </label>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="mb-4 rounded-card border border-danger/50 bg-danger/10 p-3 text-sm text-danger">
              {error}
            </div>
          )}

          {/* 用户列表 */}
          {loading ? (
            <div className="py-8 text-center text-text-lo">
              {zhCN.common.loading}
            </div>
          ) : users.length === 0 ? (
            <div className="py-8 text-center text-text-lo">暂无用户</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-rim/50 text-left text-sm text-text-lo">
                    <th className="pb-3 pr-4 font-medium">用户名</th>
                    <th className="pb-3 pr-4 font-medium">积分</th>
                    <th className="pb-3 pr-4 font-medium">权限</th>
                    <th className="pb-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const isSelf = user.name === currentUser;
                    return (
                      <tr
                        key={user.name}
                        className="border-b border-rim/30 text-sm"
                      >
                        <td className="py-3 pr-4">
                          <span className="text-text-hi font-medium">
                            {user.name}
                          </span>
                          {isSelf && (
                            <span className="ml-2 text-xs text-gold">
                              {zhCN.admin.self}
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className="text-text-hi"
                            style={{ fontFamily: "var(--font-mono)" }}
                          >
                            {user.points.toLocaleString("en-US")}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={
                              user.is_admin ? "text-gold" : "text-text-lo"
                            }
                          >
                            {user.is_admin
                              ? zhCN.admin.isAdmin
                              : zhCN.admin.notAdmin}
                          </span>
                        </td>
                        <td className="py-3">
                          <button
                            onClick={() => handleRemove(user.name)}
                            disabled={isSelf}
                            title={isSelf ? zhCN.admin.cannotRemoveSelf : ""}
                            className="rounded border border-danger/50 px-3 py-1 text-xs text-danger transition hover:bg-danger/10 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {zhCN.admin.removeUser}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
