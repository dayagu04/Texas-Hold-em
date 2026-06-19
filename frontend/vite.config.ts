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
    port: 5166,
    proxy: {
      '/socket.io': {
        target: 'http://127.0.0.1:7999',
        ws: true,
      },
      '/api': {
        target: 'http://127.0.0.1:7999',
      }
    }
  }
})
