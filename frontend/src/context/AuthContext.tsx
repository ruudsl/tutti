import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User, LoginResponse } from '../types';
import { login as apiLogin, getProfile } from '../api/auth';
import { clearPersistedCache } from '../lib/queryClient';
import { clearAllData } from '../lib/offlineStorage';
import { wisAlleOfflineGegevens } from '../lib/offlineDb';

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
    // Remove the persisted React Query cache so no cached data lingers after logout
    clearPersistedCache();

    // En de offline opslag, want die overleefde het uitloggen.
    //
    // Beide databases hebben een vaste naam en geen enkel record draagt een
    // gebruiker- of verenigingsid. Wie na het uitloggen als lid van een andere
    // vereniging inlogt, hield daardoor het repertoire, de repetities, de
    // favorieten, het profiel en de annotaties van zijn voorganger. Op een
    // gedeelde tablet in de repetitieruimte is dat geen randgeval maar de
    // normale gang van zaken.
    //
    // De synchronisatiewachtrij overleefde het ook. Dat is het ergste deel: de
    // nieuwe gebruiker verstuurt de openstaande wijzigingen van de vorige met
    // zijn eigen token, en aan de serverkant is dat niet van echt te
    // onderscheiden.
    //
    // Bewust zonder await: uitloggen mag niet blijven hangen op een database
    // die niet meewerkt. Een fout bij het opruimen wordt gelogd, niet
    // doorgegeven - de gebruiker is dan hoe dan ook uitgelogd.
    void Promise.allSettled([clearAllData(), wisAlleOfflineGegevens()]).then((uitkomsten) => {
      for (const uitkomst of uitkomsten) {
        if (uitkomst.status === 'rejected') {
          console.error('Offline gegevens konden niet worden gewist bij uitloggen:', uitkomst.reason);
        }
      }
    });

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
