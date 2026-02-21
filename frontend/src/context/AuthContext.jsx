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

  useEffect(() => {
    const token = localStorage.getItem('vtb-token')
    if (token && !isTokenValid(token)) {
      logout()
      setLoading(false)
      return
    }
    const storedUser = localStorage.getItem('vtb-user')
    if (token && storedUser && isTokenValid(token)) {
      try {
        setUser(JSON.parse(storedUser))
      } catch(e) {}
    }
    setLoading(false)
  }, [])

  const login = async (email, password) => {
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
      return false
    }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('vtb-token')
    localStorage.removeItem('vtb-user')
  }

  const setAuthUser = (userData) => {
    setUser(userData)
    localStorage.setItem('vtb-user', JSON.stringify(userData))
  }

  const hasRole = (role) => user && user.role === role

  const value = {
    user,
    loading,
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