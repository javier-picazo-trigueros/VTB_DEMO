/**
 * VTB - App.jsx
 * ==============
 * Componente raíƒ­z de la aplicación.
 * Configura las rutas y el contexto de autenticación.
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import { CookieBanner } from './components/CookieBanner'
import { NotFound } from './pages/NotFound'

// Páginas
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { RegisterRequest } from './pages/RegisterRequest'
import { Dashboard } from './pages/Dashboard'
import ElectionResults from './pages/ElectionResults'
import { AdminPanel } from './pages/AdminPanel'
import { VotingBooth } from './pages/VotingBooth'
import { InstitutionPortal } from './pages/InstitutionPortal'
import { ChangePassword } from './pages/ChangePassword'
import { UserProfile } from './pages/UserProfile'
import { Transparency } from './pages/Transparency'
import { Pricing } from './pages/Pricing'
import { ForgotPassword } from './pages/ForgotPassword'
import { ResetPassword } from './pages/ResetPassword'

const API_URL = import.meta.env.VITE_API_URL || '/backend'

/**
 * Componente ProtectedRoute:
 * Protege rutas que requieren autenticación.
 */
const ProtectedRoute = ({ element, requiredRole = null }) => {
  const { isAuthenticated, hasRole, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-6 h-6 border-2 border-warm-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-slate-400 text-sm">Cargando…</p>
      </div>
    </div>
  )
  if (!isAuthenticated) {
    return <Navigate to="/login?reason=expired" replace />
  }
  if (requiredRole && !hasRole(requiredRole)) {
    return <Navigate to="/dashboard" replace />
  }
  return element
}

/**
 * AppContent: Rutas principales de la aplicación.
 */
const AppContent = () => {
  const { backendSleeping } = useAuth()
  const isLocalBackend = !API_URL || API_URL.includes('localhost') || API_URL.includes('127.0.0.1') || (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))

  const wakeBackend = async () => {
    try {
      await fetch(`${API_URL}/health`)
      window.location.reload()
    } catch {}
  }

  return (
    <>
    {backendSleeping && (
      <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 text-center text-sm py-2 px-4 font-medium">
        {isLocalBackend
          ? 'Backend local no responde. Arranca backend con: cd backend && npm run dev'
          : 'Backend is waking up. This may take up to 30 seconds on Render free tier.'}
        <button onClick={wakeBackend} className="underline ml-2">
          Reintentar
        </button>
      </div>
    )}
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: '#1e293b',
          color: '#f1f5f9',
          border: '1px solid #334155',
          borderRadius: '12px',
          fontSize: '14px',
          fontFamily: 'Arial, sans-serif',
        },
        success: { iconTheme: { primary: '#10b981', secondary: '#f1f5f9' } },
        error: { iconTheme: { primary: '#ef4444', secondary: '#f1f5f9' } },
      }}
    />
    <Routes>
      {/* Rutas píƒºblicas */}
      <Route path="/" element={<Navigate to="/landing" />} />
      <Route path="/landing" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register-request" element={<RegisterRequest />} />
      {/* Recuperación de contraseña. Las dos rutas /auth/* son las que ya
          envían los correos (routes/auth.ts y routes/admin.ts): tienen que
          coincidir literalmente, o los enlaces de los emails dan 404. */}
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/auth/reset-password" element={<ResetPassword mode="reset" />} />
      <Route path="/auth/set-password" element={<ResetPassword mode="invitation" />} />
      <Route path="/portal/:domain" element={<InstitutionPortal />} />
      <Route path="/transparency" element={<Transparency />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/results/:id" element={<ElectionResults />} />
      
      {/* Rutas protegidas (votante) */}
      <Route
        path="/dashboard"
        element={<ProtectedRoute element={<Dashboard />} />}
      />
      <Route
        path="/voting/:id"
        element={<ProtectedRoute element={<VotingBooth />} />}
      />
      
      {/* Rutas protegidas (admin) */}
      <Route
        path="/admin"
        element={<ProtectedRoute element={<AdminPanel />} requiredRole="admin" />}
      />
      <Route
        path="/change-password"
        element={<ProtectedRoute element={<ChangePassword />} />}
      />
      <Route
        path="/profile"
        element={<ProtectedRoute element={<UserProfile />} />}
      />

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
    <CookieBanner />
    </>
  )
}

/**
 * App: Raíƒ­z de la aplicación.
 * Envuelve todo en ErrorBoundary y AuthProvider.
 */
export default function App() {
  return (
    <Router>
      <ErrorBoundary>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ErrorBoundary>
    </Router>
  )
}

