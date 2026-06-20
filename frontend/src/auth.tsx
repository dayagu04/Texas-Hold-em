/*
 * 认证上下文 · 持有 token + 当前用户名，驱动路由守卫。
 * 登录写 token 并连 socket；登出清 token 并断开。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { clearToken, getToken, setToken } from "./api";
import { connectSocket, disconnectSocket, IS_MOCK } from "./socket";
import { clearMeCache } from "./hooks/useMe";

interface AuthValue {
  name: string | null;
  isAuthed: boolean;
  signIn: (token: string, name: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

const NAME_KEY = "ch_name";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState<string | null>(() =>
    getToken() || IS_MOCK ? localStorage.getItem(NAME_KEY) : null,
  );

  // 已有 token（刷新后）则自动建连
  useEffect(() => {
    if (getToken() || IS_MOCK) connectSocket();
  }, []);

  const signIn = useCallback((token: string, userName: string) => {
    setToken(token);
    localStorage.setItem(NAME_KEY, userName);
    setName(userName);
    connectSocket();
  }, []);

  const signOut = useCallback(() => {
    clearToken();
    localStorage.removeItem(NAME_KEY);
    setName(null);
    disconnectSocket();
    clearMeCache(); // 清除 useMe 缓存
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      name,
      isAuthed: IS_MOCK ? true : Boolean(getToken()),
      signIn,
      signOut,
    }),
    [name, signIn, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

// eslint-disable-next-line react-refresh/only-export-components -- useAuth hook is designed to be exported alongside provider
export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return ctx;
}
