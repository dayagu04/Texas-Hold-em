/*
 * useMobile hook - 检测是否为移动端（< 768px）。
 * 使用 Tailwind 的 md: 断点对齐。
 */
import { useState, useEffect } from "react";

const MOBILE_BREAKPOINT = 768;

export function useMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < MOBILE_BREAKPOINT;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

    const handleChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
    };

    // 现代浏览器
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    // 旧浏览器兼容
    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  return isMobile;
}
