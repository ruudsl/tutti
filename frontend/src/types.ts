export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'music_committee' | 'conductor' | 'member';
  associationId: string | null;
  associationName?: string;
  mfaEnabled?: boolean;
  lastLogin?: string | null;
  instruments?: Instrument[];
  orchestras?: Orchestra[];
}

export interface MfaSetupResponse {
  secret: string;
  qrCode: string;
  message: string;
}

export interface LoginResponse {
  token?: string;
  user?: User;
  requiresMfa?: boolean;
  message?: string;
}

export interface Instrument {
  id: string;
  name: string;
  tuning: string | null;
  clef?: string | null;
  aliases?: { id: string; name: string }[];
}

export interface Orchestra {
  id: string;
  name: string;
  memberCount?: number;
  listCount?: number;
}

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

export interface Genre {
  id: string;
  name: string;
}

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
  instruments: string[];
  genres?: Genre[];
  onList?: boolean;
  lists?: { id: string; name: string; orchestra_name: string }[];
}

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

export interface Association {
  id: string;
  name: string;
  memberCount?: number;
  orchestraCount?: number;
}

export interface AssociationSettings {
  name: string;
  displayName: string;
  logoPath: string | null;
  logoUrl: string | null;
  theme: ThemeSettings | null;
}

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

export interface RehearsalDefaultDay {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string | null;
  orchestra_id: string | null;
  orchestra_name: string | null;
}

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

export interface RehearsalPiece {
  id: string;
  title: string;
  notes: string | null;
  sort_order: number;
}

export interface RehearsalAttendance {
  id: string;
  user_id: string | null;
  spond_member_id: string | null;
  member_name: string;
  status: 'accepted' | 'declined' | 'waiting' | 'unknown';
}

export interface RehearsalDetail extends Rehearsal {
  pieces: RehearsalPiece[];
  attendance: RehearsalAttendance[];
}

export interface SpondConfig {
  configured: boolean;
  username?: string;
  groupId?: string | null;
  syncEnabled?: boolean;
  lastSync?: string | null;
}

export interface SpondGroup {
  id: string;
  name: string;
  memberCount: number;
}

export interface SpondSyncResult {
  message: string;
  synced: number;
  total: number;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface MicrosoftConfig {
  clientId: string;
  tenantId: string;
  enabled: boolean;
  configured: boolean;
  redirectUri: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  enabled: boolean;
  configured: boolean;
}

// ==================== EQUIPMENT (INSTRUMENTENBEHEER) ====================

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

export interface EquipmentDamageLog {
  id: string;
  date: string;
  description: string;
  repairCost: number | null;
  repairedBy: string | null;
  status: 'reported' | 'in_repair' | 'repaired' | 'written_off';
  createdAt: string;
}

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

export interface EquipmentDetail extends Equipment {
  damageLogs: EquipmentDamageLog[];
  loanHistory: EquipmentLoan[];
}

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

// ==================== UNIFORMS (UNIFORMEN-INVENTARIS) ====================

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

export interface UniformItemDetail extends UniformItem {
  assignmentHistory: UniformAssignment[];
}

export interface UniformSetRequirement {
  id: string;
  itemType: string;
  quantity: number;
}

export interface UniformSet {
  id: string;
  name: string;
  description: string | null;
  requirements: UniformSetRequirement[];
  createdAt: string;
}

export interface UniformItemType {
  value: string;
  label: string;
}

export interface UniformSizeAvailability {
  itemType: string;
  sizeStandard: string;
  count: number;
}

// ==================== CONCERTS (CONCERT-ARCHIEF) ====================

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
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

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

export interface ConcertDetail extends Omit<Concert, 'programCount' | 'attendanceCount' | 'mediaCount'> {
  program: ConcertProgramItem[];
  media: ConcertMedia[];
  attendance: ConcertAttendance[];
}

export interface ConcertStatistics {
  totalConcerts: number;
  concertsPerYear: { year: string; count: number }[];
  mostPlayedPieces: { title: string; playCount: number; lastPlayed: string }[];
  concertsPerType: { type: string; count: number }[];
}

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

export interface ConcertType {
  value: string;
  label: string;
}

export interface VenueType {
  value: string;
  label: string;
}

export interface MediaType {
  value: string;
  label: string;
}
