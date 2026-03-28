import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useTheme } from './hooks/useTheme';
import { queryClient } from './lib/queryClient';
import { Toaster } from './utils/toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotFound } from './components/NotFound';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAUpdatePrompt } from './components/PWAUpdatePrompt';
import { InstallPrompt } from './components/InstallPrompt';
import { ROLES } from './utils/constants';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import MyMusic from './pages/MyMusic';
import MusicPieces from './pages/MusicPieces';
import MusicTitles from './pages/MusicTitles';
import Upload from './pages/Upload';
import Instruments from './pages/Instruments';
import Genres from './pages/Genres';
import Users from './pages/Users';
import Orchestras from './pages/Orchestras';
import MusicListManager from './pages/MusicListManager';
import Tools from './pages/Tools';
import Issues from './pages/Issues';
import PdfTools from './pages/PdfTools';
import Loans from './pages/Loans';
import Statistics from './pages/Statistics';
import Profile from './pages/Profile';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Settings from './pages/Settings';
import ThemeSettings from './pages/ThemeSettings';
import Rehearsals from './pages/Rehearsals';
import MicrosoftCallback from './pages/MicrosoftCallback';
import Changelog from './pages/Changelog';
import Equipment from './pages/Equipment';
import Uniforms from './pages/Uniforms';
import Concerts from './pages/Concerts';
import EntraSync from './pages/EntraSync';
import UserGuide from './pages/UserGuide';
import AuditLogs from './pages/AuditLogs';
import Seating from './pages/Seating';
import VoiceParts from './pages/VoiceParts';
import Occupancy from './pages/Occupancy';
import NeighborPreferences from './pages/NeighborPreferences';
import MemberDirectory from './pages/MemberDirectory';
import Onboarding from './pages/Onboarding';
import PracticeSchedules from './pages/PracticeSchedules';
import SessionManagement from './pages/SessionManagement';
import DataExport from './pages/DataExport';

function PrivateRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="loading" style={{ minHeight: '100vh' }} role="status" aria-label={t('accessibility.loadingContent')}>
        <div className="spinner" aria-hidden="true"></div>
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="loading" style={{ minHeight: '100vh' }} role="status" aria-label={t('accessibility.loadingContent')}>
        <div className="spinner" aria-hidden="true"></div>
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <PublicRoute>
            <ForgotPassword />
          </PublicRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <PublicRoute>
            <ResetPassword />
          </PublicRoute>
        }
      />
      <Route
        path="/auth/microsoft/callback"
        element={
          <PublicRoute>
            <MicrosoftCallback />
          </PublicRoute>
        }
      />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="profile" element={<Profile />} />
        <Route path="sessions" element={<SessionManagement />} />
        <Route path="data-export" element={<DataExport />} />
        <Route path="my-music" element={<MyMusic />} />
        <Route path="tools" element={<Tools />} />
        <Route path="issues" element={<Issues />} />
        <Route
          path="music-pieces"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <MusicPieces />
            </PrivateRoute>
          }
        />
        <Route
          path="titles"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <MusicTitles />
            </PrivateRoute>
          }
        />
        <Route
          path="upload"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <Upload />
            </PrivateRoute>
          }
        />
        <Route
          path="pdf-tools"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <PdfTools />
            </PrivateRoute>
          }
        />
        <Route
          path="instruments"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <Instruments />
            </PrivateRoute>
          }
        />
        <Route
          path="genres"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <Genres />
            </PrivateRoute>
          }
        />
        <Route
          path="loans"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <Loans />
            </PrivateRoute>
          }
        />
        <Route
          path="statistics"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <Statistics />
            </PrivateRoute>
          }
        />
        <Route
          path="users"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <Users />
            </PrivateRoute>
          }
        />
        <Route
          path="orchestras"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <Orchestras />
            </PrivateRoute>
          }
        />
        <Route
          path="lists"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <MusicListManager />
            </PrivateRoute>
          }
        />
        <Route
          path="lists/:orchestraId/:listId"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <MusicListManager />
            </PrivateRoute>
          }
        />
        <Route
          path="settings"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <Settings />
            </PrivateRoute>
          }
        />
        <Route
          path="theme"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <ThemeSettings />
            </PrivateRoute>
          }
        />
        <Route
          path="changelog"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <Changelog />
            </PrivateRoute>
          }
        />
        <Route
          path="rehearsals"
          element={
            <PrivateRoute>
              <Rehearsals />
            </PrivateRoute>
          }
        />
        <Route
          path="seating"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]}>
              <Seating />
            </PrivateRoute>
          }
        />
        <Route
          path="voice-parts"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]}>
              <VoiceParts />
            </PrivateRoute>
          }
        />
        <Route
          path="occupancy"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]}>
              <Occupancy />
            </PrivateRoute>
          }
        />
        <Route
          path="neighbor-preferences"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]}>
              <NeighborPreferences />
            </PrivateRoute>
          }
        />
        <Route
          path="equipment"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.EQUIPMENT_COMMITTEE]}>
              <Equipment />
            </PrivateRoute>
          }
        />
        <Route
          path="uniforms"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.UNIFORMS_COMMITTEE]}>
              <Uniforms />
            </PrivateRoute>
          }
        />
        <Route
          path="concerts"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <Concerts />
            </PrivateRoute>
          }
        />
        <Route
          path="entra-sync"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <EntraSync />
            </PrivateRoute>
          }
        />
        <Route
          path="onboarding"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <Onboarding />
            </PrivateRoute>
          }
        />
        <Route path="members" element={<MemberDirectory />} />
        <Route path="user-guide" element={<UserGuide />} />
        <Route path="practice-schedules" element={<PracticeSchedules />} />
        <Route
          path="audit-logs"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <AuditLogs />
            </PrivateRoute>
          }
        />
        {/* 404 for unmatched routes within authenticated area */}
        <Route path="*" element={<NotFound />} />
      </Route>
      {/* Global 404 */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

/**
 * Syncs the HTML lang attribute with the current i18n language (WCAG 3.1.1)
 * and loads the association theme.
 */
function AppInit() {
  const { i18n } = useTranslation();
  useTheme();

  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <AppInit />
            <AppRoutes />
            <Toaster
              toastOptions={{
                style: {
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                },
                success: {
                  iconTheme: {
                    primary: 'var(--success)',
                    secondary: 'white',
                  },
                },
                error: {
                  iconTheme: {
                    primary: 'var(--danger)',
                    secondary: 'white',
                  },
                },
              }}
            />
            <OfflineIndicator />
            <PWAUpdatePrompt />
            <InstallPrompt />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
