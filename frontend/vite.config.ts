import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5166,
    proxy: {
      '/socket.io': {
        target: 'http://127.0.0.1:8000',
        ws: true,
      },
      '/api': {
        target: 'http://127.0.0.1:8000',
      },
      // 头像等静态资源由后端 /static 提供;不转发会导致上传后重开页面
      // 头像 404 回退首字母(看似"没保存")。
      '/static': {
        target: 'http://127.0.0.1:8000',
      }
    }
  }
})
