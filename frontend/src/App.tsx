import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { queryClient } from './lib/queryClient';
import { Toaster } from './utils/toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotFound } from './components/NotFound';
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

function PrivateRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="loading" style={{ minHeight: '100vh' }}>
        <div className="spinner"></div>
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

  if (isLoading) {
    return (
      <div className="loading" style={{ minHeight: '100vh' }}>
        <div className="spinner"></div>
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
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="profile" element={<Profile />} />
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
        {/* 404 for unmatched routes within authenticated area */}
        <Route path="*" element={<NotFound />} />
      </Route>
      {/* Global 404 */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
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
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
