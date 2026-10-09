/**
 * VTB - main.jsx
 * ==============
 * Punto de entrada de la aplicación React.
 * Renderiza el componente App en el elemento #app del HTML.
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
// Tipografías alojadas en nuestro propio dominio (OFL-1.1): sin peticiones a Google,
// que recibiría la IP del visitante. Solo los pesos que usa la interfaz.
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-ext-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-ext-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-sans/latin-ext-600.css'
import '@fontsource/ibm-plex-sans/latin-700.css'
import '@fontsource/ibm-plex-sans/latin-ext-700.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-ext-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/ibm-plex-mono/latin-ext-500.css'
import './index.css'
import './i18n/config'
import { ThemeProvider } from './context/ThemeContext'
import { clearLegacyStorageKeys } from './utils/auth.js'

// Antes de la migración a cookies httpOnly, la sesión se guardaba en
// localStorage (email y nombre incluidos). Un navegador que no haya vuelto a
// pasar por /login desde entonces todavía podría tenerlas.
clearLegacyStorageKeys()

ReactDOM.createRoot(document.getElementById('app')).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)

// Retira la pantalla de arranque de index.html. Vive fuera de #app, así que
// React no la toca: hay que quitarla aquí. Se espera al siguiente frame para
// que el primer render ya haya pintado y no aparezca un destello en blanco.
requestAnimationFrame(() => {
  document.getElementById('app-boot')?.remove()
})
