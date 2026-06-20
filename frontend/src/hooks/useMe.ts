/*
 * useMe hook - 统一管理当前用户信息。
 * 带模块级缓存，避免多组件重复请求导致跳转闪烁。
 * 头像上传后调用 refresh() 刷新缓存。
 */
import { useState, useEffect } from "react";
import * as api from "../api";
import type { MeResponse } from "../types";

// 模块级缓存
let cachedMe: MeResponse | null = null;
let cachePromise: Promise<MeResponse> | null = null;

export function useMe() {
  const [data, setData] = useState<MeResponse | null>(cachedMe);
  const [loading, setLoading] = useState(!cachedMe);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // 如果有缓存直接用
    if (cachedMe) {
      setData(cachedMe);
      setLoading(false);
      return;
    }

    // 如果正在请求，复用 promise
    if (cachePromise) {
      cachePromise
        .then((res) => {
          cachedMe = res;
          setData(res);
          setLoading(false);
        })
        .catch((err) => {
          setError(err);
          setLoading(false);
        });
      return;
    }

    // 发起新请求
    setLoading(true);
    cachePromise = api.me();
    cachePromise
      .then((res) => {
        cachedMe = res;
        setData(res);
        setError(null);
      })
      .catch((err) => {
        setError(err);
      })
      .finally(() => {
        setLoading(false);
        cachePromise = null;
      });
  }, []);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.me();
      cachedMe = res;
      setData(res);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  return { data, loading, error, refresh };
}

// 清除缓存（登出时调用）
export function clearMeCache() {
  cachedMe = null;
  cachePromise = null;
}
