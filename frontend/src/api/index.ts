/**
 * API Module Index
 *
 * This file re-exports all API functions from domain-specific modules.
 * The large api.ts file has been split into smaller, focused modules.
 *
 * Domain modules:
 * - auth.ts: Authentication, MFA, password reset
 * - users.ts: User management
 * - instruments.ts: Instrument management
 * - orchestras.ts: Orchestra management
 * - genres.ts: Genre management
 * - music.ts: Music lists, pieces, titles
 * - rehearsals.ts: Rehearsals, attendance
 * - concerts.ts: Concerts, programs
 * - tickets.ts: Ticketing, transfers
 * - settings.ts: Association settings, theme
 * - equipment.ts: Equipment management
 * - uniforms.ts: Uniform management
 * - spond.ts: Spond integration
 * - integrations.ts: Microsoft, SMTP, Telegram, WhatsApp
 * - seating.ts: Orchestra seating
 * - onboarding.ts: Member onboarding/offboarding
 * - entra.ts: Entra ID sync
 * - backup.ts: Backup/restore
 * - issues.ts: Issue reporting
 * - loans.ts: Music loans
 * - activity.ts: Activity tracking
 * - favorites.ts: Favorites
 * - practice.ts: Practice tracking
 * - recent.ts: Recent views
 * - annotations.ts: PDF annotations
 * - sessions.ts: Session management
 * - calendar.ts: Calendar sync
 * - notifications.ts: Notification channels
 * - streaming.ts: Streaming links
 * - guest-list.ts: Guest list management
 * - payment.ts: Payment settings
 * - audit.ts: Audit logs
 * - member-directory.ts: Member directory
 * - external-search.ts: MusicaInfo, IMSLP
 */

// Re-export the client for advanced usage
export { default as api } from './client';

// Core modules
export * from './auth';
export * from './users';
export * from './instruments';
export * from './orchestras';
export * from './genres';

// Music management
export * from './music';

// Events & scheduling
export * from './rehearsals';
export * from './concerts';
export * from './tickets';
export * from './seating';
export * from './calendar';

// Settings & configuration
export * from './settings';
export * from './integrations';
export * from './spond';
export * from './payment';

// Member management
export * from './onboarding';
export * from './entra';
export * from './member-directory';

// Inventory
export * from './equipment';
export * from './uniforms';
export * from './instrument-assets';

// Events & Planning
export {
  getEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventLocations,
  getEventLocation,
  createEventLocation,
  updateEventLocation,
  deleteEventLocation,
  getEventSchedule,
  createScheduleItem,
  updateScheduleItem,
  deleteScheduleItem,
  getEventTransport,
  createTransport,
  updateTransport,
  deleteTransport,
  addPassenger,
  removePassenger,
  getEventMeetingPoints,
  createMeetingPoint,
  deleteMeetingPoint,
  getEventPackingLists,
  getEventPackingList,
  createPackingList,
  addPackingItem,
  updatePackingItem,
  deletePackingItem,
  getPackingTemplates,
  getPackingTemplate,
  createPackingTemplate,
  deletePackingTemplate,
  updateMyAttendance as updateEventAttendance,
  getAttendanceSummary as getEventAttendanceSummary,
  getEventWeather,
  fetchEventWeather,
} from './events';
export type {
  Event,
  EventLocation,
  EventScheduleItem,
  EventTransport,
  TransportPassenger,
  EventMeetingPoint,
  EventPackingList,
  PackingItem,
  PackingListTemplate,
  PackingTemplateItem,
  EventAttendance,
  EventWeather,
  AttendanceSummary,
} from './events';

// Multi-Association
export * from './multi-association';

// User features
export * from './favorites';
export * from './practice';
export * from './recent';
export * from './annotations';
export * from './sessions';
export * from './notifications';

// External services
export * from './external-search';
export * from './streaming';

// Other
export * from './backup';
export * from './issues';
export * from './loans';
export * from './activity';
export * from './guest-list';
export * from './audit';
export * from './availability';

// Phase A features
export * from './contacts';
export * from './custom-fields';
export * from './privacy-settings';

// Phase B-D features
export * from './polls';
export * from './posts';
export * from './tasks';
export * from './email-campaigns';
export * from './projects';
export * from './tours';
export * from './resources';

// Phase E features
export * from './outfits';
export * from './wiki';
export * from './workflows';
export * from './performances';

// External Musicians Network
export * from './external-musicians';
export * from './replacement-requests';

// Attendance Analytics
export * from './attendance-analytics';
