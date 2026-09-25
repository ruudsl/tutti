import { useEffect, lazy, Suspense, type ComponentType } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ModulesProvider, useModules } from './context/ModulesContext';
import { isLocationHidden } from './utils/modules';
import { terugNaInloggen } from './utils/terugNaInloggen';
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
import { ROLES } from './utils/constants';
import { tekstenGereed } from './i18n';

// Alleen wat de eerste weergave echt nodig heeft, staat hier eager.
//
// Dashboard stond hier ook, "zodat de eerste render snel blijft". Voor wie al
// ingelogd is klopt dat, maar wie op de inlogpagina komt haalde zo eerst het
// hele dashboard met zijn widgets binnen voordat hij zijn e-mailadres kon
// typen. Dat is de duurste pagina van de twee, en de enige die je op dat
// moment zeker niet nodig hebt.
import Login from './pages/Login';

/**
 * lazy(), maar de pagina tekent pas als ook de volledige Nederlandse teksten
 * er zijn.
 *
 * In de hoofdbundel zit alleen de kern van nl.json: wat het inlogscherm nodig
 * heeft (zie tekstenKernPlugin.ts). Elke pagina hieronder gebruikt teksten
 * daarbuiten. Zonder dit wachten stond zo'n pagina even vol kale sleutels als
 * `members.title`. Het kost meestal geen tijd: de code van de pagina moet
 * toch nog binnenkomen, en het vertaalbestand komt tegelijk mee - of is er
 * al, omdat main.tsx het na de eerste weergave ophaalt.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- zelfde typering als lazy() zelf
function lui<T extends ComponentType<any>>(laad: () => Promise<{ default: T }>) {
  return lazy(() => Promise.all([laad(), tekstenGereed()]).then(([module]) => module));
}

// Layout en de toestemmingspoort stonden hier als gewone import, en dat is
// duurder dan het lijkt. Layout sleept het hele ingelogde schild mee -
// GlobalSearch, NotificationCenter, QuickActionsMenu, RecentItems,
// Breadcrumbs, OnboardingTour, SyncStatusIndicator - en via
// SyncStatusIndicator ook dexie, de IndexedDB-laag van 94 KB. Al die code
// stond in de hoofdbundel en werd dus ook gedownload en ontleed door iemand
// die alleen nog maar het inlogscherm te zien krijgt.
//
// Beide renderen uitsluitend binnen <PrivateRoute>, dus voor wie niet is
// ingelogd komt er nu niets van binnen. Wie wel inlogt haalt ze op terwijl de
// Suspense-terugval al op het scherm staat.
const Layout = lui(() => import('./components/Layout'));
const PrivacyConsentGate = lui(() =>
  import('./components/PrivacyConsentGate').then((m) => ({ default: m.PrivacyConsentGate })),
);

const Dashboard = lui(() => import('./pages/Dashboard'));

// All other pages are lazy loaded (route-based code-splitting).
// Chunk-load failures after a deploy are handled by SectionErrorBoundary,
// which reloads the page once (sessionStorage-guarded).

// Authentication pages
const ForgotPassword = lui(() => import('./pages/ForgotPassword'));
const ResetPassword = lui(() => import('./pages/ResetPassword'));
const MicrosoftCallback = lui(() => import('./pages/MicrosoftCallback'));

// User pages
const Profile = lui(() => import('./pages/Profile'));
const SessionManagement = lui(() => import('./pages/SessionManagement'));
const DataExport = lui(() => import('./pages/DataExport'));
const MyMusic = lui(() => import('./pages/MyMusic'));
const Tools = lui(() => import('./pages/Tools'));
const Issues = lui(() => import('./pages/Issues'));
const Contacts = lui(() => import('./pages/Contacts'));
const CustomFieldsAdmin = lui(() => import('./pages/CustomFieldsAdmin'));
const PrivacySettings = lui(() => import('./pages/PrivacySettings'));
const Polls = lui(() => import('./pages/Polls'));
const Tasks = lui(() => import('./pages/Tasks'));
const Posts = lui(() => import('./pages/Posts'));
const EmailCampaigns = lui(() => import('./pages/EmailCampaigns'));
const Accounting = lui(() => import('./pages/Accounting'));

// Phase D: Operations
const Projects = lui(() => import('./pages/Projects'));
const Tours = lui(() => import('./pages/Tours'));
const Resources = lui(() => import('./pages/Resources'));
const Equipment = lui(() => import('./pages/Equipment'));

// Phase E: Automation + Content
const Outfits = lui(() => import('./pages/Outfits'));
const Wiki = lui(() => import('./pages/Wiki'));
const Workflows = lui(() => import('./pages/Workflows'));
const Performances = lui(() => import('./pages/Performances'));

// Music management
const MusicPieces = lui(() => import('./pages/MusicPieces'));
const MusicTitles = lui(() => import('./pages/MusicTitles'));
const Upload = lui(() => import('./pages/Upload'));
const PdfTools = lui(() => import('./pages/PdfTools'));
const MusicListManager = lui(() => import('./pages/MusicListManager'));
const ImslpBrowser = lui(() => import('./pages/ImslpBrowser'));

// Reference data management
const Genres = lui(() => import('./pages/Genres'));
const Instrumenten = lui(() => import('./pages/Instrumenten'));
const Loans = lui(() => import('./pages/Loans'));

// Statistics and reporting
const Statistics = lui(() => import('./pages/Statistics'));
const AttendanceAnalytics = lui(() => import('./pages/AttendanceAnalytics'));
const AuditLogs = lui(() => import('./pages/AuditLogs'));

// Admin pages
const Users = lui(() => import('./pages/Users'));
const Orchestras = lui(() => import('./pages/Orchestras'));
const Settings = lui(() => import('./pages/Settings'));
const Modules = lui(() => import('./pages/Modules'));
const ThemeSettings = lui(() => import('./pages/ThemeSettings'));
const Changelog = lui(() => import('./pages/Changelog'));
const EntraSync = lui(() => import('./pages/EntraSync'));
const Importeren = lui(() => import('./pages/Importeren'));
const Onboarding = lui(() => import('./pages/Onboarding'));

// Rehearsals and events
const Rehearsals = lui(() => import('./pages/Rehearsals'));
const Concerts = lui(() => import('./pages/Concerts'));
const Availability = lui(() => import('./pages/Availability'));
const Practice = lui(() => import('./pages/Practice'));
const HolidaySettings = lui(() => import('./pages/HolidaySettings'));
const SeasonPlanner = lui(() => import('./pages/SeasonPlanner'));

// Equipment and uniforms
const Uniforms = lui(() => import('./pages/Uniforms'));
const InstrumentAssets = lui(() => import('./pages/InstrumentAssets'));
const Events = lui(() => import('./pages/Events'));
const MultiAssociation = lui(() => import('./pages/MultiAssociation'));
const MusicSharing = lui(() => import('./pages/MusicSharing'));

// External Musicians Network
const ExternalMusicians = lui(() => import('./pages/ExternalMusicians'));
const ReplacementRequests = lui(() => import('./pages/ReplacementRequests'));

// Seating management
const Seating = lui(() => import('./pages/Seating'));
const VoiceParts = lui(() => import('./pages/VoiceParts'));
const Occupancy = lui(() => import('./pages/Occupancy'));
const NeighborPreferences = lui(() => import('./pages/NeighborPreferences'));

// Other pages
const MemberDirectory = lui(() => import('./pages/MemberDirectory'));
const UserGuide = lui(() => import('./pages/UserGuide'));
const AccessibilityStatement = lui(() => import('./pages/AccessibilityStatement'));
const PracticeSchedules = lui(() => import('./pages/PracticeSchedules'));
const HealthDashboard = lui(() => import('./pages/HealthDashboard'));
const GdprAdmin = lui(() => import('./pages/GdprAdmin'));
const ShareTarget = lui(() => import('./pages/ShareTarget'));

// Ticketing
const MyTickets = lui(() => import('./pages/MyTickets'));
const TicketScanner = lui(() => import('./pages/TicketScanner'));
const TicketSales = lui(() => import('./pages/TicketSales'));
const GuestList = lui(() => import('./pages/GuestList'));
const PaymentSettings = lui(() => import('./pages/PaymentSettings'));
const PublicTicketSale = lui(() => import('./pages/PublicTicketSale'));
const PublicCalendar = lui(() => import('./pages/PublicCalendar'));
const InfoScreen = lui(() => import('./pages/InfoScreen'));
const MockPayment = lui(() => import('./pages/MockPayment'));
const TicketTransfer = lui(() => import('./pages/TicketTransfer'));
const AcceptTransfer = lui(() => import('./pages/AcceptTransfer'));

// Stage Layout Designer
const StageDesigner = lui(() => import('./pages/StageDesigner'));
const ConcertStageSetup = lui(() => import('./pages/ConcertStageSetup'));

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

/** Waar het scherm staat om het wachtwoord te wijzigen. */
const WACHTWOORD_WIJZIGEN_PAD = '/profile';

function PrivateRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user } = useAuth();
  const { enabled, loaded } = useModules();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" />;
  }

  // Nog het tijdelijke wachtwoord van de aanmelding: eerst een eigen kiezen.
  // Dat wachtwoord heeft iemand anders gezien (de beheerder die het lid
  // aanmeldde), dus verder dan het profiel, waar het gewijzigd wordt, gaat
  // het lid niet.
  if (user.mustChangePassword && location.pathname !== WACHTWOORD_WIJZIGEN_PAD) {
    return <Navigate to={WACHTWOORD_WIJZIGEN_PAD} replace />;
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
  const location = useLocation();

  // Na het inloggen terug naar de pagina die erom vroeg (zie terugNaInloggen).
  if (user) {
    return <Navigate to={terugNaInloggen(location.state)} />;
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
          <Route
            path="contacts"
            element={
              <PrivateRoute
                roles={[
                  ROLES.ADMIN,
                  ROLES.BOARD,
                  ROLES.MUSIC_COMMITTEE,
                  ROLES.EQUIPMENT_COMMITTEE,
                  ROLES.UNIFORMS_COMMITTEE,
                  ROLES.CONDUCTOR,
                ]}
              >
                <Contacts />
              </PrivateRoute>
            }
          />
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
            path="instrumenten"
            element={
              <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
                <Instrumenten />
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
              // De dirigent hoort hier ook bij. Het menu in Layout.tsx toont
              // "Concerten" al aan [ADMIN, MUSIC_COMMITTEE, CONDUCTOR], en de
              // podiumopstelling per concert hieronder laat de dirigent ook
              // toe - maar die begint bij deze lijst. De dirigent klikte dus op
              // een menu-item en belandde zonder uitleg op het dashboard. De
              // backend was het met het menu eens: concerts.ts en alle routes
              // in stage-layouts.ts noemen 'conductor'. Alleen deze regel niet.
              <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR]}>
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
            path="music-sharing"
            element={
              <PrivateRoute roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE]}>
                <MusicSharing />
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
            path="importeren"
            element={
              <PrivateRoute
                roles={[ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.EQUIPMENT_COMMITTEE, ROLES.UNIFORMS_COMMITTEE]}
              >
                <Importeren />
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
