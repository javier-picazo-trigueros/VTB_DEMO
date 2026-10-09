import React, { createContext, useState, useContext, useEffect } from 'react';
import { api } from '../utils/apiClient';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe ser usado dentro de AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [backendSleeping, setBackendSleeping] = useState(false);

  // Hydrate session from server on mount.
  // No localStorage involved — the httpOnly access cookie carries the identity.
  useEffect(() => {
    api.get('/auth/me')
      .then(({ data }) => {
        setUser({
          id:          data.user.id,
          email:       data.user.email,
          name:        data.user.name,
          role:        data.user.role,
          adminDomain: data.user.adminDomain || '',
          tourCompleted: !!data.user.tourCompleted,
        });
      })
      .catch(err => {
        // Network error or timeout → backend might be sleeping (cold start)
        if (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED' || err.code === 'ERR_CANCELED') {
          setBackendSleeping(true);
        }
        // 401 is normal (not logged in) — no action needed
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    setBackendSleeping(false);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      const userData = {
        id:          data.user.id,
        email:       data.user.email,
        name:        data.user.name,
        role:        data.user.role,
        adminDomain: data.user.adminDomain || '',
        mustChangePassword: !!data.user.mustChangePassword,
        tourCompleted: !!data.user.tourCompleted,
      };
      setUser(userData);
      return { success: true, user: userData };
    } catch (err) {
      if (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED') {
        setBackendSleeping(true);
      }
      return { success: false, error: err.response?.data?.error ?? 'Error de red' };
    }
  };

  const logout = () => {
    // Revoke refresh token + clear httpOnly cookies server-side (fire-and-forget)
    api.post('/auth/logout').catch(() => {});
    setUser(null);
  };

  // Update the in-memory user object (e.g. after profile edit).
  // Never touches localStorage.
  const setAuthUser = (userData) => setUser(userData);

  // La marca del tutorial vive en el servidor (users.tour_completed_at). Se
  // actualiza también el usuario en memoria para que otra pantalla no lo repita.
  const markTourCompleted = async (completed) => {
    const { data } = await api.patch('/auth/me/tour', { completed });
    setUser(previous => (previous ? { ...previous, tourCompleted: data.tourCompleted } : previous));
  };

  const hasRole = (role) => user && (user.role === role || user.role === 'superadmin');

  const value = {
    user,
    loading,
    backendSleeping,
    login,
    logout,
    setAuthUser,
    markTourCompleted,
    hasRole,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
