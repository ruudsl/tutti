export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'music_committee' | 'equipment_committee' | 'uniforms_committee' | 'conductor' | 'member';
  associationId: string | null;
  associationName?: string;
  mfaEnabled?: boolean;
  lastLogin?: string | null;
  photoUrl?: string | null;
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

export interface StreamingLinks {
  spotify_url?: string | null;
  apple_music_url?: string | null;
  youtube_music_url?: string | null;
  spotify_preview_url?: string | null;
  apple_music_preview_url?: string | null;
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
  streamingLinks?: StreamingLinks | null;
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

export interface SpondOrchestraGroup {
  id: string;
  orchestraId: string;
  orchestraName: string;
  spondGroupId: string;
  spondGroupName?: string;
}

export interface SpondMemberLink {
  id: string;
  spondMemberId: string;
  userId: string;
  spondMemberName?: string;
  firstName: string;
  lastName: string;
  email: string;
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

// ==================== SEATING (ORKEST OPSTELLING) ====================

export interface SeatingSectionInstrument {
  id: string;
  name: string;
  tuning: string | null;
  sortOrder: number;
}

export interface SeatingSection {
  id: string;
  name: string;
  rowNumber: number;
  sortOrder: number;
  instruments: SeatingSectionInstrument[];
  createdAt: string;
}

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

export interface SeatingNeighbor {
  id: string;
  userId: string;
  userName: string;
  neighborUserId: string;
  neighborUserName: string;
  preference: 'preferred' | 'avoid';
}

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

export interface SeatingChartSection {
  id: string;
  name: string;
  rowNumber: number;
  seatCount: number;
}

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

export interface SeatingChart {
  orchestraId: string;
  orchestraName: string;
  sections: SeatingChartSection[];
  seats: SeatingChartSeat[];
  totalRows: number;
}

// ==================== TICKETING SYSTEM ====================

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
}

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
}

export interface TicketOrderItem {
  ticketTypeId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

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

// Ticket Sales Admin types
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

// ==================== GUEST LIST (FREE TICKETS) ====================

export interface GuestListEntry {
  id: string;
  concertId: string;
  concertName?: string;
  concertDate?: string;
  name: string;
  email: string;
  ticketCount: number;
  ticketTypeId: string | null;
  ticketTypeName?: string;
  notes: string | null;
  ticketsSent: boolean;
  sentAt: string | null;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  tickets?: Ticket[];
}

export interface GuestListSummary {
  totalGuests: number;
  totalTickets: number;
  ticketsSent: number;
  ticketsPending: number;
}

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
