/**
 * VTB - App.jsx
 * ==============
 * Componente raíz de la aplicación.
 * Configura las rutas y el contexto de autenticación.
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'

// Páginas
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Results } from './pages/Results'
import { AdminPanel } from './pages/AdminPanel'
import { VotingBooth } from './pages/VotingBooth'

/**
 * Componente ProtectedRoute:
 * Protege rutas que requieren autenticación.
 */
const ProtectedRoute = ({ element, requiredRole = null }) => {
  const { isAuthenticated, hasRole } = useAuth()
  
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
      {/* Rutas públicas */}
      <Route path="/" element={<Navigate to="/landing" />} />
      <Route path="/landing" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      
      {/* Rutas protegidas (votante) */}
      <Route
        path="/dashboard"
        element={<ProtectedRoute element={<Dashboard />} />}
      />
      <Route
        path="/results/:electionId"
        element={<ProtectedRoute element={<Results />} />}
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
 * App: Raíz de la aplicación.
 * Envuelve todo en el AuthProvider.
 */
export default function App() {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  )
}
