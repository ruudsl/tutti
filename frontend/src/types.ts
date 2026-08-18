// =============================================================================
// HARMONIE - TypeScript Type Definitions
// =============================================================================
// This file contains all shared TypeScript interfaces and types used throughout
// the Harmonie music association management application.
// =============================================================================

// =============================================================================
// AUTHENTICATION & USER MANAGEMENT
// =============================================================================

/**
 * Represents a user in the system with their profile and role information.
 * @property id - Unique identifier for the user
 * @property email - User's email address used for login
 * @property firstName - User's first name
 * @property lastName - User's last name
 * @property role - User's permission role in the association
 * @property associationId - ID of the association the user belongs to, null for system admins
 * @property associationName - Display name of the user's association
 * @property mfaEnabled - Whether multi-factor authentication is enabled
 * @property lastLogin - ISO timestamp of last successful login
 * @property photoUrl - URL to the user's profile photo
 * @property instruments - List of instruments the user plays
 * @property orchestras - List of orchestras the user is a member of
 */
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'board' | 'music_committee' | 'equipment_committee' | 'uniforms_committee' | 'conductor' | 'member';
  associationId: string | null;
  associationName?: string;
  mfaEnabled?: boolean;
  lastLogin?: string | null;
  photoUrl?: string | null;
  instruments?: Instrument[];
  orchestras?: Orchestra[];
}

/**
 * Response returned when setting up multi-factor authentication.
 * @property secret - The MFA secret key for manual entry
 * @property qrCode - Base64-encoded QR code image for scanning
 * @property message - Human-readable status message
 */
export interface MfaSetupResponse {
  secret: string;
  qrCode: string;
  message: string;
}

/**
 * Response returned from login attempt.
 * @property token - JWT authentication token, present on successful login
 * @property user - User profile data, present on successful login
 * @property requiresMfa - True if MFA verification is required to complete login
 * @property message - Status or error message
 */
export interface LoginResponse {
  token?: string;
  user?: User;
  requiresMfa?: boolean;
  message?: string;
}

/**
 * Standard authentication response containing token and user data.
 * @property token - JWT authentication token
 * @property user - Authenticated user's profile
 */
export interface AuthResponse {
  token: string;
  user: User;
}

// =============================================================================
// INSTRUMENTS & ORCHESTRAS
// =============================================================================

/**
 * Represents a musical instrument type.
 * @property id - Unique identifier
 * @property name - Display name of the instrument (e.g., "Clarinet", "Trumpet")
 * @property tuning - Transposition key (e.g., "Bb", "Eb"), null for concert pitch
 * @property clef - Musical clef used (e.g., "treble", "bass")
 * @property aliases - Alternative names for the instrument
 */
export interface Instrument {
  id: string;
  name: string;
  tuning: string | null;
  clef?: string | null;
  aliases?: { id: string; name: string }[];
}

/**
 * Represents an orchestra or ensemble within an association.
 * @property id - Unique identifier
 * @property name - Display name of the orchestra
 * @property memberCount - Number of active members
 * @property listCount - Number of music lists associated with this orchestra
 */
export interface Orchestra {
  id: string;
  name: string;
  memberCount?: number;
  listCount?: number;
}

// =============================================================================
// MUSIC LIBRARY
// =============================================================================

/**
 * Represents a music list (setlist or repertoire collection).
 * @property id - Unique identifier
 * @property name - Display name of the list
 * @property orchestraId - ID of the orchestra this list belongs to
 * @property orchestraName - Display name of the associated orchestra
 * @property position - Sort order position among lists
 * @property pieceCount - Number of individual parts/pieces on the list
 * @property titleCount - Number of unique titles on the list
 * @property isActive - Whether this is the currently active repertoire
 * @property totalDuration - Combined duration of all pieces in seconds
 * @property listType - Type of list: regular rehearsal or concert program
 * @property concertDate - Date of the concert (for concert lists)
 * @property concertLocation - Venue location (for concert lists)
 */
export interface MusicList {
  id: string;
  name: string;
  orchestraId: string;
  orchestraName?: string;
  position?: number;
  pieceCount?: number;
  titleCount?: number;
  isActive?: boolean;
  totalDuration?: number;
  listType?: 'regular' | 'concert';
  concertDate?: string | null;
  concertLocation?: string | null;
}

/**
 * Represents a music genre/category.
 * @property id - Unique identifier
 * @property name - Display name of the genre
 */
export interface Genre {
  id: string;
  name: string;
}

/**
 * Collection of streaming service URLs for a music title.
 * @property spotify_url - Full URL to Spotify track/album
 * @property apple_music_url - Full URL to Apple Music track/album
 * @property youtube_music_url - Full URL to YouTube Music
 * @property spotify_preview_url - URL to 30-second Spotify preview
 * @property apple_music_preview_url - URL to Apple Music preview
 */
export interface StreamingLinks {
  spotify_url?: string | null;
  apple_music_url?: string | null;
  youtube_music_url?: string | null;
  spotify_preview_url?: string | null;
  apple_music_preview_url?: string | null;
}

/**
 * Represents a music title in the library (a composition/arrangement).
 * @property id - Unique identifier
 * @property title - Display title of the piece
 * @property arranger - Name of the arranger
 * @property pieceCount - Number of individual parts uploaded
 * @property youtubeUrl - URL to YouTube reference recording
 * @property description - Detailed description or notes
 * @property durationSeconds - Playing time in seconds
 * @property grade - Difficulty grade/level
 * @property mp3FilePath - Path to uploaded MP3 reference recording
 * @property isShared - Whether this title is shared with other associations
 * @property internalNotes - Private notes visible only to committee
 * @property streamingLinks - Links to streaming service recordings
 * @property instruments - List of instrument names with parts available
 * @property genres - Associated music genres
 * @property onList - Whether this title is on any active list
 * @property lists - Lists this title appears on
 */
export interface MusicTitle {
  id?: string;
  title: string;
  arranger: string | null;
  pieceCount: number;
  youtubeUrl: string | null;
  description: string | null;
  durationSeconds: number;
  grade?: string | null;
  mp3FilePath?: string | null;
  isShared?: boolean;
  internalNotes?: string | null;
  streamingLinks?: StreamingLinks | null;
  instruments: string[];
  genres?: Genre[];
  onList?: boolean;
  lists?: { id: string; name: string; orchestra_name: string }[];
}

/**
 * Represents an individual music piece (a specific part for an instrument).
 * @property id - Unique identifier
 * @property title - Title of the parent composition
 * @property arranger - Name of the arranger
 * @property tuning - Transposition key of this part
 * @property groupNumber - Part number within section (e.g., "1" for 1st clarinet)
 * @property clef - Musical clef used in this part
 * @property youtubeUrl - URL to reference recording
 * @property originalFilename - Original uploaded filename
 * @property instrumentId - ID of the instrument this part is for
 * @property instrumentName - Display name of the instrument
 * @property listName - Name of the list this piece is on
 * @property orchestraName - Name of the orchestra
 */
export interface MusicPiece {
  id: string;
  title: string;
  arranger: string | null;
  tuning: string | null;
  groupNumber: string | null;
  clef: string | null;
  youtubeUrl: string | null;
  originalFilename: string;
  instrumentId: string | null;
  instrumentName: string | null;
  listName?: string;
  orchestraName?: string;
}

// =============================================================================
// ASSOCIATION SETTINGS
// =============================================================================

/**
 * Represents a music association (parent organization).
 * @property id - Unique identifier
 * @property name - Legal/official name of the association
 * @property memberCount - Total number of registered members
 * @property orchestraCount - Number of orchestras/ensembles
 */
export interface Association {
  id: string;
  name: string;
  memberCount?: number;
  orchestraCount?: number;
}

/**
 * Configuration settings for an association's branding and appearance.
 * @property name - Internal name/identifier
 * @property displayName - Public display name
 * @property logoPath - Server path to logo file
 * @property logoUrl - Public URL to access logo
 * @property theme - Custom theme color settings
 */
export interface AssociationSettings {
  name: string;
  displayName: string;
  logoPath: string | null;
  logoUrl: string | null;
  theme: ThemeSettings | null;
}

/**
 * Custom theme color and typography settings.
 * All color values are CSS color strings (hex, rgb, etc.).
 * @property primaryColor - Main brand color
 * @property primaryDarkColor - Darker variant of primary color
 * @property secondaryColor - Secondary accent color
 * @property successColor - Color for success states
 * @property dangerColor - Color for errors and destructive actions
 * @property warningColor - Color for warnings
 * @property backgroundColor - Page background color
 * @property surfaceColor - Card/surface background color
 * @property textColor - Primary text color
 * @property textLightColor - Secondary/muted text color
 * @property borderColor - Border color
 * @property fontFamily - CSS font-family string
 * @property fontSizeBase - Base font size in pixels
 * @property borderRadius - Border radius in pixels
 */
export interface ThemeSettings {
  primaryColor?: string;
  primaryDarkColor?: string;
  secondaryColor?: string;
  successColor?: string;
  dangerColor?: string;
  warningColor?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  textColor?: string;
  textLightColor?: string;
  borderColor?: string;
  fontFamily?: string;
  fontSizeBase?: number;
  borderRadius?: number;
}

// =============================================================================
// REHEARSALS
// =============================================================================

/**
 * Default rehearsal schedule configuration.
 * @property id - Unique identifier
 * @property day_of_week - Day of week (0=Sunday, 6=Saturday)
 * @property start_time - Start time in HH:MM format
 * @property end_time - End time in HH:MM format
 * @property location - Default rehearsal venue
 * @property orchestra_id - Associated orchestra ID
 * @property orchestra_name - Display name of the orchestra
 */
export interface RehearsalDefaultDay {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string | null;
  orchestra_id: string | null;
  orchestra_name: string | null;
}

