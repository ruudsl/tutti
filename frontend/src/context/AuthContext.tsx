import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User, LoginResponse } from '../types';
import { login as apiLogin, getProfile } from '../api';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string, mfaCode?: string) => Promise<LoginResponse>;
  loginWithToken: (token: string, user: User) => void;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialize user from localStorage for instant loading (no spinner on cold starts)
  const [user, setUser] = useState<User | null>(() => {
    try {
      const cachedUser = localStorage.getItem('user');
      return cachedUser ? JSON.parse(cachedUser) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let mounted = true;

    try {
      const token = localStorage.getItem('token');
      if (token) {
        // Verify token in background and update user data (no loading spinner)
        getProfile()
          .then((freshUser) => {
            if (mounted) {
              setUser(freshUser);
              try {
                localStorage.setItem('user', JSON.stringify(freshUser));
              } catch {
                // Ignore localStorage write errors
              }
            }
          })
          .catch(() => {
            if (mounted) {
              try {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
              } catch {
                // Ignore localStorage errors
              }
              setUser(null);
            }
          });
      }
    } catch {
      // Ignore localStorage errors
    }

    return () => {
      mounted = false;
    };
  }, []);

  const login = async (email: string, password: string, mfaCode?: string): Promise<LoginResponse> => {
    const response = await apiLogin(email, password, mfaCode);

    // If MFA is required, return the response without setting user
    if (response.requiresMfa) {
      return response;
    }

    // Successful login
    if (response.token && response.user) {
      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
      setUser(response.user);
    }

    return response;
  };

  const loginWithToken = (token: string, userData: User) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const refreshProfile = async () => {
    const profile = await getProfile();
    setUser(profile);
  };

  return (
    <AuthContext.Provider value={{ user, login, loginWithToken, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
