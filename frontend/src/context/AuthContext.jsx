/**
 * VTB - AuthContext.jsx
 * =====================
 * Context global para gestionar la autenticación del usuario.
 * 
 * Proporciona:
 * - Estado del usuario autenticado
 * - Funciones de login/logout
 * - Verificación de permisos
 */

import React, { createContext, useState, useContext, useEffect } from 'react'

const AuthContext = createContext()

/**
 * Hook para usar el contexto de autenticación.
 * Uso: const { user, login, logout } = useAuth()
 */
export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe ser usado dentro de AuthProvider')
  }
  return context
}

/**
 * Proveedor de autenticación.
 * Envuelve la aplicación para disponibilizar el contexto.
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Cargar usuario del localStorage al iniciar
  useEffect(() => {
    // Intentar restaurar usuario de localStorage
    const storedUser = localStorage.getItem('user')
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser))
      } catch (error) {
        console.error('Error al restaurar usuario:', error)
        localStorage.removeItem('user')
      }
    }
    
    // Si no hay usuario pero hay token, construir usuario desde tokens
    const token = localStorage.getItem('vtb-token')
    const email = localStorage.getItem('vtb-email')
    const name = localStorage.getItem('vtb-name')
    const role = localStorage.getItem('vtb-role')
    const userId = localStorage.getItem('vtb-user-id')
    
    if (token && email) {
      setUser({
        id: userId || '',
        email,
        name: name || email,
        role: role || 'student'
      })
    }
    
    setLoading(false)
  }, [])

  /**
   * Realiza login contra el backend.
   * 
   * @param {string} email - Email del usuario
   * @param {string} password - Contraseña
   * @returns {Promise<boolean>} - true si login fue exitoso
   */
  const login = async (email, password) => {
    try {
      const response = await fetch('http://localhost:5000/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        throw new Error('Credenciales inválidas')
      }

      const data = await response.json()
      const userData = data.user
      
      // Guardar usuario en estado y localStorage
      setUser(userData)
      localStorage.setItem('user', JSON.stringify(userData))
      
      return true
    } catch (error) {
      console.error('Error en login:', error)
      return false
    }
  }

  /**
   * Realiza logout.
   * Limpia el estado y localStorage.
   */
  const logout = () => {
    setUser(null)
    localStorage.removeItem('user')
    localStorage.removeItem('vtb-token')
    localStorage.removeItem('vtb-email')
    localStorage.removeItem('vtb-name')
    localStorage.removeItem('vtb-role')
    localStorage.removeItem('vtb-user-id')
    localStorage.removeItem('vtb-nullifier')
    localStorage.removeItem('vtb-election-id')
  }

  /**
   * Establece el usuario después de login exitoso.
   * 
   * @param {object} userData - Datos del usuario
   */
  const setAuthUser = (userData) => {
    setUser(userData)
    localStorage.setItem('user', JSON.stringify(userData))
    localStorage.setItem('vtb-email', userData.email || '')
    localStorage.setItem('vtb-name', userData.name || '')
    localStorage.setItem('vtb-role', userData.role || 'student')
    localStorage.setItem('vtb-user-id', userData.id || '')
  }

  /**
   * Verifica si el usuario tiene un rol específico.
   * 
   * @param {string} role - Rol a verificar (ej: 'admin')
   * @returns {boolean}
   */
  const hasRole = (role) => {
    return user && user.role === role
  }

  const value = {
    user,
    loading,
    login,
    logout,
    setAuthUser,
    hasRole,
    isAuthenticated: !!user,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
