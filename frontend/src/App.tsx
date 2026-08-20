import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ModulesProvider, useModules } from './context/ModulesContext';
import { isLocationHidden } from './utils/modules';
import { useTheme } from './hooks/useTheme';
import { queryClient, queryPersister, persistOptions } from './lib/queryClient';
import { Toaster } from './utils/toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SectionErrorBoundary } from './components/SectionErrorBoundary';
import { NotFound } from './components/NotFound';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAUpdatePrompt } from './components/PWAUpdatePrompt';
import { InstallPrompt } from './components/InstallPrompt';
import { AriaLiveProvider } from './components/AriaLiveRegion';
import { ConfirmProvider } from './hooks/useConfirm';
import { PrivacyConsentGate } from './components/PrivacyConsentGate';
import { ROLES } from './utils/constants';

// Alleen wat de eerste weergave echt nodig heeft, staat hier eager.
//
// Dashboard stond hier ook, "zodat de eerste render snel blijft". Voor wie al
// ingelogd is klopt dat, maar wie op de inlogpagina komt haalde zo eerst het
// hele dashboard met zijn widgets binnen voordat hij zijn e-mailadres kon
// typen. Dat is de duurste pagina van de twee, en de enige die je op dat
// moment zeker niet nodig hebt.
import Layout from './components/Layout';
import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));

// All other pages are lazy loaded (route-based code-splitting).
// Chunk-load failures after a deploy are handled by SectionErrorBoundary,
// which reloads the page once (sessionStorage-guarded).

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
const Contacts = lazy(() => import('./pages/Contacts'));
const CustomFieldsAdmin = lazy(() => import('./pages/CustomFieldsAdmin'));
const PrivacySettings = lazy(() => import('./pages/PrivacySettings'));
const Polls = lazy(() => import('./pages/Polls'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Posts = lazy(() => import('./pages/Posts'));
const EmailCampaigns = lazy(() => import('./pages/EmailCampaigns'));
const Accounting = lazy(() => import('./pages/Accounting'));

// Phase D: Operations
const Projects = lazy(() => import('./pages/Projects'));
const Tours = lazy(() => import('./pages/Tours'));
const Resources = lazy(() => import('./pages/Resources'));
const Equipment = lazy(() => import('./pages/Equipment'));

// Phase E: Automation + Content
const Outfits = lazy(() => import('./pages/Outfits'));
const Wiki = lazy(() => import('./pages/Wiki'));
const Workflows = lazy(() => import('./pages/Workflows'));
const Performances = lazy(() => import('./pages/Performances'));

// Music management
const MusicPieces = lazy(() => import('./pages/MusicPieces'));
const MusicTitles = lazy(() => import('./pages/MusicTitles'));
const Upload = lazy(() => import('./pages/Upload'));
const PdfTools = lazy(() => import('./pages/PdfTools'));
const MusicListManager = lazy(() => import('./pages/MusicListManager'));
const ImslpBrowser = lazy(() => import('./pages/ImslpBrowser'));

// Reference data management
const Genres = lazy(() => import('./pages/Genres'));
const Loans = lazy(() => import('./pages/Loans'));

// Statistics and reporting
const Statistics = lazy(() => import('./pages/Statistics'));
const AttendanceAnalytics = lazy(() => import('./pages/AttendanceAnalytics'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));

// Admin pages
const Users = lazy(() => import('./pages/Users'));
const Orchestras = lazy(() => import('./pages/Orchestras'));
const Settings = lazy(() => import('./pages/Settings'));
const Modules = lazy(() => import('./pages/Modules'));
const ThemeSettings = lazy(() => import('./pages/ThemeSettings'));
const Changelog = lazy(() => import('./pages/Changelog'));
const EntraSync = lazy(() => import('./pages/EntraSync'));
const Onboarding = lazy(() => import('./pages/Onboarding'));

// Rehearsals and events
const Rehearsals = lazy(() => import('./pages/Rehearsals'));
const Concerts = lazy(() => import('./pages/Concerts'));
const Availability = lazy(() => import('./pages/Availability'));
const Practice = lazy(() => import('./pages/Practice'));
const HolidaySettings = lazy(() => import('./pages/HolidaySettings'));
const SeasonPlanner = lazy(() => import('./pages/SeasonPlanner'));

// Equipment and uniforms
const Uniforms = lazy(() => import('./pages/Uniforms'));
const InstrumentAssets = lazy(() => import('./pages/InstrumentAssets'));
const Events = lazy(() => import('./pages/Events'));
const MultiAssociation = lazy(() => import('./pages/MultiAssociation'));

// External Musicians Network
const ExternalMusicians = lazy(() => import('./pages/ExternalMusicians'));
const ReplacementRequests = lazy(() => import('./pages/ReplacementRequests'));

// Seating management
const Seating = lazy(() => import('./pages/Seating'));
const VoiceParts = lazy(() => import('./pages/VoiceParts'));
const Occupancy = lazy(() => import('./pages/Occupancy'));
const NeighborPreferences = lazy(() => import('./pages/NeighborPreferences'));

// Other pages
const MemberDirectory = lazy(() => import('./pages/MemberDirectory'));
const UserGuide = lazy(() => import('./pages/UserGuide'));
const AccessibilityStatement = lazy(() => import('./pages/AccessibilityStatement'));
const PracticeSchedules = lazy(() => import('./pages/PracticeSchedules'));
const HealthDashboard = lazy(() => import('./pages/HealthDashboard'));
const GdprAdmin = lazy(() => import('./pages/GdprAdmin'));
const ShareTarget = lazy(() => import('./pages/ShareTarget'));

// Ticketing
const MyTickets = lazy(() => import('./pages/MyTickets'));
const TicketScanner = lazy(() => import('./pages/TicketScanner'));
const TicketSales = lazy(() => import('./pages/TicketSales'));
const GuestList = lazy(() => import('./pages/GuestList'));
const PaymentSettings = lazy(() => import('./pages/PaymentSettings'));
const PublicTicketSale = lazy(() => import('./pages/PublicTicketSale'));
const PublicCalendar = lazy(() => import('./pages/PublicCalendar'));
const InfoScreen = lazy(() => import('./pages/InfoScreen'));
const MockPayment = lazy(() => import('./pages/MockPayment'));
const TicketTransfer = lazy(() => import('./pages/TicketTransfer'));
const AcceptTransfer = lazy(() => import('./pages/AcceptTransfer'));

// Stage Layout Designer
const StageDesigner = lazy(() => import('./pages/StageDesigner'));
const ConcertStageSetup = lazy(() => import('./pages/ConcertStageSetup'));

/** Lightweight centered spinner shown while a route chunk loads */
function RouteLoadingFallback() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '40vh',
        width: '100%',
      }}
      role="status"
      aria-live="polite"
    >
      <div className="spinner" />
    </div>
  );
}

function PrivateRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user } = useAuth();
  const { enabled, loaded } = useModules();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" />;
  }

  // Een pagina van een uitgezette module bestaat niet voor deze vereniging,
  // ook niet via een bewaarde link. Pas oordelen zodra de stand bekend is:
  // anders zou de eerste keer inloggen iedereen wegsturen van pagina's die
  // gewoon mogen.
  if (loaded && isLocationHidden(location.pathname, enabled)) {
    return <Navigate to="/" replace />;
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
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        {/* Dezelfde pagina met de slug van een vereniging erin, zodat elke
            vereniging een eigen inloglink heeft die haar naam en logo toont.
            Bij welke vereniging je hoort staat op je account; de slug bepaalt
            alleen wat je op het scherm ziet. */}
        <Route
          path="/login/:slug"
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
        {/* Public calendar embed and info screen */}
        <Route path="/calendar/:slug" element={<PublicCalendar />} />
        {/* Dedicated info screen for lobby displays */}
        <Route path="/info-screen/:slug" element={<InfoScreen />} />
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
          {/* External Musicians Network */}
          <Route
            path="external-musicians"
            element={
              <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]}>
                <ExternalMusicians />
              </PrivateRoute>
            }
          />
          <Route
            path="replacement-requests"
            element={
              <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]}>
                <ReplacementRequests />
              </PrivateRoute>
            }
          />
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
            path="attendance-analytics"
            element={
              <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]}>
                <AttendanceAnalytics />
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
            path="modules"
            element={
              <PrivateRoute roles={[ROLES.ADMIN]}>
                <Modules />
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
            path="season-planner"
            element={
              <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]}>
                <SeasonPlanner />
              </PrivateRoute>
            }
          />
          <Route
            path="holiday-settings"
            element={
              <PrivateRoute roles={[ROLES.ADMIN]}>
                <HolidaySettings />
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
            path="stage-designer"
            element={
              <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]}>
                <StageDesigner />
              </PrivateRoute>
            }
          />
          <Route
            path="concerts/:concertId/stage"
            element={
              <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]}>
                <ConcertStageSetup />
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
    </Suspense>
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
          <ConfirmProvider>
            <AppInit />
            <SectionErrorBoundary sectionName="Routes" compact>
              <ModulesProvider>
                <AppRoutes />
              </ModulesProvider>
            </SectionErrorBoundary>
            <SectionErrorBoundary sectionName="Notifications" compact>
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
            </SectionErrorBoundary>
            <SectionErrorBoundary sectionName="Offline Indicator" compact>
              <OfflineIndicator />
            </SectionErrorBoundary>
            <SectionErrorBoundary sectionName="PWA Update" compact>
              <PWAUpdatePrompt />
            </SectionErrorBoundary>
            <SectionErrorBoundary sectionName="Install Prompt" compact>
              <InstallPrompt />
            </SectionErrorBoundary>
          </ConfirmProvider>
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
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, ...persistOptions }}>
        <AppContent />
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
}
