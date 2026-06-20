import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import Login from "./components/Login";
import GameSelection from "./components/GameSelection";
import Lobby from "./components/Lobby";
import TablePage from "./components/TablePage";
import ProfilePage from "./components/ProfilePage";
import WhitelistAdminPage from "./components/WhitelistAdminPage";
import ErrorBoundary from "./components/ErrorBoundary";
import type { ReactNode } from "react";

/** 路由守卫：未登录访问受保护路径自动跳 /login。 */
function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthed } = useAuth();
  return isAuthed ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* 主页公开，不需登录 */}
          <Route path="/" element={<GameSelection />} />
          <Route
            path="/lobby"
            element={
              <RequireAuth>
                <Lobby />
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/whitelist"
            element={
              <RequireAuth>
                <WhitelistAdminPage />
              </RequireAuth>
            }
          />
          <Route
            path="/table/:id"
            element={
              <RequireAuth>
                <TablePage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </ErrorBoundary>
  );
}
