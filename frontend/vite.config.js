import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Vite 8's bundler (Rolldown) dropped the object-map shorthand for
        // manualChunks — solo admite función. Mismo resultado que antes.
        manualChunks(id) {
          // Recharts (~350 KB) and framer-motion (~150 KB) are heavy animation/chart
          // libraries used only in results and voting pages — keep them out of the
          // main bundle so the initial voter load is faster.
          if (id.includes('node_modules/recharts')) return 'recharts'
          if (id.includes('node_modules/framer-motion')) return 'framer-motion'
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
      '/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/admin': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/registration': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
