import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Sin manualChunks (SCRUM-33). Separaba recharts y framer-motion a mano para
  // sacarlos del fichero principal, pero al forzarlos a un fichero propio Vite
  // los precargaba en TODAS las páginas: la papeleta descargaba los 114 kB de
  // recharts sin usarlos. Desde que cada página se carga bajo demanda
  // (App.jsx), el empaquetador ya los pone solo donde se usan.
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/backend': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/backend/, ''),
      },
    },
  },
})
