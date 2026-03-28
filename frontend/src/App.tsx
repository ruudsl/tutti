import { useEffect, lazy, Suspense, ComponentType } from 'react';
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

// Helper to wrap lazy imports with timeout to prevent infinite loading
function lazyWithTimeout<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
  timeout = 15000
): React.LazyExoticComponent<T> {
  return lazy(() => {
    return Promise.race([
      factory(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Chunk loading timed out. Please refresh the page.')), timeout)
      ),
    ]);
  });
}

// Core pages - loaded immediately
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

// Lazy loaded pages - code-split for better initial load performance
// Authentication pages
const ForgotPassword = lazyWithTimeout(() => import('./pages/ForgotPassword'));
const ResetPassword = lazyWithTimeout(() => import('./pages/ResetPassword'));
const MicrosoftCallback = lazyWithTimeout(() => import('./pages/MicrosoftCallback'));

// User pages
const Profile = lazyWithTimeout(() => import('./pages/Profile'));
const SessionManagement = lazyWithTimeout(() => import('./pages/SessionManagement'));
const DataExport = lazyWithTimeout(() => import('./pages/DataExport'));
const MyMusic = lazyWithTimeout(() => import('./pages/MyMusic'));
const Tools = lazyWithTimeout(() => import('./pages/Tools'));
const Issues = lazyWithTimeout(() => import('./pages/Issues'));

// Music management (heavy PDF processing)
const MusicPieces = lazyWithTimeout(() => import('./pages/MusicPieces'));
const MusicTitles = lazyWithTimeout(() => import('./pages/MusicTitles'));
const Upload = lazyWithTimeout(() => import('./pages/Upload'));
const PdfTools = lazyWithTimeout(() => import('./pages/PdfTools'));
const MusicListManager = lazyWithTimeout(() => import('./pages/MusicListManager'));
const ImslpBrowser = lazyWithTimeout(() => import('./pages/ImslpBrowser'));

// Reference data management
const Instruments = lazyWithTimeout(() => import('./pages/Instruments'));
const Genres = lazyWithTimeout(() => import('./pages/Genres'));
const Loans = lazyWithTimeout(() => import('./pages/Loans'));

// Statistics and reporting (charts)
const Statistics = lazyWithTimeout(() => import('./pages/Statistics'));
const AuditLogs = lazyWithTimeout(() => import('./pages/AuditLogs'));

// Admin pages
const Users = lazyWithTimeout(() => import('./pages/Users'));
const Orchestras = lazyWithTimeout(() => import('./pages/Orchestras'));
const Settings = lazyWithTimeout(() => import('./pages/Settings'));
const ThemeSettings = lazyWithTimeout(() => import('./pages/ThemeSettings'));
const Changelog = lazyWithTimeout(() => import('./pages/Changelog'));
const EntraSync = lazyWithTimeout(() => import('./pages/EntraSync'));
const Onboarding = lazyWithTimeout(() => import('./pages/Onboarding'));

// Rehearsals and events
const Rehearsals = lazyWithTimeout(() => import('./pages/Rehearsals'));
const Concerts = lazyWithTimeout(() => import('./pages/Concerts'));

// Equipment and uniforms
const Equipment = lazyWithTimeout(() => import('./pages/Equipment'));
const Uniforms = lazyWithTimeout(() => import('./pages/Uniforms'));

// Seating management
const Seating = lazyWithTimeout(() => import('./pages/Seating'));
const VoiceParts = lazyWithTimeout(() => import('./pages/VoiceParts'));
const Occupancy = lazyWithTimeout(() => import('./pages/Occupancy'));
const NeighborPreferences = lazyWithTimeout(() => import('./pages/NeighborPreferences'));

// Other pages
const MemberDirectory = lazyWithTimeout(() => import('./pages/MemberDirectory'));
const UserGuide = lazyWithTimeout(() => import('./pages/UserGuide'));
const PracticeSchedules = lazyWithTimeout(() => import('./pages/PracticeSchedules'));
const HealthDashboard = lazyWithTimeout(() => import('./pages/HealthDashboard'));

// Ticketing
const MyTickets = lazyWithTimeout(() => import('./pages/MyTickets'));
const TicketScanner = lazyWithTimeout(() => import('./pages/TicketScanner'));

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
 * Wrapper for lazy-loaded page components with Suspense and error handling
 * ErrorBoundary catches chunk loading failures to prevent infinite spinners
 */
function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoadingFallback />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

function PrivateRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

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
  // Skip persistence entirely to avoid hydration issues
  // The queryClient still handles caching in-memory, just not persisted across sessions
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
