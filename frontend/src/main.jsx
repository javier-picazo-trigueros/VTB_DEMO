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
