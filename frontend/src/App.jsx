/**
 * VTB - App.jsx
 * ==============
 * Componente raíƒ­z de la aplicación.
 * Configura las rutas y el contexto de autenticación.
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'

// Páginas
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { RegisterRequest } from './pages/RegisterRequest'
import { Dashboard } from './pages/Dashboard'
import ElectionResults from './pages/ElectionResults'
import { AdminPanel } from './pages/AdminPanel'
import { VotingBooth } from './pages/VotingBooth'

/**
 * Componente ProtectedRoute:
 * Protege rutas que requieren autenticación.
 */
const ProtectedRoute = ({ element, requiredRole = null }) => {
  const { isAuthenticated, hasRole, loading } = useAuth()
  if (loading) return null
  if (!isAuthenticated) {
    return <Navigate to="/login" />
  }
  
  if (requiredRole && !hasRole(requiredRole)) {
    return <Navigate to="/dashboard" />
  }
  
  return element
}

/**
 * AppContent: Rutas principales de la aplicación.
 */
const AppContent = () => {
  return (
    <Routes>
      {/* Rutas píƒºblicas */}
      <Route path="/" element={<Navigate to="/landing" />} />
      <Route path="/landing" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register-request" element={<RegisterRequest />} />
      
      {/* Rutas protegidas (votante) */}
      <Route
        path="/dashboard"
        element={<ProtectedRoute element={<Dashboard />} />}
      />
      <Route
        path="/voting/:id"
        element={<ProtectedRoute element={<VotingBooth />} />}
      />
      <Route
        path="/results/:id"
        element={<ProtectedRoute element={<ElectionResults />} />}
      />
      <Route
        path="/voting-booth"
        element={<ProtectedRoute element={<VotingBooth />} />}
      />
      
      {/* Rutas protegidas (admin) */}
      <Route
        path="/admin"
        element={<ProtectedRoute element={<AdminPanel />} requiredRole="admin" />}
      />
      
      {/* 404 */}
      <Route path="*" element={<Navigate to="/landing" />} />
    </Routes>
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