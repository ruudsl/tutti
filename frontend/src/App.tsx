import { useEffect, lazy, Suspense, useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useTheme } from './hooks/useTheme';
import { queryClient, queryPersister, persistOptions } from './lib/queryClient';
import { Toaster } from './utils/toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotFound } from './components/NotFound';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAUpdatePrompt } from './components/PWAUpdatePrompt';
import { InstallPrompt } from './components/InstallPrompt';
import { ROLES } from './utils/constants';

// Core pages - loaded immediately
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

// Lazy loaded pages - code-split for better initial load performance
// Authentication pages
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const MicrosoftCallback = lazy(() => import('./pages/MicrosoftCallback'));

// User pages
const Profile = lazy(() => import('./pages/Profile'));
const SessionManagement = lazy(() => import('./pages/SessionManagement'));
const DataExport = lazy(() => import('./pages/DataExport'));
const MyMusic = lazy(() => import('./pages/MyMusic'));
const Tools = lazy(() => import('./pages/Tools'));
const Issues = lazy(() => import('./pages/Issues'));

// Music management (heavy PDF processing)
const MusicPieces = lazy(() => import('./pages/MusicPieces'));
const MusicTitles = lazy(() => import('./pages/MusicTitles'));
const Upload = lazy(() => import('./pages/Upload'));
const PdfTools = lazy(() => import('./pages/PdfTools'));
const MusicListManager = lazy(() => import('./pages/MusicListManager'));
const ImslpBrowser = lazy(() => import('./pages/ImslpBrowser'));

// Reference data management
const Instruments = lazy(() => import('./pages/Instruments'));
const Genres = lazy(() => import('./pages/Genres'));
const Loans = lazy(() => import('./pages/Loans'));

// Statistics and reporting (charts)
const Statistics = lazy(() => import('./pages/Statistics'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));

// Admin pages
const Users = lazy(() => import('./pages/Users'));
const Orchestras = lazy(() => import('./pages/Orchestras'));
const Settings = lazy(() => import('./pages/Settings'));
const ThemeSettings = lazy(() => import('./pages/ThemeSettings'));
const Changelog = lazy(() => import('./pages/Changelog'));
const EntraSync = lazy(() => import('./pages/EntraSync'));
const Onboarding = lazy(() => import('./pages/Onboarding'));

// Rehearsals and events
const Rehearsals = lazy(() => import('./pages/Rehearsals'));
const Concerts = lazy(() => import('./pages/Concerts'));

// Equipment and uniforms
const Equipment = lazy(() => import('./pages/Equipment'));
const Uniforms = lazy(() => import('./pages/Uniforms'));

// Seating management
const Seating = lazy(() => import('./pages/Seating'));
const VoiceParts = lazy(() => import('./pages/VoiceParts'));
const Occupancy = lazy(() => import('./pages/Occupancy'));
const NeighborPreferences = lazy(() => import('./pages/NeighborPreferences'));

// Other pages
const MemberDirectory = lazy(() => import('./pages/MemberDirectory'));
const UserGuide = lazy(() => import('./pages/UserGuide'));
const PracticeSchedules = lazy(() => import('./pages/PracticeSchedules'));
const HealthDashboard = lazy(() => import('./pages/HealthDashboard'));

// Ticketing
const MyTickets = lazy(() => import('./pages/MyTickets'));
const TicketScanner = lazy(() => import('./pages/TicketScanner'));

/**
 * Loading fallback for lazy-loaded pages
 */
function PageLoadingFallback() {
  const { t } = useTranslation();
  return (
    <div className="loading" style={{ minHeight: '50vh' }} role="status">
      <div className="spinner" aria-hidden="true"></div>
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  );
}

/**
 * Wrapper for lazy-loaded page components with Suspense
 */
