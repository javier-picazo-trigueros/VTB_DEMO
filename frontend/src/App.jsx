/**
 * VTB - App.jsx
 * ==============
 * Componente raíƒ­z de la aplicación.
 * Configura las rutas y el contexto de autenticación.
 */

import { Suspense, lazy } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import { Footer } from './components/Footer'

/**
 * Páginas cargadas bajo demanda (SCRUM-33).
 *
 * Antes se importaban todas aquí arriba y Vite las metía en un único fichero
 * de más de 1 MB (333 kB comprimido): quien abría el enlace de su votación
 * desde el móvil descargaba también el panel de administración, los gráficos
 * de resultados y los textos legales antes de ver la papeleta. Ahora cada
 * página es su propio fichero y solo se descarga al visitarla.
 *
 * Las páginas exportan con nombre (`export function Login`), y React.lazy
 * necesita un `default`: de ahí el `pick`.
 *
 * Si falla la descarga de una página se recarga la web una vez. Pasa tras
 * cada despliegue en Vercel: quien tenía la web abierta pide ficheros con el
 * nombre antiguo, que ya no existen, y sin esto vería la pantalla de error al
 * cambiar de página. La marca en sessionStorage evita un bucle de recargas si
 * el fallo es otro (sin conexión, por ejemplo): a la segunda, el error llega
 * al ErrorBoundary.
 */
const RELOAD_FLAG = 'vtb-chunk-reload'

function page(loader, pick = 'default') {
  return lazy(() =>
    loader()
      .then((m) => {
        try { sessionStorage.removeItem(RELOAD_FLAG) } catch { /* sin sessionStorage */ }
        return { default: m[pick] }
      })
      .catch((err) => {
        let alreadyReloaded = false
        try { alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === '1' } catch { /* sin sessionStorage */ }
        if (!alreadyReloaded) {
          try { sessionStorage.setItem(RELOAD_FLAG, '1') } catch { /* sin sessionStorage */ }
          window.location.reload()
          return new Promise(() => {}) // la recarga ya está en marcha
        }
        throw err
      }),
  )
}

const Landing = page(() => import('./pages/Landing'), 'Landing')
const Login = page(() => import('./pages/Login'), 'Login')
const RegisterRequest = page(() => import('./pages/RegisterRequest'), 'RegisterRequest')
const Dashboard = page(() => import('./pages/Dashboard'), 'Dashboard')
const ElectionResults = page(() => import('./pages/ElectionResults'))
const AdminPanel = page(() => import('./pages/AdminPanel'), 'AdminPanel')
const VotingBooth = page(() => import('./pages/VotingBooth'), 'VotingBooth')
const InstitutionPortal = page(() => import('./pages/InstitutionPortal'), 'InstitutionPortal')
const ChangePassword = page(() => import('./pages/ChangePassword'), 'ChangePassword')
const UserProfile = page(() => import('./pages/UserProfile'), 'UserProfile')
const Transparency = page(() => import('./pages/Transparency'), 'Transparency')
const Pricing = page(() => import('./pages/Pricing'), 'Pricing')
const ForgotPassword = page(() => import('./pages/ForgotPassword'), 'ForgotPassword')
const ResetPassword = page(() => import('./pages/ResetPassword'), 'ResetPassword')
const NotFound = page(() => import('./pages/NotFound'), 'NotFound')
const PrivacyPolicy = page(() => import('./pages/legal/PrivacyPolicy'), 'PrivacyPolicy')
const LegalNotice = page(() => import('./pages/legal/LegalNotice'), 'LegalNotice')
const TermsOfService = page(() => import('./pages/legal/TermsOfService'), 'TermsOfService')
const CookiePolicy = page(() => import('./pages/legal/CookiePolicy'), 'CookiePolicy')
const AccessibilityStatement = page(() => import('./pages/legal/AccessibilityStatement'), 'AccessibilityStatement')

// Quien abre el enlace de su votación necesita la cabina sí o sí: se empieza a
// descargar ya, a la vez que se comprueba la sesión, en vez de esperar a que
// ProtectedRoute la pida. En 3G son dos viajes en paralelo en lugar de en serie.
// Es el mismo import que el de `page()`, así que el fichero se descarga una vez.
if (typeof window !== 'undefined' && window.location.pathname.startsWith('/voting/')) {
  import('./pages/VotingBooth').catch(() => { /* lo reintenta page() al renderizar */ })
}

/** Indicador mientras llega una página o se comprueba la sesión. */
const PageLoader = () => (
  <div className="min-h-screen bg-warm-50 dark:bg-slate-900 flex items-center justify-center">
    <div className="text-center" role="status">
      <div className="w-6 h-6 border-2 border-warm-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-3" />
      <p className="text-slate-400 text-sm">Cargando…</p>
    </div>
  </div>
)

import { API_URL } from './utils/apiBase.js'

/**
 * Componente ProtectedRoute:
 * Protege rutas que requieren autenticación.
 */
const ProtectedRoute = ({ element, requiredRole = null }) => {
  const { isAuthenticated, hasRole, loading } = useAuth()
  if (loading) return <PageLoader />
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
    <Suspense fallback={<PageLoader />}>
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
      <Route path="/legal/privacidad" element={<PrivacyPolicy />} />
      <Route path="/legal/aviso-legal" element={<LegalNotice />} />
      <Route path="/legal/terminos" element={<TermsOfService />} />
      <Route path="/legal/cookies" element={<CookiePolicy />} />
      <Route path="/legal/accesibilidad" element={<AccessibilityStatement />} />
      
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
    </Suspense>
    <Footer />
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

