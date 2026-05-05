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

export interface TelegramConfig {
  tokenPreview: string;
  configured: boolean;
  enabled: boolean;
}

export interface WhatsAppConfig {
  provider: 'meta' | 'twilio';
  enabled: boolean;
  configured: boolean;
  meta: { phoneNumberId: string; accessTokenPreview: string; configured: boolean };
  twilio: { accountSid: string; authTokenPreview: string; whatsappFrom: string; configured: boolean };
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
  // Accessibility fields
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

export interface ConcertDetail extends Omit<Concert, 'programCount' | 'attendanceCount' | 'mediaCount' | 'hasAccessibilityInfo'> {
  program: ConcertProgramItem[];
  media: ConcertMedia[];
  attendance: ConcertAttendance[];
  // Full accessibility info for detail view
  accessibleParkingInfo?: string | null;
  accessibilityInfo?: string | null;
  accessibilityContactEmail?: string | null;
  accessibilityContactPhone?: string | null;
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
  serviceFee: number;
  showServiceFeeSeparate: boolean;
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
  captcha?: {
    enabled: boolean;
    siteKey: string | null;
  };
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

// ==================== PAYMENT SETTINGS ====================

export interface PaymentMethodFee {
  method: string;
  providerFee: number;
  customerFee: number;
  isEnabled: boolean;
}

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

export interface MollieStatus {
  operational: boolean;
  incidents: {
    name: string;
    status: string;
    updatedAt: string;
  }[];
}

// ==================== TICKET DASHBOARD ====================

export interface TicketDashboardTicketType {
  id: string;
  name: string;
  price: number;
  quantity: number;
  sold: number;
  available: number;
  revenue: number;
}

export interface TicketDashboardOrder {
  id: string;
  buyerName: string;
  buyerEmail: string;
  total: number;
  ticketCount: number;
  status: 'pending' | 'paid' | 'cancelled' | 'refunded' | 'expired';
  createdAt: string;
}

export interface TicketDashboardSalesOverTime {
  date: string;
  ticketsSold: number;
  revenue: number;
}

export interface TicketDashboard {
  concertId: string;
  concertName: string;
  concertDate: string;
  concertLocation: string | null;
  // Sales counters
  totalTicketsSold: number;
  totalCapacity: number;
  // Revenue
  revenueToday: number;
  revenueThisWeek: number;
  revenueAllTime: number;
  // Sales by ticket type
  ticketTypes: TicketDashboardTicketType[];
  // Sales over time (last 30 days)
  salesOverTime: TicketDashboardSalesOverTime[];
  // Recent orders
  recentOrders: TicketDashboardOrder[];
  // Guest list count
  guestListTickets: number;
}

// ==================== SCANNED TICKETS (ATTENDANCE) ====================

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

export interface ScannedTicketsSummary {
  totalTickets: number;
  scannedCount: number;
  scanPercentage: number;
}

export interface ScannedTicketsResponse {
  concert: {
    id: string;
    name: string;
    date: string;
  };
  summary: ScannedTicketsSummary;
  scannedTickets: ScannedTicket[];
}

// ==================== TICKET TRANSFERS ====================

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

// ==================== SALES PREDICTIONS ====================

export interface SalesPrediction {
  predictedTotalSales: number;
  predictedRevenue: number;
  confidenceLevel: 'low' | 'medium' | 'high';
  factors: string[];
  dailyPredictions: { date: string; predictedSales: number }[];
}

export interface PricingSuggestion {
  currentPrice: number;
  suggestedPrice: number;
  priceRange: { min: number; max: number };
  demandLevel: 'low' | 'medium' | 'high';
  reasoning: string[];
}

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

// ==================== VENUE LAYOUT & SEAT HEATMAP ====================

export interface VenueSection {
  id: string;
  name: string;
  rowNumber: number;
  capacity: number;
  sortOrder: number;
}

export interface VenueRow {
  id: string;
  sectionId: string;
  rowLabel: string;
  seatCount: number;
  sortOrder: number;
}

export interface VenueSeat {
  id: string;
  rowId: string;
  sectionId: string;
  seatLabel: string;
  x: number;
  y: number;
}

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

export interface SeatHeatmapData {
  concertId: string;
  concertName: string;
  concertDate: string;
  totalCapacity: number;
  totalSold: number;
  sections: SectionHeatmapData[];
  seats: SeatSalesData[];
  // Time range for the sales data
  salesPeriodStart: string;
  salesPeriodEnd: string;
}

export interface SectionHeatmapData {
  sectionId: string;
  sectionName: string;
  capacity: number;
  sold: number;
  revenue: number;
  averagePrice: number;
  // Sales velocity metrics
  salesVelocity: number; // seats sold per day
  timeToSellOut: number | null; // hours to sell out, null if not sold out
  popularityScore: number; // 0-100 score
  // Price performance
  pricePerformanceScore: number; // 0-100, higher = sells well at this price
}

export interface SeatSalesData {
  seatId: string;
  sectionId: string;
  rowLabel: string;
  seatLabel: string;
  // Position for heatmap rendering
  x: number;
  y: number;
  // Sales data
  status: 'available' | 'sold' | 'reserved' | 'held';
  soldAt: string | null;
  price: number | null;
  ticketTypeId: string | null;
  ticketTypeName: string | null;
  // Calculated metrics
  timeToSell: number | null; // seconds from sale start to sold
  salesSpeedPercentile: number | null; // 0-100, where in the selling order this seat was
}

// ===========================================
// INSTRUMENT ASSET MANAGEMENT TYPES
// ===========================================

export type AssetCategory = 'woodwind' | 'brass' | 'percussion' | 'strings' | 'keyboard' | 'accessories' | 'other';
export type AssetStatus = 'available' | 'on_loan' | 'in_repair' | 'in_storage' | 'written_off' | 'sold' | 'lost';
export type AssetCondition = 'excellent' | 'good' | 'fair' | 'poor' | 'damaged' | 'needs_repair';
export type RepairPriority = 'low' | 'normal' | 'high' | 'urgent';
export type RepairStatus = 'pending' | 'approved' | 'in_progress' | 'completed' | 'cancelled';
export type LoanStatus = 'active' | 'returned' | 'overdue' | 'cancelled';
export type ValuationType = 'purchase' | 'insurance' | 'sale' | 'appraisal' | 'depreciation';
export type RepairType = 'preventive' | 'corrective' | 'emergency' | 'overhaul' | 'cleaning';
export type LoanType = 'standard' | 'trial' | 'long_term' | 'performance';
export type DocumentType = 'manual' | 'warranty' | 'certificate' | 'invoice' | 'photo' | 'contract' | 'appraisal' | 'other';
export type InsurancePolicyType = 'all_risk' | 'theft' | 'damage' | 'comprehensive';
export type InsuranceCoverageType = 'individual' | 'collective' | 'blanket';
export type IncidentType = 'theft' | 'damage' | 'loss' | 'fire' | 'water' | 'vandalism' | 'accident' | 'other';
export type ClaimStatus = 'submitted' | 'under_review' | 'approved' | 'rejected' | 'paid' | 'closed';

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

export interface InstrumentDocumentSummary {
  id: string;
  documentType: DocumentType;
  title: string;
  fileUrl: string;
  fileName: string;
  createdAt: string;
}

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

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages?: number;
}
