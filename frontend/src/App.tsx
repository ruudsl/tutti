import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import MyMusic from './pages/MyMusic';
import MusicPieces from './pages/MusicPieces';
import Upload from './pages/Upload';
import Instruments from './pages/Instruments';
import Genres from './pages/Genres';
import Users from './pages/Users';
import Orchestras from './pages/Orchestras';
import MusicListManager from './pages/MusicListManager';

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
        <Route path="my-music" element={<MyMusic />} />
        <Route
          path="music-pieces"
          element={
            <PrivateRoute roles={['admin', 'music_committee']}>
              <MusicPieces />
            </PrivateRoute>
          }
        />
        <Route
          path="upload"
          element={
            <PrivateRoute roles={['admin', 'music_committee']}>
              <Upload />
            </PrivateRoute>
          }
        />
        <Route
          path="instruments"
          element={
            <PrivateRoute roles={['admin', 'music_committee']}>
              <Instruments />
            </PrivateRoute>
          }
        />
        <Route
          path="genres"
          element={
            <PrivateRoute roles={['admin', 'music_committee']}>
              <Genres />
            </PrivateRoute>
          }
        />
        <Route
          path="users"
          element={
            <PrivateRoute roles={['admin']}>
              <Users />
            </PrivateRoute>
          }
        />
        <Route
          path="orchestras"
          element={
            <PrivateRoute roles={['admin']}>
              <Orchestras />
            </PrivateRoute>
          }
        />
        <Route
          path="lists"
          element={
            <PrivateRoute roles={['admin', 'music_committee']}>
              <MusicListManager />
            </PrivateRoute>
          }
        />
        <Route
          path="lists/:orchestraId/:listId"
          element={
            <PrivateRoute roles={['admin', 'music_committee']}>
              <MusicListManager />
            </PrivateRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
