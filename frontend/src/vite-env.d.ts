/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** =1 时启用本地 mock 模式：socket 走 fixture 回放，不连真实后端 */
  readonly VITE_MOCK?: string;
  /** 后端地址（含 REST + Socket.IO）；默认走 vite proxy / 同源 */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
