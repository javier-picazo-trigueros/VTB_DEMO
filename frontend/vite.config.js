import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Recharts (~350 KB) and framer-motion (~150 KB) are heavy animation/chart
          // libraries used only in results and voting pages — keep them out of the
          // main bundle so the initial voter load is faster.
          recharts: ['recharts'],
          'framer-motion': ['framer-motion'],
        },
      },
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
