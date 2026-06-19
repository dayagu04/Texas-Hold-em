/*
 * 后端 REST 调用 · 对齐 docs/API-CONTRACT.md §1。
 * token 存 localStorage（ARCHITECTURE §4 二选一）。
 */
import type {
  HandHistory,
  LobbyTable,
  LoginResponse,
  MeResponse,
  ProfileStats,
  SocketError,
} from "./types";

/** 后端地址。空字符串 → 同源 / vite proxy（开发默认）。 */
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? "";

const TOKEN_KEY = "ch_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** REST 错误：携带契约错误码，便于按 code 映射文案。 */
export class ApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  init?: RequestInit & { auth?: boolean },
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (init?.auth) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const err = (body as { error?: SocketError } | null)?.error;
    throw new ApiError(err?.code ?? "UNKNOWN", err?.message ?? res.statusText);
  }
  return body as T;
}

/** POST /api/login（API-CONTRACT §1.2） */
export function login(name: string): Promise<LoginResponse> {
  return request<LoginResponse>("/api/login", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

/** GET /api/me（API-CONTRACT §1.3） */
export function me(): Promise<MeResponse> {
  return request<MeResponse>("/api/me", { method: "GET", auth: true });
}

/** GET /api/lobby（API-CONTRACT §1.4） */
export function getLobby(): Promise<{ tables: LobbyTable[] }> {
  return request<{ tables: LobbyTable[] }>("/api/lobby", {
    method: "GET",
    auth: true,
  });
}

/** GET /api/profile/stats — 积分统计（需鉴权） */
export function getStats(): Promise<ProfileStats> {
  return request<ProfileStats>("/api/profile/stats", {
    method: "GET",
    auth: true,
  });
}

/** GET /api/profile/history — 对局历史（需鉴权，limit≤50） */
export function getHistory(limit = 20): Promise<{ history: HandHistory[] }> {
  const safe = Math.min(Math.max(1, limit), 50);
  return request<{ history: HandHistory[] }>(
    `/api/profile/history?limit=${safe}`,
    { method: "GET", auth: true },
  );
}

/** POST /api/profile/avatar - 上传头像 */
export async function uploadAvatar(file: File): Promise<{ avatar: string }> {
  const form = new FormData();
  form.append("file", file);

  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}/api/profile/avatar`, {
    method: "POST",
    headers,
    body: form,
  });

  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const err = (body as { error?: SocketError } | null)?.error;
    throw new ApiError(err?.code ?? "UNKNOWN", err?.message ?? res.statusText);
  }
  return body as { avatar: string };
}
