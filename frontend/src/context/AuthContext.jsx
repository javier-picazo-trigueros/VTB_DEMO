import React, { createContext, useState, useContext, useEffect } from 'react'

const AuthContext = createContext()
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

function isTokenValid(token) {
  try {
    if (!token) return false
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const payload = JSON.parse(atob(parts[1]))
    if (payload.exp && payload.exp * 1000 < Date.now()) return false
    return true
  } catch (error) {
    return false
  }
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe ser usado dentro de AuthProvider')
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [backendSleeping, setBackendSleeping] = useState(false)

  const clearAuth = () => {
    const keys = ['vtb-token', 'vtb-user', 'vtb-role', 'vtb-user-id', 'vtb-email', 'vtb-name', 'vtb-admin-domain'];
    keys.forEach(k => localStorage.removeItem(k));
    setUser(null);
  };

  useEffect(() => {
    const validateToken = async () => {
      const token = localStorage.getItem('vtb-token')
      if (!token) {
        setLoading(false)
        return
      }
      if (!isTokenValid(token)) {
        clearAuth()
        setLoading(false)
        return
      }
      try {
        const response = await fetch(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (response.ok) {
          const data = await response.json()
          const userData = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            role: data.user.role,
            adminDomain: data.user.adminDomain || '',
          }
          setUser(userData)
          localStorage.setItem('vtb-user', JSON.stringify(userData))
        } else {
          // 401 or 404 — user no longer exists in DB (e.g. after backend restart)
          clearAuth()
        }
      } catch (err) {
        // Network error — fall back to stored user so offline sessions survive
        const storedUser = localStorage.getItem('vtb-user')
        if (storedUser) {
          try { setUser(JSON.parse(storedUser)) } catch (e) {}
        }
        if (err instanceof TypeError) {
          setBackendSleeping(true)
        }
      } finally {
        setLoading(false)
      }
    }

    validateToken()
  }, [])

  const login = async (email, password) => {
    setBackendSleeping(false)
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!response.ok) throw new Error('Credenciales invalidas')
      const data = await response.json()
      const token = data.token
      const userData = data.user
      localStorage.setItem('vtb-token', token)
      localStorage.setItem('vtb-user', JSON.stringify(userData))
      setUser(userData)
      return true
    } catch (error) {
      console.error('Error en login:', error)
      if (error instanceof TypeError) {
        setBackendSleeping(true)
      }
      return false
    }
  }

  const logout = () => {
    clearAuth()
  }

  const setAuthUser = (userData) => {
    setUser(userData)
    localStorage.setItem('vtb-user', JSON.stringify(userData))
  }

  const hasRole = (role) => user && (user.role === role || user.role === 'superadmin')

  const value = {
    user,
    loading,
    backendSleeping,
    login,
    logout,
    setAuthUser,
    hasRole,
    isAuthenticated: !!user,
    isTokenValid,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
