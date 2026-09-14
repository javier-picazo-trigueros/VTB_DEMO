/**
 * VTB - main.jsx
 * ==============
 * Punto de entrada de la aplicación React.
 * Renderiza el componente App en el elemento #app del HTML.
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './i18n/config'
import { ThemeProvider } from './context/ThemeContext'

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