/**
 * Represents a scheduled rehearsal.
 * @property id - Unique identifier
 * @property date - Date in YYYY-MM-DD format
 * @property start_time - Start time in HH:MM format
 * @property end_time - End time in HH:MM format
 * @property location - Rehearsal venue
 * @property type - Rehearsal type: regular, extra, or cancelled
 * @property notes - Additional notes or agenda
 * @property orchestra_id - Associated orchestra ID
 * @property orchestra_name - Display name of the orchestra
 * @property spond_event_id - Linked Spond event ID for attendance sync
 * @property created_by - User ID of creator
 * @property created_by_name - Display name of creator
 * @property piece_count - Number of pieces on the agenda
 * @property accepted_count - Number of members who accepted attendance
 * @property declined_count - Number of members who declined attendance
 */
export interface Rehearsal {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  location: string | null;
  type: 'regular' | 'extra' | 'cancelled';
  notes: string | null;
  orchestra_id: string | null;
  orchestra_name: string | null;
  spond_event_id: string | null;
  created_by: string | null;
  created_by_name: string | null;
  piece_count: number;
  accepted_count: number;
  declined_count: number;
}

/**
 * A music piece scheduled for a rehearsal.
 * @property id - Music title ID
 * @property title - Display title
 * @property notes - Rehearsal-specific notes
 * @property sort_order - Order in the rehearsal agenda
 */
export interface RehearsalPiece {
  id: string;
  title: string;
  notes: string | null;
  sort_order: number;
}

/**
 * Attendance record for a rehearsal.
 * @property id - Unique identifier
 * @property user_id - Linked user ID (if member has account)
 * @property spond_member_id - Linked Spond member ID
 * @property member_name - Display name of the member
 * @property status - Attendance response status
 */
export interface RehearsalAttendance {
  id: string;
  user_id: string | null;
  spond_member_id: string | null;
  member_name: string;
  status: 'accepted' | 'declined' | 'waiting' | 'unknown';
}

/**
 * Detailed rehearsal information including pieces and attendance.
 * Extends Rehearsal with nested collections.
 * @property pieces - List of pieces on the rehearsal agenda
 * @property attendance - List of attendance records
 */
export interface RehearsalDetail extends Rehearsal {
  pieces: RehearsalPiece[];
  attendance: RehearsalAttendance[];
}

// =============================================================================
// SPOND INTEGRATION
// =============================================================================

/**
 * Spond integration configuration status.
 * @property configured - Whether Spond credentials are set up
 * @property username - Spond account username/email
 * @property groupId - Selected Spond group ID
 * @property syncEnabled - Whether automatic sync is enabled
 * @property lastSync - ISO timestamp of last successful sync
 */
export interface SpondConfig {
  configured: boolean;
  username?: string;
  groupId?: string | null;
  syncEnabled?: boolean;
  lastSync?: string | null;
}

/**
 * A group from the Spond platform.
 * @property id - Spond group ID
 * @property name - Display name of the group
 * @property memberCount - Number of members in the group
 */
export interface SpondGroup {
  id: string;
  name: string;
  memberCount: number;
}

/**
 * Result of a Spond synchronization operation.
 * @property message - Human-readable status message
 * @property synced - Number of items successfully synced
 * @property total - Total number of items processed
 */
export interface SpondSyncResult {
  message: string;
  synced: number;
  total: number;
}

/**
 * Mapping between a Harmonie orchestra and a Spond group.
 * @property id - Unique identifier for this mapping
 * @property orchestraId - Harmonie orchestra ID
 * @property orchestraName - Display name of the orchestra
 * @property spondGroupId - Spond group ID
 * @property spondGroupName - Display name of the Spond group
 */
export interface SpondOrchestraGroup {
  id: string;
  orchestraId: string;
  orchestraName: string;
  spondGroupId: string;
  spondGroupName?: string;
}

/**
 * Mapping between a Harmonie user and a Spond member.
 * @property id - Unique identifier for this link
 * @property spondMemberId - Spond member ID
 * @property userId - Harmonie user ID
 * @property spondMemberName - Member name from Spond
 * @property firstName - User's first name
 * @property lastName - User's last name
 * @property email - User's email address
 */
export interface SpondMemberLink {
  id: string;
  spondMemberId: string;
  userId: string;
  spondMemberName?: string;
  firstName: string;
  lastName: string;
  email: string;
}

// =============================================================================
// EXTERNAL SERVICE CONFIGURATIONS
// =============================================================================

/**
 * Microsoft Azure AD/Entra configuration for SSO.
 * @property clientId - Azure application client ID
 * @property tenantId - Azure tenant ID
 * @property enabled - Whether Microsoft SSO is enabled
 * @property configured - Whether all required settings are configured
 * @property redirectUri - OAuth redirect URI
 */
export interface MicrosoftConfig {
  clientId: string;
  tenantId: string;
  enabled: boolean;
  configured: boolean;
  redirectUri: string;
}

/**
 * SMTP email server configuration.
 * @property host - SMTP server hostname
 * @property port - SMTP server port
 * @property secure - Whether to use TLS/SSL
 * @property user - SMTP authentication username
 * @property from - Default sender email address
 * @property enabled - Whether email sending is enabled
 * @property configured - Whether all required settings are configured
 */
export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  enabled: boolean;
  configured: boolean;
}

/**
 * Telegram bot configuration for notifications.
 * @property tokenPreview - Partially masked bot token
 * @property configured - Whether bot token is set
 * @property enabled - Whether Telegram notifications are enabled
 */
export interface TelegramConfig {
  tokenPreview: string;
  configured: boolean;
  enabled: boolean;
}

/**
 * WhatsApp integration configuration.
 * Supports both Meta Business API and Twilio providers.
 * @property provider - Active WhatsApp provider
 * @property enabled - Whether WhatsApp messaging is enabled
 * @property configured - Whether any provider is fully configured
 * @property meta - Meta Business API configuration
 * @property twilio - Twilio WhatsApp configuration
 */
export interface WhatsAppConfig {
  provider: 'meta' | 'twilio';
  enabled: boolean;
  configured: boolean;
  meta: { phoneNumberId: string; accessTokenPreview: string; configured: boolean };
  twilio: { accountSid: string; authTokenPreview: string; whatsappFrom: string; configured: boolean };
}

// =============================================================================
// EQUIPMENT MANAGEMENT (INSTRUMENTENBEHEER)
// =============================================================================

/**
 * Represents a physical equipment item (typically a musical instrument).
 * @property id - Unique identifier
 * @property instrumentType - Type of instrument (e.g., "Clarinet", "Tuba")
 * @property brandModel - Brand and model information
 * @property serialNumber - Manufacturer serial number
 * @property yearOfManufacture - Year the instrument was made
 * @property status - Current availability status
 * @property notes - General notes about the equipment
 * @property maintenanceIntervalMonths - Months between scheduled maintenance
 * @property lastMaintenanceDate - Date of last maintenance service
 * @property nextMaintenanceDate - Calculated date for next maintenance
 * @property purchasePrice - Original purchase price
 * @property currentValue - Current estimated value
 * @property currentUser - User currently assigned to this equipment
 * @property createdAt - Record creation timestamp
 * @property updatedAt - Record last update timestamp
 */