function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoadingFallback />}>{children}</Suspense>;
}

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
            <LazyPage><ForgotPassword /></LazyPage>
          </PublicRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <PublicRoute>
            <LazyPage><ResetPassword /></LazyPage>
          </PublicRoute>
        }
      />
      <Route
        path="/auth/microsoft/callback"
        element={
          <PublicRoute>
            <LazyPage><MicrosoftCallback /></LazyPage>
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
        <Route path="profile" element={<LazyPage><Profile /></LazyPage>} />
        <Route path="sessions" element={<LazyPage><SessionManagement /></LazyPage>} />
        <Route path="data-export" element={<LazyPage><DataExport /></LazyPage>} />
        <Route path="my-music" element={<LazyPage><MyMusic /></LazyPage>} />
        <Route path="tools" element={<LazyPage><Tools /></LazyPage>} />
        <Route path="issues" element={<LazyPage><Issues /></LazyPage>} />
        <Route
          path="music-pieces"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <LazyPage><MusicPieces /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="titles"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <LazyPage><MusicTitles /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="upload"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <LazyPage><Upload /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="pdf-tools"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <LazyPage><PdfTools /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="imslp"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <LazyPage><ImslpBrowser /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="instruments"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <LazyPage><Instruments /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="genres"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <LazyPage><Genres /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="loans"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <LazyPage><Loans /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="statistics"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <LazyPage><Statistics /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="users"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <LazyPage><Users /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="orchestras"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <LazyPage><Orchestras /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="lists"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <LazyPage><MusicListManager /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="lists/:orchestraId/:listId"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <LazyPage><MusicListManager /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="settings"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <LazyPage><Settings /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="theme"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <LazyPage><ThemeSettings /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="changelog"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <LazyPage><Changelog /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="rehearsals"
          element={
            <PrivateRoute>
              <LazyPage><Rehearsals /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="seating"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]}>
              <LazyPage><Seating /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="voice-parts"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]}>
              <LazyPage><VoiceParts /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="occupancy"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]}>
              <LazyPage><Occupancy /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="neighbor-preferences"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]}>
              <LazyPage><NeighborPreferences /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="equipment"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.EQUIPMENT_COMMITTEE]}>
              <LazyPage><Equipment /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="uniforms"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.UNIFORMS_COMMITTEE]}>
              <LazyPage><Uniforms /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="concerts"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <LazyPage><Concerts /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="entra-sync"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <LazyPage><EntraSync /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="onboarding"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <LazyPage><Onboarding /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route path="members" element={<LazyPage><MemberDirectory /></LazyPage>} />
        <Route path="user-guide" element={<LazyPage><UserGuide /></LazyPage>} />
        <Route path="practice-schedules" element={<LazyPage><PracticeSchedules /></LazyPage>} />
        <Route
          path="audit-logs"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <LazyPage><AuditLogs /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route
          path="health"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <LazyPage><HealthDashboard /></LazyPage>
            </PrivateRoute>
          }
        />
        <Route path="my-tickets" element={<LazyPage><MyTickets /></LazyPage>} />
        <Route
          path="ticket-scanner"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]}>
              <LazyPage><TicketScanner /></LazyPage>
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

function AppContent() {
  return (
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
  );
}

export default function App() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [hydrationTimedOut, setHydrationTimedOut] = useState(false);

  // Handle successful cache hydration
  const onSuccess = useCallback(() => {
    setIsHydrated(true);
  }, []);

  // Timeout fallback: if hydration takes too long, render anyway
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isHydrated) {
        setHydrationTimedOut(true);
        // Clear potentially corrupted cache
        try {
          localStorage.removeItem('harmonie-query-cache');
        } catch {
          // Ignore localStorage errors
        }
      }
    }, 2000); // 2 second timeout

    return () => clearTimeout(timeout);
  }, [isHydrated]);

  // Use PersistQueryClientProvider for offline support with proper hydration handling
  // This ensures queries wait for cache restoration before fetching
  if (queryPersister && !hydrationTimedOut) {
    return (
      <ErrorBoundary>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: queryPersister, ...persistOptions }}
          onSuccess={onSuccess}
        >
          <AppContent />
        </PersistQueryClientProvider>
      </ErrorBoundary>
    );
  }

  // Fallback for SSR, when localStorage is not available, or when hydration timed out
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
