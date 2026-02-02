export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'music_committee' | 'member';
  associationId: string | null;
  associationName?: string;
  mfaEnabled?: boolean;
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

export interface AuthResponse {
  token: string;
  user: User;
}
