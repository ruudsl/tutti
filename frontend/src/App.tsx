import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useTheme } from './hooks/useTheme';
import { queryClient, queryPersister, persistOptions } from './lib/queryClient';
import { Toaster } from './utils/toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotFound } from './components/NotFound';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAUpdatePrompt } from './components/PWAUpdatePrompt';
import { InstallPrompt } from './components/InstallPrompt';
import { AriaLiveProvider } from './components/AriaLiveRegion';
import { PrivacyConsentGate } from './components/PrivacyConsentGate';
import { ROLES } from './utils/constants';

// All pages - loaded immediately to avoid lazy loading issues
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

// Authentication pages
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import MicrosoftCallback from './pages/MicrosoftCallback';

// User pages
import Profile from './pages/Profile';
import SessionManagement from './pages/SessionManagement';
import DataExport from './pages/DataExport';
import MyMusic from './pages/MyMusic';
import Tools from './pages/Tools';
import Issues from './pages/Issues';
import Contacts from './pages/Contacts';
import CustomFieldsAdmin from './pages/CustomFieldsAdmin';
import PrivacySettings from './pages/PrivacySettings';
import Polls from './pages/Polls';
import Tasks from './pages/Tasks';
import Posts from './pages/Posts';
import EmailCampaigns from './pages/EmailCampaigns';
import Accounting from './pages/Accounting';

// Phase D: Operations
import Projects from './pages/Projects';
import Tours from './pages/Tours';
import Resources from './pages/Resources';
import Equipment from './pages/Equipment';

// Phase E: Automation + Content
import Outfits from './pages/Outfits';
import Wiki from './pages/Wiki';
import Workflows from './pages/Workflows';
import Performances from './pages/Performances';

// Music management
import MusicPieces from './pages/MusicPieces';
import MusicTitles from './pages/MusicTitles';
import Upload from './pages/Upload';
import PdfTools from './pages/PdfTools';
import MusicListManager from './pages/MusicListManager';
import ImslpBrowser from './pages/ImslpBrowser';

// Reference data management
import Genres from './pages/Genres';
import Loans from './pages/Loans';

// Statistics and reporting
import Statistics from './pages/Statistics';
import AuditLogs from './pages/AuditLogs';

// Admin pages
import Users from './pages/Users';
import Orchestras from './pages/Orchestras';
import Settings from './pages/Settings';
import ThemeSettings from './pages/ThemeSettings';
import Changelog from './pages/Changelog';
import EntraSync from './pages/EntraSync';
import Onboarding from './pages/Onboarding';

// Rehearsals and events
import Rehearsals from './pages/Rehearsals';
import Concerts from './pages/Concerts';
import Availability from './pages/Availability';
import Practice from './pages/Practice';

// Equipment and uniforms
import Uniforms from './pages/Uniforms';
import InstrumentAssets from './pages/InstrumentAssets';
import Events from './pages/Events';
import MultiAssociation from './pages/MultiAssociation';

// Seating management
import Seating from './pages/Seating';
import VoiceParts from './pages/VoiceParts';
import Occupancy from './pages/Occupancy';
import NeighborPreferences from './pages/NeighborPreferences';

// Other pages
import MemberDirectory from './pages/MemberDirectory';
import UserGuide from './pages/UserGuide';
import AccessibilityStatement from './pages/AccessibilityStatement';
import PracticeSchedules from './pages/PracticeSchedules';
import HealthDashboard from './pages/HealthDashboard';
import GdprAdmin from './pages/GdprAdmin';
import ShareTarget from './pages/ShareTarget';