export interface Equipment {
  id: string;
  instrumentType: string;
  brandModel: string | null;
  serialNumber: string | null;
  yearOfManufacture: number | null;
  status: 'available' | 'on_loan' | 'in_repair' | 'written_off' | 'personal';
  notes: string | null;
  maintenanceIntervalMonths: number;
  lastMaintenanceDate: string | null;
  nextMaintenanceDate: string | null;
  purchasePrice: number | null;
  currentValue: number | null;
  currentUser: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Record of damage reported for an equipment item.
 * @property id - Unique identifier
 * @property date - Date damage was reported
 * @property description - Description of the damage
 * @property repairCost - Cost of repairs if completed
 * @property repairedBy - Name of repair technician/shop
 * @property status - Current repair status
 * @property createdAt - Record creation timestamp
 */
export interface EquipmentDamageLog {
  id: string;
  date: string;
  description: string;
  repairCost: number | null;
  repairedBy: string | null;
  status: 'reported' | 'in_repair' | 'repaired' | 'written_off';
  createdAt: string;
}

/**
 * Record of an equipment loan to a member.
 * @property id - Unique identifier
 * @property user - User who borrowed the equipment
 * @property loanDate - Date equipment was loaned out
 * @property returnDate - Date equipment was returned (null if still on loan)
 * @property conditionAtLoan - Condition when loaned
 * @property conditionAtReturn - Condition when returned
 * @property notes - Additional notes about the loan
 * @property agreementPdfPath - Path to signed loan agreement PDF
 */
export interface EquipmentLoan {
  id: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  loanDate: string;
  returnDate: string | null;
  conditionAtLoan: string | null;
  conditionAtReturn: string | null;
  notes: string | null;
  agreementPdfPath: string | null;
}

/**
 * Detailed equipment information including history.
 * Extends Equipment with damage logs and loan history.
 * @property damageLogs - History of damage reports
 * @property loanHistory - History of loans
 */
export interface EquipmentDetail extends Equipment {
  damageLogs: EquipmentDamageLog[];
  loanHistory: EquipmentLoan[];
}

/**
 * Alert for equipment needing maintenance.
 * @property id - Equipment ID
 * @property instrumentType - Type of instrument
 * @property brandModel - Brand and model
 * @property serialNumber - Serial number
 * @property nextMaintenanceDate - Scheduled maintenance date
 * @property isOverdue - Whether maintenance is past due
 * @property currentUser - User currently assigned
 */
export interface MaintenanceAlert {
  id: string;
  instrumentType: string;
  brandModel: string | null;
  serialNumber: string | null;
  nextMaintenanceDate: string;
  isOverdue: boolean;
  currentUser: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

// =============================================================================
// UNIFORMS MANAGEMENT (UNIFORMEN-INVENTARIS)
// =============================================================================

/**
 * Represents a uniform item in inventory.
 * @property id - Unique identifier
 * @property itemType - Type of uniform item (e.g., "Jacket", "Pants", "Tie")
 * @property sizeStandard - Standard size (e.g., "M", "L", "XL")
 * @property sizeLength - Length measurement in cm
 * @property sizeWidth - Width measurement in cm
 * @property color - Color of the item
 * @property condition - Current condition of the item
 * @property status - Availability status
 * @property notes - Additional notes
 * @property purchaseDate - Date item was purchased
 * @property purchasePrice - Original purchase price
 * @property currentUser - Member currently assigned this item
 * @property createdAt - Record creation timestamp
 * @property updatedAt - Record last update timestamp
 */
export interface UniformItem {
  id: string;
  itemType: string;
  sizeStandard: string | null;
  sizeLength: number | null;
  sizeWidth: number | null;
  color: string | null;
  condition: 'good' | 'fair' | 'poor';
  status: 'available' | 'issued' | 'in_repair' | 'written_off';
  notes: string | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  currentUser: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Record of uniform item assignment to a member.
 * @property id - Unique identifier
 * @property user - User assigned the uniform
 * @property assignedDate - Date item was assigned
 * @property returnedDate - Date item was returned (null if still assigned)
 * @property conditionAtAssignment - Condition when assigned
 * @property conditionAtReturn - Condition when returned
 * @property notes - Additional notes
 */
export interface UniformAssignment {
  id: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  assignedDate: string;
  returnedDate: string | null;
  conditionAtAssignment: string | null;
  conditionAtReturn: string | null;
  notes: string | null;
}

/**
 * Detailed uniform item information including assignment history.
 * @property assignmentHistory - History of all assignments
 */
export interface UniformItemDetail extends UniformItem {
  assignmentHistory: UniformAssignment[];
}

/**
 * Requirement for a specific item type in a uniform set.
 * @property id - Unique identifier
 * @property itemType - Type of uniform item required
 * @property quantity - Number of items required
 */
export interface UniformSetRequirement {
  id: string;
  itemType: string;
  quantity: number;
}

/**
 * A defined set of uniform items (e.g., "Concert Uniform", "Parade Uniform").
 * @property id - Unique identifier
 * @property name - Name of the uniform set
 * @property description - Description of when/how to use this set
 * @property requirements - List of required items for the set
 * @property createdAt - Record creation timestamp
 */
export interface UniformSet {
  id: string;
  name: string;
  description: string | null;
  requirements: UniformSetRequirement[];
  createdAt: string;
}

/**
 * Uniform item type option for dropdowns.
 * @property value - Internal value
 * @property label - Display label
 */
export interface UniformItemType {
  value: string;
  label: string;
}

/**
 * Availability count for a specific uniform size.
 * @property itemType - Type of uniform item
 * @property sizeStandard - Size standard
 * @property count - Number of available items
 */
export interface UniformSizeAvailability {
  itemType: string;
  sizeStandard: string;
  count: number;
}

// =============================================================================
// CONCERTS (CONCERT-ARCHIEF)
// =============================================================================

/**
 * Represents a concert or performance event.
 * @property id - Unique identifier
 * @property name - Name/title of the concert
 * @property date - Start date in YYYY-MM-DD format
 * @property endDate - End date for multi-day events
 * @property location - Venue name and address
 * @property venueType - Type of venue (e.g., "indoor", "outdoor")
 * @property concertType - Type of concert (e.g., "regular", "festival")
 * @property description - Public description
 * @property notes - Internal notes
 * @property programCount - Number of pieces in the program
 * @property attendanceCount - Number of confirmed attendees
 * @property mediaCount - Number of media files attached
 * @property wheelchairSpaces - Number of wheelchair accessible spaces
 * @property companionSpaces - Number of companion spaces
 * @property hearingLoopAvailable - Whether hearing loop is available
 * @property hasAccessibilityInfo - Whether accessibility info is configured
 * @property createdBy - User who created the concert record
 * @property createdAt - Record creation timestamp
 * @property updatedAt - Record last update timestamp
 */
export interface Concert {
  id: string;
  name: string;
  date: string;
  endDate: string | null;
  location: string | null;
  venueType: string | null;
  concertType: string | null;
  description: string | null;
  notes: string | null;
  programCount: number;
  attendanceCount: number;
  mediaCount: number;
  wheelchairSpaces?: number | null;
  companionSpaces?: number | null;
  hearingLoopAvailable?: boolean;
  hasAccessibilityInfo?: boolean;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A piece in a concert program.
 * @property id - Unique identifier
 * @property musicTitleId - Reference to library music title
 * @property title - Display title
 * @property composer - Composer name
 * @property arranger - Arranger name
 * @property sortOrder - Order in the program
 * @property notes - Performance notes
 * @property partOfSet - Name of medley/set this is part of
 * @property youtubeUrl - Reference recording URL
 * @property durationSeconds - Piece duration in seconds
 */
export interface ConcertProgramItem {
  id: string;
  musicTitleId: string | null;
  title: string;
  composer: string | null;
  arranger: string | null;
  sortOrder: number;
  notes: string | null;
  partOfSet: string | null;
  youtubeUrl?: string | null;
  durationSeconds?: number | null;
}

/**
 * Media file attached to a concert.
 * @property id - Unique identifier
 * @property mediaType - Type of media (e.g., "photo", "video", "audio")
 * @property url - External URL (for linked media)
 * @property filePath - Server path (for uploaded media)
 * @property description - Description or caption
 * @property uploadedBy - User who uploaded the media
 * @property createdAt - Upload timestamp
 */
export interface ConcertMedia {
  id: string;
  mediaType: string;
  url: string | null;
  filePath: string | null;
  description: string | null;
  uploadedBy: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  createdAt: string;
}

/**
 * Attendance record for a concert.
 * @property id - Unique identifier
 * @property user - Linked user (if registered member)
 * @property memberName - Display name of the performer
 * @property instrumentPlayed - Instrument played at this concert
 * @property notes - Additional notes
 */
export interface ConcertAttendance {
  id: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  memberName: string;
  instrumentPlayed: string | null;
  notes: string | null;
}

/**
 * Detailed concert information including program, media, and attendance.
 * Extends Concert with full nested data and accessibility details.
 * @property program - Ordered list of program items
 * @property media - Attached media files
 * @property attendance - Performer attendance list
 * @property accessibleParkingInfo - Accessible parking information
 * @property accessibilityInfo - General accessibility information
 * @property accessibilityContactEmail - Email for accessibility inquiries
 * @property accessibilityContactPhone - Phone for accessibility inquiries
 */
export interface ConcertDetail extends Omit<
  Concert,
  'programCount' | 'attendanceCount' | 'mediaCount' | 'hasAccessibilityInfo'
> {
  program: ConcertProgramItem[];
  media: ConcertMedia[];
  attendance: ConcertAttendance[];
  accessibleParkingInfo?: string | null;
  accessibilityInfo?: string | null;
  accessibilityContactEmail?: string | null;
  accessibilityContactPhone?: string | null;
}

/**
 * Statistical data about concerts.
 * @property totalConcerts - Total number of concerts
 * @property concertsPerYear - Concert count by year
 * @property mostPlayedPieces - Most frequently performed pieces
 * @property concertsPerType - Concert count by type
 */
export interface ConcertStatistics {
  totalConcerts: number;
  concertsPerYear: { year: string; count: number }[];
  mostPlayedPieces: { title: string; playCount: number; lastPlayed: string }[];
  concertsPerType: { type: string; count: number }[];
}

/**
 * Performance history for a specific piece.
 * @property title - Piece title
 * @property playCount - Number of times performed
 * @property lastPlayed - Date of most recent performance
 * @property history - List of all performances
 */
export interface PieceHistory {
  title: string;
  playCount: number;
  lastPlayed: string | null;
  history: {
    concertId: string;
    concertName: string;
    date: string;
    location: string | null;
    notes: string | null;
  }[];
}

/**
 * Concert type option for dropdowns.
 * @property value - Internal value
 * @property label - Display label
 */
export interface ConcertType {
  value: string;
  label: string;
}

/**
 * Venue type option for dropdowns.
 * @property value - Internal value
 * @property label - Display label
 */
export interface VenueType {
  value: string;
  label: string;
}

/**
 * Media type option for dropdowns.
 * @property value - Internal value
 * @property label - Display label
 */
export interface MediaType {
  value: string;
  label: string;
}

// =============================================================================
// SEATING ARRANGEMENTS (ORKEST OPSTELLING)
// =============================================================================

/**
 * An instrument assigned to a seating section.
 * @property id - Instrument ID
 * @property name - Instrument name
 * @property tuning - Instrument tuning
 * @property sortOrder - Order within the section
 */
export interface SeatingSectionInstrument {
  id: string;
  name: string;
  tuning: string | null;
  sortOrder: number;
}

/**
 * A section in the orchestra seating arrangement.
 * @property id - Unique identifier
 * @property name - Section name (e.g., "Clarinets", "Trumpets")
 * @property rowNumber - Row in the seating chart
 * @property sortOrder - Order within the row
 * @property instruments - Instruments in this section
 * @property createdAt - Record creation timestamp
 */
export interface SeatingSection {
  id: string;
  name: string;
  rowNumber: number;
  sortOrder: number;
  instruments: SeatingSectionInstrument[];
  createdAt: string;
}

/**
 * Assignment of a member to a seat.
 * @property id - Unique identifier
 * @property userId - Assigned user ID
 * @property userName - User's display name
 * @property userEmail - User's email
 * @property sectionId - Section ID
 * @property sectionName - Section name
 * @property rowNumber - Row number
 * @property positionInSection - Position within the section
 * @property seatLabel - Optional seat label
 * @property notes - Additional notes
 * @property instruments - Instruments the user plays
 */
export interface SeatingAssignment {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  sectionId: string;
  sectionName: string;
  rowNumber: number;
  positionInSection: number;
  seatLabel: string | null;
  notes: string | null;
  instruments: string | null;
}

/**
 * Seating neighbor preference for a member.
 * @property id - Unique identifier
 * @property userId - User ID who set the preference
 * @property userName - User's display name
 * @property neighborUserId - Neighbor user ID
 * @property neighborUserName - Neighbor's display name
 * @property preference - Whether to prefer or avoid sitting next to this person
 */
export interface SeatingNeighbor {
  id: string;
  userId: string;
  userName: string;
  neighborUserId: string;
  neighborUserName: string;
  preference: 'preferred' | 'avoid';
}

/**
 * Seat assignment for a specific rehearsal.
 * @property id - Unique identifier
 * @property userId - User ID (if linked)
 * @property spondMemberId - Spond member ID (if from Spond)
 * @property memberName - Member display name
 * @property instrumentName - Instrument being played
 * @property sectionId - Section ID
 * @property sectionName - Section name
 * @property rowNumber - Row number in seating
 * @property positionInRow - Position within row
 * @property isConductor - Whether this is the conductor position
 */
export interface RehearsalSeat {
  id: string;
  userId: string | null;
  spondMemberId: string | null;
  memberName: string;
  instrumentName: string | null;
  sectionId: string | null;
  sectionName: string | null;
  rowNumber: number;
  positionInRow: number;
  isConductor?: boolean;
}

/**
 * Section summary for seating chart display.
 * @property id - Section ID
 * @property name - Section name
 * @property rowNumber - Row number
 * @property seatCount - Number of seats in section
 */
export interface SeatingChartSection {
  id: string;
  name: string;
  rowNumber: number;
  seatCount: number;
}

/**
 * Individual seat in the seating chart.
 * @property id - Seat ID
 * @property userId - Assigned user ID
 * @property memberName - Member's display name
 * @property instrumentName - Instrument name
 * @property rowNumber - Row number
 * @property positionInRow - Position within row
 * @property sectionName - Section name
 * @property isConductor - Whether this is conductor position
 */
export interface SeatingChartSeat {
  id: string;
  userId: string | null;
  memberName: string;
  instrumentName: string | null;
  rowNumber: number;
  positionInRow: number;
  sectionName: string | null;
  isConductor?: boolean;
}

/**
 * Complete seating chart for an orchestra.
 * @property orchestraId - Orchestra ID
 * @property orchestraName - Orchestra name
 * @property sections - List of sections
 * @property seats - List of all seats
 * @property totalRows - Total number of rows
 */
export interface SeatingChart {
  orchestraId: string;
  orchestraName: string;
  sections: SeatingChartSection[];
  seats: SeatingChartSeat[];
  totalRows: number;
}

// =============================================================================
// TICKETING SYSTEM
// =============================================================================

/**
 * A type of ticket available for sale.
 * @property id - Unique identifier
 * @property name - Ticket type name (e.g., "Regular", "Student", "VIP")
 * @property price - Price per ticket in cents
 * @property quantity - Total quantity available
 * @property available - Current remaining quantity
 * @property description - Description of this ticket type
 * @property maxPerOrder - Maximum tickets of this type per order
 * @property onSale - Whether tickets are currently on sale
 * @property saleStart - Sale start datetime
 * @property saleEnd - Sale end datetime
 * @property serviceFee - Service fee per ticket in cents
 * @property showServiceFeeSeparate - Whether to display fee separately
 */
export interface TicketType {
  id: string;
  name: string;
  price: number;
  quantity: number;
  available: number;
  description: string | null;
  maxPerOrder: number;
  onSale: boolean;
  saleStart: string | null;
  saleEnd: string | null;
  serviceFee: number;
  showServiceFeeSeparate: boolean;
}

/**
 * Public ticket information for a concert.
 * @property concert - Basic concert details
 * @property ticketTypes - Available ticket types
 * @property paymentMethods - Available payment methods
 * @property captcha - CAPTCHA configuration for bot protection
 */
export interface ConcertTicketInfo {
  concert: {
    id: string;
    name: string;
    date: string;
    endDate: string | null;
    location: string | null;
    description: string | null;
    concertType: string | null;
  };
  ticketTypes: TicketType[];
  paymentMethods: string[];
  captcha?: {
    enabled: boolean;
    siteKey: string | null;
  };
}

/**
 * Line item in a ticket order.
 * @property ticketTypeId - ID of the ticket type
 * @property name - Ticket type name
 * @property quantity - Number of tickets
 * @property unitPrice - Price per ticket
 * @property subtotal - Total for this line item
 */
export interface TicketOrderItem {
  ticketTypeId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

/**
 * A complete ticket order.
 * @property id - Unique order ID
 * @property concertId - Concert ID
 * @property concertName - Concert name
 * @property concertDate - Concert date
 * @property concertLocation - Concert venue
 * @property total - Total order amount in cents
 * @property status - Order status
 * @property buyerName - Buyer's name
 * @property buyerEmail - Buyer's email
 * @property buyerPhone - Buyer's phone number
 * @property paymentMethod - Payment method used
 * @property expiresAt - Order expiration (for pending orders)
 * @property paidAt - Payment timestamp
 * @property createdAt - Order creation timestamp
 * @property items - Order line items
 * @property tickets - Individual tickets (when fulfilled)
 */
export interface TicketOrder {
  id: string;
  concertId: string;
  concertName: string;
  concertDate: string;
  concertLocation: string | null;
  total: number;
  status: 'pending' | 'paid' | 'cancelled' | 'refunded' | 'expired';
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string | null;
  paymentMethod: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
  items: TicketOrderItem[];
  tickets?: Ticket[];
}

/**
 * An individual ticket.
 * @property id - Unique identifier
 * @property code - Unique ticket code for validation
 * @property buyerName - Name of the ticket holder
 * @property status - Ticket status
 * @property seatInfo - Assigned seat information
 * @property purchaseDate - Purchase timestamp
 * @property usedAt - Scan/validation timestamp
 * @property ticketType - Type of ticket
 * @property price - Ticket price in cents
 * @property concert - Concert details
 * @property qrCodeDataUrl - Base64 QR code for the ticket
 */
export interface Ticket {
  id: string;
  code: string;
  buyerName: string;
  status: 'valid' | 'used' | 'cancelled' | 'refunded';
  seatInfo: string | null;
  purchaseDate: string;
  usedAt: string | null;
  ticketType: string;
  price?: number;
  concert: {
    id: string;
    name: string;
    date: string;
    endDate?: string | null;
    location: string | null;
  };
  qrCodeDataUrl?: string;
}

/**
 * Result of validating a ticket at entry.
 * @property valid - Whether the ticket is valid for entry
 * @property status - Detailed validation status
 * @property ticket - Ticket details if found
 * @property message - Human-readable status message
 */
export interface TicketValidationResult {
  valid: boolean;
  status: 'valid' | 'used' | 'cancelled' | 'refunded' | 'not_found' | 'wrong_concert' | 'expired';
  ticket?: {
    id: string;
    code: string;
    buyerName: string;
    ticketType: string;
    concertName: string;
    concertDate: string;
    usedAt?: string;
    seatInfo?: string;
  };
  message: string;
}

/**
 * Sales statistics for a concert.
 * @property concertId - Concert ID
 * @property concertName - Concert name
 * @property totalCapacity - Total tickets available
 * @property totalSold - Total tickets sold
 * @property totalRevenue - Total revenue in cents
 * @property ticketTypes - Breakdown by ticket type
 */
export interface TicketStats {
  concertId: string;
  concertName: string;
  totalCapacity: number;
  totalSold: number;
  totalRevenue: number;
  ticketTypes: {
    id: string;
    name: string;
    price: number;
    quantity: number;
    sold: number;
    available: number;
    revenue: number;
  }[];
}

/**
 * Attendee information for export.
 * @property ticketCode - Unique ticket code
 * @property buyerName - Ticket holder name
 * @property buyerEmail - Buyer's email
 * @property ticketType - Type of ticket
 * @property seatInfo - Seat assignment
 * @property status - Ticket status
 * @property purchaseDate - Purchase timestamp
 * @property usedAt - Validation timestamp
 */
export interface AttendeeExport {
  ticketCode: string;
  buyerName: string;
  buyerEmail: string;
  ticketType: string;
  seatInfo: string | null;
  status: string;
  purchaseDate: string;
  usedAt: string | null;
}

/**
 * Admin view of a ticket order with full details.
 * @property id - Order ID
 * @property concertId - Concert ID
 * @property concertName - Concert name
 * @property concertDate - Concert date
 * @property concertLocation - Concert location
 * @property total - Total amount in cents
 * @property status - Order status
 * @property paymentId - External payment provider ID
 * @property paymentMethod - Payment method used
 * @property buyerName - Buyer's name
 * @property buyerEmail - Buyer's email
 * @property buyerPhone - Buyer's phone
 * @property expiresAt - Pending order expiration
 * @property paidAt - Payment timestamp
 * @property createdAt - Order creation timestamp
 * @property updatedAt - Last update timestamp
 * @property ticketCount - Total tickets in order
 * @property items - Order line items
 */
export interface TicketSaleOrder {
  id: string;
  concertId: string;
  concertName: string;
  concertDate: string;
  concertLocation: string | null;
  total: number;
  status: 'pending' | 'paid' | 'cancelled' | 'refunded' | 'expired';
  paymentId: string | null;
  paymentMethod: string | null;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  ticketCount: number;
  items: {
    ticketTypeId: string;
    name: string;
    quantity: number;
    unitPrice: number;
  }[];
}

/**
 * Paginated response for ticket sales listing.
 * @property orders - List of orders
 * @property pagination - Pagination metadata
 * @property summary - Sales summary statistics
 */
export interface TicketSalesResponse {
  orders: TicketSaleOrder[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: {
    totalOrders: number;
    paidOrders: number;
    totalRevenue: number;
    pendingOrders: number;
    refundedOrders: number;
  };
}

/**
 * Payment details from the payment provider.
 * @property orderId - Internal order ID
 * @property paymentId - External payment ID
 * @property provider - Payment provider name
 * @property details - Provider-specific payment details
 */
export interface PaymentDetails {
  orderId: string;
  paymentId: string | null;
  provider: 'mollie' | 'stripe' | null;
  details: {
    id: string;
    status: string;
    amount: number;
    method?: string;
    paidAt?: string;
    metadata?: Record<string, string>;
  } | null;
}

// =============================================================================
// GUEST LIST (FREE TICKETS)
// =============================================================================

/**
 * An entry on the guest list for complimentary tickets.
 * @property id - Unique identifier
 * @property concertId - Concert ID
 * @property concertName - Concert name
 * @property concertDate - Concert date
 * @property orderNumber - Associated order number
 * @property organisation - Guest's organization/company
 * @property name - Guest's name
 * @property email - Guest's email
 * @property ticketCount - Number of complimentary tickets
 * @property ticketTypeId - Type of tickets to issue
 * @property ticketTypeName - Ticket type name
 * @property notes - Internal notes
 * @property ticketsSent - Whether tickets have been emailed
 * @property sentAt - Timestamp when tickets were sent
 * @property orderId - Created order ID
 * @property createdBy - User who added the guest
 * @property createdAt - Entry creation timestamp
 * @property updatedAt - Entry update timestamp
 * @property tickets - Issued tickets
 */
export interface GuestListEntry {
  id: string;
  concertId: string;
  concertName?: string;
  concertDate?: string;
  orderNumber: string | null;
  organisation: string | null;
  name: string;
  email: string;
  ticketCount: number;
  ticketTypeId: string | null;
  ticketTypeName?: string;
  notes: string | null;
  ticketsSent: boolean;
  sentAt: string | null;
  orderId: string | null;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  tickets?: Ticket[];
}

/**
 * Summary statistics for guest list.
 * @property totalGuests - Total number of guest entries
 * @property totalTickets - Total tickets allocated
 * @property ticketsSent - Tickets successfully sent
 * @property ticketsPending - Tickets waiting to be sent
 */
export interface GuestListSummary {
  totalGuests: number;
  totalTickets: number;
  ticketsSent: number;
  ticketsPending: number;
}

/**
 * Paginated guest list response.
 * @property entries - Guest list entries
 * @property pagination - Pagination metadata
 * @property summary - Guest list statistics
 */
export interface GuestListResponse {
  entries: GuestListEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: GuestListSummary;
}

// =============================================================================
// PAYMENT SETTINGS
// =============================================================================

/**
 * Fee configuration for a payment method.
 * @property method - Payment method identifier
 * @property providerFee - Fee charged by the payment provider
 * @property customerFee - Fee passed to the customer
 * @property isEnabled - Whether this method is enabled
 */
export interface PaymentMethodFee {
  method: string;
  providerFee: number;
  customerFee: number;
  isEnabled: boolean;
}

/**
 * Payment provider configuration and status.
 * @property provider - Active payment provider
 * @property isConnected - Whether provider is connected
 * @property canReceivePayments - Whether payments can be processed
 * @property canReceivePayouts - Whether payouts are enabled
 * @property profileId - Payment provider profile ID
 * @property mode - Live or test mode
 * @property liveKeyConfigured - Whether live API key is set
 * @property testKeyConfigured - Whether test API key is set
 * @property liveProfileId - Live mode profile ID
 * @property testProfileId - Test mode profile ID
 * @property passFeesToCustomer - Whether to pass fees to customers
 * @property connectedAt - Connection timestamp
 * @property fees - Fee configuration per payment method
 */
export interface PaymentSettings {
  provider: 'mollie' | 'stripe' | null;
  isConnected: boolean;
  canReceivePayments: boolean;
  canReceivePayouts: boolean;
  profileId: string | null;
  mode: 'live' | 'test';
  liveKeyConfigured: boolean;
  testKeyConfigured: boolean;
  liveProfileId: string | null;
  testProfileId: string | null;
  passFeesToCustomer: boolean;
  connectedAt: string | null;
  fees: PaymentMethodFee[];
}

/**
 * Mollie payment service status.
 * @property operational - Whether Mollie is fully operational
 * @property incidents - Current service incidents
 */
export interface MollieStatus {
  operational: boolean;
  incidents: {
    name: string;
    status: string;
    updatedAt: string;
  }[];
}

// =============================================================================
// TICKET DASHBOARD
// =============================================================================

/**
 * Ticket type statistics for dashboard.
 * @property id - Ticket type ID
 * @property name - Ticket type name
 * @property price - Price per ticket
 * @property quantity - Total quantity
 * @property sold - Number sold
 * @property available - Number remaining
 * @property revenue - Total revenue from this type
 */
export interface TicketDashboardTicketType {
  id: string;
  name: string;
  price: number;
  quantity: number;
  sold: number;
  available: number;
  revenue: number;
}

/**
 * Recent order for dashboard display.
 * @property id - Order ID
 * @property buyerName - Buyer's name
 * @property buyerEmail - Buyer's email
 * @property total - Order total
 * @property ticketCount - Number of tickets
 * @property status - Order status
 * @property createdAt - Order timestamp
 */
export interface TicketDashboardOrder {
  id: string;
  buyerName: string;
  buyerEmail: string;
  total: number;
  ticketCount: number;
  status: 'pending' | 'paid' | 'cancelled' | 'refunded' | 'expired';
  createdAt: string;
}

/**
 * Daily sales data point for charts.
 * @property date - Date in YYYY-MM-DD format
 * @property ticketsSold - Tickets sold on this date
 * @property revenue - Revenue on this date
 */
export interface TicketDashboardSalesOverTime {
  date: string;
  ticketsSold: number;
  revenue: number;
}

/**
 * Complete ticket dashboard data for a concert.
 * @property concertId - Concert ID
 * @property concertName - Concert name
 * @property concertDate - Concert date
 * @property concertLocation - Concert venue
 * @property totalTicketsSold - Total tickets sold
 * @property totalCapacity - Total ticket capacity
 * @property revenueToday - Today's revenue
 * @property revenueThisWeek - This week's revenue
 * @property revenueAllTime - Total revenue
 * @property ticketTypes - Sales by ticket type
 * @property salesOverTime - Daily sales for chart
 * @property recentOrders - Recent order list
 * @property guestListTickets - Number of guest list tickets
 */
export interface TicketDashboard {
  concertId: string;
  concertName: string;
  concertDate: string;
  concertLocation: string | null;
  totalTicketsSold: number;
  totalCapacity: number;
  revenueToday: number;
  revenueThisWeek: number;
  revenueAllTime: number;
  ticketTypes: TicketDashboardTicketType[];
  salesOverTime: TicketDashboardSalesOverTime[];
  recentOrders: TicketDashboardOrder[];
  guestListTickets: number;
}

// =============================================================================
// SCANNED TICKETS (ATTENDANCE)
// =============================================================================

/**
 * A ticket that has been scanned at entry.
 * @property id - Ticket ID
 * @property buyerName - Ticket holder name
 * @property buyerEmail - Ticket holder email
 * @property scannedAt - Scan timestamp
 * @property seatInfo - Seat assignment
 * @property status - Ticket status
 * @property ticketTypeName - Type of ticket
 * @property ticketPrice - Ticket price
 * @property validatedBy - Staff member who scanned
 */
export interface ScannedTicket {
  id: string;
  buyerName: string;
  buyerEmail: string;
  scannedAt: string;
  seatInfo: string | null;
  status: string;
  ticketTypeName: string;
  ticketPrice: number;
  validatedBy: string | null;
}

/**
 * Summary of scanned tickets.
 * @property totalTickets - Total valid tickets
 * @property scannedCount - Number scanned
 * @property scanPercentage - Percentage scanned
 */
export interface ScannedTicketsSummary {
  totalTickets: number;
  scannedCount: number;
  scanPercentage: number;
}

/**
 * Complete scanned tickets response.
 * @property concert - Concert details
 * @property summary - Scan statistics
 * @property scannedTickets - List of scanned tickets
 */
export interface ScannedTicketsResponse {
  concert: {
    id: string;
    name: string;
    date: string;
  };
  summary: ScannedTicketsSummary;
  scannedTickets: ScannedTicket[];
}

// =============================================================================
// TICKET TRANSFERS
// =============================================================================

/**
 * A pending or completed ticket transfer.
 * @property id - Transfer ID
 * @property ticketId - Ticket being transferred
 * @property ticket - Ticket details
 * @property recipientEmail - New owner's email
 * @property recipientName - New owner's name
 * @property transferCode - Unique transfer code
 * @property status - Transfer status
 * @property createdAt - Transfer initiation timestamp
 * @property expiresAt - Transfer expiration
 * @property acceptedAt - Acceptance timestamp
 * @property cancelledAt - Cancellation timestamp
 */
export interface TicketTransfer {
  id: string;
  ticketId: string;
  ticket: {
    id: string;
    code: string;
    ticketType: string;
    concert: {
      id: string;
      name: string;
      date: string;
      location: string | null;
    };
  };
  recipientEmail: string;
  recipientName: string;
  transferCode: string;
  status: 'pending' | 'accepted' | 'cancelled' | 'expired';
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  cancelledAt: string | null;
}

/**
 * Historical record of a completed transfer.
 * @property id - Transfer record ID
 * @property ticketId - Ticket ID
 * @property ticket - Ticket details
 * @property fromEmail - Original owner's email
 * @property fromName - Original owner's name
 * @property toEmail - New owner's email
 * @property toName - New owner's name
 * @property status - Final transfer status
 * @property transferredAt - Transfer completion timestamp
 */
export interface TicketTransferHistory {
  id: string;
  ticketId: string;
  ticket: {
    id: string;
    code: string;
    ticketType: string;
    concert: {
      id: string;
      name: string;
      date: string;
    };
  };
  fromEmail: string;
  fromName: string;
  toEmail: string;
  toName: string;
  status: 'pending' | 'accepted' | 'cancelled' | 'expired';
  transferredAt: string;
}

/**
 * A ticket that can be transferred.
 * @property id - Ticket ID
 * @property code - Ticket code
 * @property ticketType - Type of ticket
 * @property buyerName - Current owner name
 * @property status - Must be 'valid' to transfer
 * @property concert - Concert details
 * @property hasPendingTransfer - Whether a transfer is already pending
 */
export interface TransferableTicket {
  id: string;
  code: string;
  ticketType: string;
  buyerName: string;
  status: 'valid';
  concert: {
    id: string;
    name: string;
    date: string;
    location: string | null;
  };
  hasPendingTransfer: boolean;
}

// =============================================================================
// SALES PREDICTIONS
// =============================================================================

/**
 * Predicted ticket sales for a concert.
 * @property predictedTotalSales - Expected total tickets to sell
 * @property predictedRevenue - Expected total revenue
 * @property confidenceLevel - Confidence in the prediction
 * @property factors - Factors influencing the prediction
 * @property dailyPredictions - Predicted daily sales
 */
export interface SalesPrediction {
  predictedTotalSales: number;
  predictedRevenue: number;
  confidenceLevel: 'low' | 'medium' | 'high';
  factors: string[];
  dailyPredictions: { date: string; predictedSales: number }[];
}

/**
 * Dynamic pricing suggestion.
 * @property currentPrice - Current ticket price
 * @property suggestedPrice - Recommended price
 * @property priceRange - Suggested price range
 * @property demandLevel - Current demand assessment
 * @property reasoning - Reasons for the suggestion
 */
export interface PricingSuggestion {
  currentPrice: number;
  suggestedPrice: number;
  priceRange: { min: number; max: number };
  demandLevel: 'low' | 'medium' | 'high';
  reasoning: string[];
}

/**
 * Complete sales prediction response.
 * @property concert - Concert details
 * @property prediction - Sales predictions
 * @property pricing - Pricing suggestions
 * @property currentStats - Current sales statistics
 */
export interface SalesPredictionResponse {
  concert: {
    id: string;
    name: string;
    date: string;
    venueType: string | null;
    concertType: string | null;
  };
  prediction: SalesPrediction;
  pricing: PricingSuggestion;
  currentStats: {
    totalCapacity: number;
    totalSold: number;
    currentRevenue: number;
    fillRate: number;
    daysUntilConcert: number;
  };
}

// =============================================================================
// VENUE LAYOUT & SEAT HEATMAP
// =============================================================================

/**
 * A section in a venue layout.
 * @property id - Section ID
 * @property name - Section name (e.g., "Orchestra", "Balcony")
 * @property rowNumber - Row number in the venue
 * @property capacity - Total seats in section
 * @property sortOrder - Display order
 */
export interface VenueSection {
  id: string;
  name: string;
  rowNumber: number;
  capacity: number;
  sortOrder: number;
}

/**
 * A row within a venue section.
 * @property id - Row ID
 * @property sectionId - Parent section ID
 * @property rowLabel - Row label (e.g., "A", "B", "1")
 * @property seatCount - Number of seats in row
 * @property sortOrder - Display order
 */
export interface VenueRow {
  id: string;
  sectionId: string;
  rowLabel: string;
  seatCount: number;
  sortOrder: number;
}

/**
 * An individual seat in the venue.
 * @property id - Seat ID
 * @property rowId - Parent row ID
 * @property sectionId - Parent section ID
 * @property seatLabel - Seat label (e.g., "1", "2")
 * @property x - X coordinate for map display
 * @property y - Y coordinate for map display
 */
export interface VenueSeat {
  id: string;
  rowId: string;
  sectionId: string;
  seatLabel: string;
  x: number;
  y: number;
}

/**
 * Complete venue layout with all sections, rows, and seats.
 * @property id - Layout ID
 * @property concertId - Associated concert ID
 * @property name - Layout name
 * @property sections - Venue sections
 * @property rows - All rows
 * @property seats - All seats
 * @property width - Layout width in pixels
 * @property height - Layout height in pixels
 */
export interface VenueLayout {
  id: string;
  concertId: string;
  name: string;
  sections: VenueSection[];
  rows: VenueRow[];
  seats: VenueSeat[];
  width: number;
  height: number;
}

/**
 * Sales heatmap data for a concert venue.
 * @property concertId - Concert ID
 * @property concertName - Concert name
 * @property concertDate - Concert date
 * @property totalCapacity - Total venue capacity
 * @property totalSold - Total tickets sold
 * @property sections - Section-level heatmap data
 * @property seats - Seat-level sales data
 * @property salesPeriodStart - Start of sales period
 * @property salesPeriodEnd - End of sales period
 */
export interface SeatHeatmapData {
  concertId: string;
  concertName: string;
  concertDate: string;
  totalCapacity: number;
  totalSold: number;
  sections: SectionHeatmapData[];
  seats: SeatSalesData[];
  salesPeriodStart: string;
  salesPeriodEnd: string;
}

/**
 * Heatmap data for a venue section.
 * @property sectionId - Section ID
 * @property sectionName - Section name
 * @property capacity - Section capacity
 * @property sold - Tickets sold
 * @property revenue - Section revenue
 * @property averagePrice - Average ticket price
 * @property salesVelocity - Seats sold per day
 * @property timeToSellOut - Hours to sell out (null if not sold out)
 * @property popularityScore - Section popularity (0-100)
 * @property pricePerformanceScore - Price/demand alignment (0-100)
 */
export interface SectionHeatmapData {
  sectionId: string;
  sectionName: string;
  capacity: number;
  sold: number;
  revenue: number;
  averagePrice: number;
  salesVelocity: number;
  timeToSellOut: number | null;
  popularityScore: number;
  pricePerformanceScore: number;
}

/**
 * Sales data for an individual seat.
 * @property seatId - Seat ID
 * @property sectionId - Section ID
 * @property rowLabel - Row label
 * @property seatLabel - Seat label
 * @property x - X coordinate for display
 * @property y - Y coordinate for display
 * @property status - Current seat status
 * @property soldAt - Sale timestamp
 * @property price - Ticket price paid
 * @property ticketTypeId - Ticket type purchased
 * @property ticketTypeName - Ticket type name
 * @property timeToSell - Seconds from sale start to sold
 * @property salesSpeedPercentile - Position in selling order (0-100)
 */
export interface SeatSalesData {
  seatId: string;
  sectionId: string;
  rowLabel: string;
  seatLabel: string;
  x: number;
  y: number;
  status: 'available' | 'sold' | 'reserved' | 'held';
  soldAt: string | null;
  price: number | null;
  ticketTypeId: string | null;
  ticketTypeName: string | null;
  timeToSell: number | null;
  salesSpeedPercentile: number | null;
}

// =============================================================================
// INSTRUMENT ASSET MANAGEMENT TYPES
// =============================================================================

/**
 * Category of musical instrument.
 */
export type AssetCategory = 'woodwind' | 'brass' | 'percussion' | 'strings' | 'keyboard' | 'accessories' | 'other';

/**
 * Current status of an instrument asset.
 */
export type AssetStatus = 'available' | 'on_loan' | 'in_repair' | 'in_storage' | 'written_off' | 'sold' | 'lost';

/**
 * Physical condition of an instrument.
 */
export type AssetCondition = 'excellent' | 'good' | 'fair' | 'poor' | 'damaged' | 'needs_repair';

/**
 * Priority level for repair requests.
 */
export type RepairPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Status of a repair request.
 */
export type RepairStatus = 'pending' | 'approved' | 'in_progress' | 'completed' | 'cancelled';

/**
 * Status of an instrument loan.
 */
export type LoanStatus = 'active' | 'returned' | 'overdue' | 'cancelled';

/**
 * Type of instrument valuation.
 */
export type ValuationType = 'purchase' | 'insurance' | 'sale' | 'appraisal' | 'depreciation';

/**
 * Type of repair work.
 */
export type RepairType = 'preventive' | 'corrective' | 'emergency' | 'overhaul' | 'cleaning';

/**
 * Type of instrument loan.
 */
export type LoanType = 'standard' | 'trial' | 'long_term' | 'performance';

/**
 * Type of document attached to an instrument.
 */
export type DocumentType =
  'manual' | 'warranty' | 'certificate' | 'invoice' | 'photo' | 'contract' | 'appraisal' | 'other';

/**
 * Type of insurance policy.
 */
export type InsurancePolicyType = 'all_risk' | 'theft' | 'damage' | 'comprehensive';

/**
 * Type of insurance coverage.
 */
export type InsuranceCoverageType = 'individual' | 'collective' | 'blanket';

/**
 * Type of insurance incident.
 */
export type IncidentType = 'theft' | 'damage' | 'loss' | 'fire' | 'water' | 'vandalism' | 'accident' | 'other';

/**
 * Status of an insurance claim.
 */
export type ClaimStatus = 'submitted' | 'under_review' | 'approved' | 'rejected' | 'paid' | 'closed';

/**
 * Complete instrument asset record.
 * @property id - Unique identifier
 * @property name - Display name for the instrument
 * @property instrumentType - Type of instrument
 * @property category - Instrument category
 * @property brand - Manufacturer brand
 * @property model - Model name/number
 * @property serialNumber - Manufacturer serial number
 * @property barcode - Internal barcode/asset tag
 * @property yearManufactured - Year of manufacture
 * @property countryOfOrigin - Country where manufactured
 * @property color - Instrument color
 * @property material - Primary material
 * @property weightKg - Weight in kilograms
 * @property dimensions - Dimension string
 * @property purchaseDate - Date acquired
 * @property purchasePrice - Original purchase price
 * @property purchaseVendor - Vendor purchased from
 * @property currentValue - Current estimated value
 * @property replacementValue - Cost to replace
 * @property depreciationRate - Annual depreciation percentage
 * @property status - Current availability status
 * @property condition - Physical condition
 * @property location - Current location
 * @property storageLocation - Storage location when not in use
 * @property assignedToUserId - Currently assigned user
 * @property assignedDate - Date assigned
 * @property expectedReturnDate - Expected return date
 * @property maintenanceIntervalMonths - Maintenance schedule
 * @property lastMaintenanceDate - Last maintenance performed
 * @property nextMaintenanceDue - Next scheduled maintenance
 * @property maintenanceNotes - Maintenance instructions
 * @property insurancePolicyId - Linked insurance policy
 * @property photoUrls - Photos of the instrument
 * @property tags - Categorization tags
 * @property notes - General notes
 * @property customFields - Custom field values
 * @property createdAt - Record creation timestamp
 * @property updatedAt - Last update timestamp
 * @property assignedUser - Currently assigned user details
 * @property isOverdue - Whether return is overdue
 */
export interface InstrumentAsset {
  id: string;
  name: string;
  instrumentType: string;
  category: AssetCategory;
  brand?: string;
  model?: string;
  serialNumber?: string;
  barcode?: string;
  yearManufactured?: number;
  countryOfOrigin?: string;
  color?: string;
  material?: string;
  weightKg?: number;
  dimensions?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  purchaseVendor?: string;
  currentValue?: number;
  replacementValue?: number;
  depreciationRate?: number;
  status: AssetStatus;
  condition: AssetCondition;
  location?: string;
  storageLocation?: string;
  assignedToUserId?: string;
  assignedDate?: string;
  expectedReturnDate?: string;
  maintenanceIntervalMonths?: number;
  lastMaintenanceDate?: string;
  nextMaintenanceDue?: string;
  maintenanceNotes?: string;
  insurancePolicyId?: string;
  photoUrls?: string[];
  tags?: string[];
  notes?: string;
  customFields?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  assignedUser?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  isOverdue?: boolean;
}

/**
 * Detailed instrument asset with full history.
 * @property valuations - Valuation history
 * @property repairs - Repair history
 * @property loans - Loan history
 * @property documents - Attached documents
 * @property insurance - Current insurance policy
 */
export interface InstrumentAssetDetail extends InstrumentAsset {
  valuations: InstrumentValuation[];
  repairs: InstrumentRepairSummary[];
  loans: InstrumentLoanSummary[];
  documents: InstrumentDocumentSummary[];
  insurance?: {
    id: string;
    policyNumber: string;
    providerName: string;
    coverageAmount: number;
    endDate?: string;
  };
}

/**
 * Summary statistics for instrument assets.
 * @property total - Total number of assets
 * @property available - Assets currently available
 * @property onLoan - Assets currently on loan
 * @property inRepair - Assets currently being repaired
 * @property inStorage - Assets in storage
 * @property totalValue - Sum of current values
 * @property totalReplacementValue - Sum of replacement values
 * @property byCategory - Breakdown by category
 * @property maintenanceDueCount - Assets needing maintenance
 * @property overdueLoansCount - Overdue loans
 */
export interface InstrumentAssetSummary {
  total: number;
  available: number;
  onLoan: number;
  inRepair: number;
  inStorage: number;
  totalValue: number;
  totalReplacementValue: number;
  byCategory: { category: string; count: number; value: number }[];
  maintenanceDueCount: number;
  overdueLoansCount: number;
}

/**
 * Valuation record for an instrument.
 * @property id - Valuation ID
 * @property valuationDate - Date of valuation
 * @property valuationType - Type of valuation
 * @property valuedAmount - Assessed value
 * @property currency - Currency code
 * @property appraiserName - Appraiser's name
 * @property appraiserCompany - Appraiser's company
 * @property appraiserCredentials - Appraiser's qualifications
 * @property valuationMethod - Method used for valuation
 * @property marketComparison - Market comparison notes
 * @property conditionAtValuation - Condition at time of valuation
 * @property certificateUrl - URL to valuation certificate
 * @property notes - Additional notes
 * @property createdAt - Record creation timestamp
 */
export interface InstrumentValuation {
  id: string;
  valuationDate: string;
  valuationType: ValuationType;
  valuedAmount: number;
  currency: string;
  appraiserName?: string;
  appraiserCompany?: string;
  appraiserCredentials?: string;
  valuationMethod?: string;
  marketComparison?: string;
  conditionAtValuation?: AssetCondition;
  certificateUrl?: string;
  notes?: string;
  createdAt: string;
}

/**
 * Full repair record for an instrument.
 * @property id - Repair ID
 * @property repairType - Type of repair
 * @property priority - Repair priority
 * @property status - Current repair status
 * @property reportedDate - Date issue was reported
 * @property issueDescription - Description of the issue
 * @property diagnosis - Technician's diagnosis
 * @property repairShopName - Repair shop name
 * @property repairShopContact - Shop contact info
 * @property repairShopAddress - Shop address
 * @property technicianName - Technician's name
 * @property estimatedCost - Estimated repair cost
 * @property actualCost - Actual repair cost
 * @property partsReplaced - Parts that were replaced
 * @property laborHours - Hours of labor
 * @property estimatedCompletion - Estimated completion date
 * @property startedDate - Date work started
 * @property completedDate - Date work completed
 * @property warrantyClaimRef - Whether this is a warranty claim
 * @property insuranceClaimId - Linked insurance claim
 * @property invoiceNumber - Repair invoice number
 * @property invoiceUrl - URL to invoice
 * @property qualityRating - Rating of repair quality (1-5)
 * @property qualityNotes - Notes on repair quality
 * @property notes - Additional notes
 * @property createdAt - Record creation timestamp
 */
export interface InstrumentRepair {
  id: string;
  repairType: RepairType;
  priority: RepairPriority;
  status: RepairStatus;
  reportedDate: string;
  issueDescription: string;
  diagnosis?: string;
  repairShopName?: string;
  repairShopContact?: string;
  repairShopAddress?: string;
  technicianName?: string;
  estimatedCost?: number;
  actualCost?: number;
  partsReplaced?: string;
  laborHours?: number;
  estimatedCompletion?: string;
  startedDate?: string;
  completedDate?: string;
  warrantyClaimRef?: boolean;
  insuranceClaimId?: string;
  invoiceNumber?: string;
  invoiceUrl?: string;
  qualityRating?: number;
  qualityNotes?: string;
  notes?: string;
  createdAt: string;
}

/**
 * Summary of an instrument repair.
 * @property id - Repair ID
 * @property repairType - Type of repair
 * @property priority - Repair priority
 * @property status - Current status
 * @property issueDescription - Issue description
 * @property estimatedCost - Estimated cost
 * @property actualCost - Actual cost
 * @property reportedDate - Date reported
 * @property completedDate - Date completed
 */
export interface InstrumentRepairSummary {
  id: string;
  repairType: RepairType;
  priority: RepairPriority;
  status: RepairStatus;
  issueDescription: string;
  estimatedCost?: number;
  actualCost?: number;
  reportedDate: string;
  completedDate?: string;
}

/**
 * Full loan record for an instrument.
 * @property id - Loan ID
 * @property borrower - User borrowing the instrument
 * @property loanType - Type of loan
 * @property purpose - Purpose of the loan
 * @property loanDate - Date loaned out
 * @property expectedReturnDate - Expected return date
 * @property actualReturnDate - Actual return date
 * @property conditionAtLoan - Condition when loaned
 * @property conditionAtReturn - Condition when returned
 * @property accessoriesLoaned - Accessories included
 * @property accessoriesReturned - Accessories returned
 * @property depositAmount - Deposit collected
 * @property rentalFee - Rental fee charged
 * @property status - Current loan status
 * @property damageReported - Damage report
 * @property damageCost - Cost of damage
 * @property notes - Additional notes
 * @property createdAt - Record creation timestamp
 */
export interface InstrumentLoan {
  id: string;
  borrower: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
  };
  loanType: LoanType;
  purpose?: string;
  loanDate: string;
  expectedReturnDate?: string;
  actualReturnDate?: string;
  conditionAtLoan: AssetCondition;
  conditionAtReturn?: AssetCondition;
  accessoriesLoaned?: string[];
  accessoriesReturned?: string[];
  depositAmount?: number;
  rentalFee?: number;
  status: LoanStatus;
  damageReported?: string;
  damageCost?: number;
  notes?: string;
  createdAt: string;
}

/**
 * Summary of an instrument loan.
 * @property id - Loan ID
 * @property borrower - Borrower details
 * @property loanType - Type of loan
 * @property loanDate - Date loaned
 * @property expectedReturnDate - Expected return
 * @property actualReturnDate - Actual return
 * @property status - Loan status
 */
export interface InstrumentLoanSummary {
  id: string;
  borrower: {
    id: string;
    firstName: string;
    lastName: string;
  };
  loanType: LoanType;
  loanDate: string;
  expectedReturnDate?: string;
  actualReturnDate?: string;
  status: LoanStatus;
}

/**
 * Document attached to an instrument.
 * @property id - Document ID
 * @property documentType - Type of document
 * @property title - Document title
 * @property description - Document description
 * @property fileUrl - URL to access document
 * @property fileName - Original filename
 * @property fileSize - File size in bytes
 * @property mimeType - MIME type
 * @property version - Document version
 * @property validFrom - Validity start date
 * @property validUntil - Validity end date
 * @property isPublic - Whether publicly accessible
 * @property tags - Document tags
 * @property createdAt - Upload timestamp
 */
export interface InstrumentDocument {
  id: string;
  documentType: DocumentType;
  title: string;
  description?: string;
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  version?: string;
  validFrom?: string;
  validUntil?: string;
  isPublic?: boolean;
  tags?: string[];
  createdAt: string;
}

/**
 * Summary of an instrument document.
 * @property id - Document ID
 * @property documentType - Type of document
 * @property title - Document title
 * @property fileUrl - Access URL
 * @property fileName - Original filename
 * @property createdAt - Upload timestamp
 */
export interface InstrumentDocumentSummary {
  id: string;
  documentType: DocumentType;
  title: string;
  fileUrl: string;
  fileName: string;
  createdAt: string;
}

/**
 * Event in instrument history audit log.
 * @property id - Event ID
 * @property eventType - Type of event
 * @property eventDate - When event occurred
 * @property description - Event description
 * @property oldValue - Previous value (for changes)
 * @property newValue - New value (for changes)
 * @property fieldChanged - Field that changed
 * @property relatedId - ID of related record
 * @property relatedType - Type of related record
 * @property user - User who triggered event
 */
export interface InstrumentHistoryEvent {
  id: string;
  eventType: string;
  eventDate: string;
  description: string;
  oldValue?: string;
  newValue?: string;
  fieldChanged?: string;
  relatedId?: string;
  relatedType?: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

/**
 * Insurance policy for instruments.
 * @property id - Policy ID
 * @property policyNumber - Policy number
 * @property providerName - Insurance provider name
 * @property providerContact - Provider contact name
 * @property providerPhone - Provider phone
 * @property providerEmail - Provider email
 * @property policyType - Type of policy
 * @property coverageType - Coverage type
 * @property coverageAmount - Maximum coverage
 * @property deductible - Policy deductible
 * @property currency - Currency code
 * @property premiumAmount - Premium amount
 * @property premiumFrequency - Premium payment frequency
 * @property premiumDueDate - Next premium due
 * @property startDate - Policy start date
 * @property endDate - Policy end date
 * @property autoRenew - Auto-renewal status
 * @property status - Policy status
 * @property coveredAssetsCount - Number of assets covered
 * @property totalCoveredValue - Total covered value
 * @property createdAt - Record creation timestamp
 */
export interface InsurancePolicy {
  id: string;
  policyNumber: string;
  providerName: string;
  providerContact?: string;
  providerPhone?: string;
  providerEmail?: string;
  policyType: InsurancePolicyType;
  coverageType: InsuranceCoverageType;
  coverageAmount: number;
  deductible: number;
  currency: string;
  premiumAmount?: number;
  premiumFrequency?: 'monthly' | 'quarterly' | 'yearly';
  premiumDueDate?: string;
  startDate: string;
  endDate?: string;
  autoRenew: boolean;
  status: 'active' | 'expired' | 'cancelled';
  coveredAssetsCount?: number;
  totalCoveredValue?: number;
  createdAt: string;
}

/**
 * Detailed insurance policy with covered assets and claims.
 * @property coverageDetails - Coverage detail text
 * @property exclusions - Policy exclusions
 * @property documentUrl - URL to policy document
 * @property coveredAssets - List of covered instruments
 * @property claims - List of claims on this policy
 */
export interface InsurancePolicyDetail extends InsurancePolicy {
  coverageDetails?: string;
  exclusions?: string;
  documentUrl?: string;
  coveredAssets: {
    id: string;
    asset: {
      id: string;
      name: string;
      instrumentType: string;
      serialNumber?: string;
    };
    coveredAmount: number;
    coverageStart: string;
    coverageEnd?: string;
    specialConditions?: string;
  }[];
  claims: {
    id: string;
    assetName: string;
    claimNumber?: string;
    claimDate: string;
    incidentType: IncidentType;
    claimedAmount?: number;
    approvedAmount?: number;
    paidAmount?: number;
    status: ClaimStatus;
  }[];
}

/**
 * Insurance claim record.
 * @property id - Claim ID
 * @property claimNumber - Insurance claim number
 * @property claimDate - Date claim filed
 * @property incidentDate - Date of incident
 * @property incidentType - Type of incident
 * @property incidentDescription - Description of incident
 * @property incidentLocation - Where incident occurred
 * @property claimedAmount - Amount claimed
 * @property approvedAmount - Amount approved
 * @property paidAmount - Amount paid
 * @property status - Claim status
 * @property resolutionDate - Date resolved
 * @property policy - Related policy details
 * @property asset - Related instrument details
 * @property createdAt - Record creation timestamp
 */
export interface InsuranceClaim {
  id: string;
  claimNumber?: string;
  claimDate: string;
  incidentDate: string;
  incidentType: IncidentType;
  incidentDescription: string;
  incidentLocation?: string;
  claimedAmount?: number;
  approvedAmount?: number;
  paidAmount?: number;
  status: ClaimStatus;
  resolutionDate?: string;
  policy: {
    id: string;
    policyNumber: string;
    providerName: string;
  };
  asset: {
    id: string;
    name: string;
    instrumentType: string;
  };
  createdAt: string;
}

/**
 * Generic paginated result wrapper.
 * @template T - Type of items in the result
 * @property data - Array of result items
 * @property total - Total number of items
 * @property page - Current page number
 * @property limit - Items per page
 * @property totalPages - Total number of pages
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages?: number;
}

// =============================================================================
// STAGE LAYOUTS (PODIUMPLOT DESIGNER)
// =============================================================================

/**
 * Type of position on a stage layout.
 */
export type StagePositionType = 'chair' | 'stand' | 'conductor' | 'piano' | 'percussion' | 'other';

/**
 * Type of shape element on a stage layout.
 */
export type StageShapeType = 'rect' | 'circle' | 'line' | 'text';

/**
 * A position (seat) on the stage layout.
 * @property id - Position ID
 * @property x - X coordinate on the canvas
 * @property y - Y coordinate on the canvas
 * @property type - Type of position
 * @property rotation - Rotation angle in degrees
 * @property label - Position label
 * @property section - Section this position belongs to
 * @property instrumentId - Instrument assigned to this position
 */
export interface StagePosition {
  id: string;
  x: number;
  y: number;
  type: StagePositionType;
  rotation?: number;
  label?: string;
  section?: string;
  instrumentId?: string;
}

/**
 * A shape element on the stage layout.
 * @property id - Shape ID
 * @property type - Shape type
 * @property x - X coordinate
 * @property y - Y coordinate
 * @property width - Width (for rect)
 * @property height - Height (for rect)
 * @property radius - Radius (for circle)
 * @property label - Text label
 * @property fill - Fill color
 * @property stroke - Stroke color
 * @property fontSize - Font size (for text)
 */
export interface StageShape {
  id: string;
  type: StageShapeType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  label?: string;
  fill?: string;
  stroke?: string;
  fontSize?: number;
}

/**
 * A section definition in a stage layout.
 * @property id - Section ID
 * @property name - Section name
 * @property color - Section display color
 * @property instrumentId - Default instrument for section
 */
export interface StageSection {
  id: string;
  name: string;
  color: string;
  instrumentId?: string;
}

/**
 * Complete stage layout data structure.
 * @property positions - All positions on the stage
 * @property shapes - Decorative shapes
 * @property sections - Section definitions
 */
export interface StageLayoutData {
  positions: StagePosition[];
  shapes: StageShape[];
  sections: StageSection[];
}

/**
 * A saved stage layout template.
 * @property id - Layout ID
 * @property name - Layout name
 * @property description - Layout description
 * @property venueName - Venue this layout is for
 * @property stageWidth - Stage width in pixels
 * @property stageDepth - Stage depth in pixels
 * @property isTemplate - Whether this is a reusable template
 * @property isDefault - Whether this is the default layout
 * @property layoutData - Position and shape data
 * @property thumbnailUrl - URL to layout thumbnail
 * @property usageCount - Number of times used
 * @property createdBy - User who created the layout
 * @property createdAt - Creation timestamp
 * @property updatedAt - Last update timestamp
 */
export interface StageLayout {
  id: string;
  name: string;
  description: string | null;
  venueName: string | null;
  stageWidth: number;
  stageDepth: number;
  isTemplate: boolean;
  isDefault: boolean;
  layoutData?: StageLayoutData;
  thumbnailUrl: string | null;
  usageCount?: number;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Assignment of a user or instrument to a stage position.
 * @property userId - Assigned user ID
 * @property instrumentId - Assigned instrument ID
 * @property name - Display name override
 */
export interface StageAssignment {
  userId?: string;
  instrumentId?: string;
  name?: string;
}

/**
 * Stage assignments for a specific concert.
 * @property id - Assignment record ID
 * @property layoutId - Stage layout being used
 * @property layoutName - Layout name
 * @property stageWidth - Stage width
 * @property stageDepth - Stage depth
 * @property layoutData - Layout configuration
 * @property assignments - Position-to-user/instrument assignments
 * @property createdAt - Creation timestamp
 * @property updatedAt - Last update timestamp
 */
export interface ConcertStageAssignment {
  id: string;
  layoutId: string;
  layoutName: string;
  stageWidth: number;
  stageDepth: number;
  layoutData: StageLayoutData;
  assignments: Record<string, StageAssignment>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Response for concert stage assignment query.
 * @property concert - Basic concert info
 * @property assignment - Stage assignment (null if not set up)
 */
export interface ConcertStageResponse {
  concert: {
    id: string;
    name: string;
    date: string;
  };
  assignment: ConcertStageAssignment | null;
}

/**
 * Printable seat card for a stage position.
 * @property positionId - Position ID on the stage
 * @property label - Position label
 * @property section - Section name
 * @property sectionColor - Section color for card border
 * @property musicianName - Name of assigned musician
 * @property instrument - Instrument being played
 * @property standNumber - Music stand number
 */
export interface SeatCard {
  positionId: string;
  label: string;
  section: string;
  sectionColor: string;
  musicianName: string;
  instrument: string;
  standNumber: number;
}

/**
 * Response for printable seat cards request.
 * @property concert - Concert details
 * @property layoutName - Name of the stage layout
 * @property seatCards - List of seat cards to print
 */
export interface PrintableSeatCardsResponse {
  concert: {
    id: string;
    name: string;
    date: string;
    location: string | null;
  };
  layoutName: string;
  seatCards: SeatCard[];
}
