export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'music_committee' | 'member';
  associationId: string | null;
  associationName?: string;
  instruments?: Instrument[];
  orchestras?: Orchestra[];
}

export interface Instrument {
  id: string;
  name: string;
  tuning: string | null;
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
  pieceCount?: number;
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
  isShared?: boolean;
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