// Ticketing
import MyTickets from './pages/MyTickets';
import TicketScanner from './pages/TicketScanner';
import TicketSales from './pages/TicketSales';
import GuestList from './pages/GuestList';
import PaymentSettings from './pages/PaymentSettings';
import PublicTicketSale from './pages/PublicTicketSale';
import MockPayment from './pages/MockPayment';
import TicketTransfer from './pages/TicketTransfer';
import AcceptTransfer from './pages/AcceptTransfer';

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
      {/* Share target for PWA - needs auth but handles redirect */}
      <Route path="/share-target" element={<ShareTarget />} />
      {/* Public ticket sale page - accessible without login */}
      <Route path="/tickets/:concertId" element={<PublicTicketSale />} />
      {/* Mock payment page for development */}
      <Route path="/tickets/orders/:orderId/mock-payment" element={<MockPayment />} />
      {/* Accept ticket transfer - accessible without login (handles redirect) */}
      <Route path="/tickets/transfer/accept/:code" element={<AcceptTransfer />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <PrivacyConsentGate>
              <Layout />
            </PrivacyConsentGate>
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
        <Route path="contacts" element={<Contacts />} />
        <Route
          path="custom-fields"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <CustomFieldsAdmin />
            </PrivateRoute>
          }
        />
        <Route path="privacy-settings" element={<PrivacySettings />} />
        <Route path="polls" element={<Polls />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="posts" element={<Posts />} />
        <Route
          path="email-campaigns"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <EmailCampaigns />
            </PrivateRoute>
          }
        />
        <Route
          path="accounting"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <Accounting />
            </PrivateRoute>
          }
        />
        <Route
          path="projects"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]}>
              <Projects />
            </PrivateRoute>
          }
        />
        <Route
          path="tours"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.BOARD]}>
              <Tours />
            </PrivateRoute>
          }
        />
        <Route
          path="resources"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.EQUIPMENT_COMMITTEE]}>
              <Resources />
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
        {/* Phase E: Automation + Content */}
        <Route path="outfits" element={<Outfits />} />
        <Route path="wiki" element={<Wiki />} />
        <Route
          path="workflows"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <Workflows />
            </PrivateRoute>
          }
        />
        <Route path="performances" element={<Performances />} />
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
          path="imslp"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <ImslpBrowser />
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
        <Route path="rehearsals" element={<Rehearsals />} />
        <Route path="availability" element={<Availability />} />
        <Route path="practice" element={<Practice />} />
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
          path="instrument-assets"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.EQUIPMENT_COMMITTEE]}>
              <InstrumentAssets />
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
          path="events"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.BOARD]}>
              <Events />
            </PrivateRoute>
          }
        />
        <Route
          path="multi-association"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <MultiAssociation />
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
        <Route path="accessibility" element={<AccessibilityStatement />} />
        <Route path="practice-schedules" element={<PracticeSchedules />} />
        <Route
          path="audit-logs"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <AuditLogs />
            </PrivateRoute>
          }
        />
        <Route
          path="health"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <HealthDashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="gdpr-admin"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <GdprAdmin />
            </PrivateRoute>
          }
        />
        <Route path="my-tickets" element={<MyTickets />} />
        <Route path="tickets/transfer" element={<TicketTransfer />} />
        <Route
          path="ticket-sales"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <TicketSales />
            </PrivateRoute>
          }
        />
        <Route
          path="concerts/:concertId/guest-list"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
              <GuestList />
            </PrivateRoute>
          }
        />
        <Route
          path="ticket-scanner"
          element={
            <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]}>
              <TicketScanner />
            </PrivateRoute>
          }
        />
        <Route
          path="payment-settings"
          element={
            <PrivateRoute roles={[ROLES.ADMIN]}>
              <PaymentSettings />
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
        <AriaLiveProvider>
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
        </AriaLiveProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default function App() {
  // PersistQueryClientProvider needs a non-null persister; fall back to a
  // no-op persister during SSR / non-browser environments.
  const persister = queryPersister ?? {
    persistClient: async () => {},
    restoreClient: async () => undefined,
    removeClient: async () => {},
  };

  return (
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister, ...persistOptions }}
      >
        <AppContent />
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
}
