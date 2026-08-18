import crypto from 'crypto';
import config from '../config';
import logger from '../utils/logger';

const SPOND_API_BASE = 'https://api.spond.com/core/v1';

// ========================
// Credential encryption
// ========================

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  // Derive a 32-byte key from the JWT secret
  return crypto.scryptSync(config.jwtSecret, 'spond-encryption-salt', 32);
}

export function encryptPassword(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Fout die zegt: het opgeslagen wachtwoord is niet meer te lezen.
 *
 * De sleutel wordt afgeleid van JWT_SECRET. Verandert die - en in render.yaml
 * staat hij op generateValue, dus bij het opnieuw aanmaken van de service
 * gebeurt dat - dan valt AES-GCM om op de authenticatietag. Dat is iets heel
 * anders dan een wachtwoord dat Spond weigert, en de gebruiker hoort dat
 * verschil te zien: hier moet je de koppeling opnieuw instellen, daar je
 * wachtwoord controleren.
 */
export class SpondCredentialsUnreadableError extends Error {
  constructor() {
    super('Het opgeslagen Spond-wachtwoord kan niet worden ontsleuteld.');
    this.name = 'SpondCredentialsUnreadableError';
  }
}

export function decryptPassword(encrypted: string): string {
  const key = getEncryptionKey();
  const parts = encrypted.split(':');
  if (parts.length !== 3) throw new SpondCredentialsUnreadableError();

  try {
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedText = parts[2];
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    throw new SpondCredentialsUnreadableError();
  }
}

// ========================
// Spond API client
// ========================

export interface SpondGroup {
  id: string;
  name: string;
  memberCount: number;
}

export interface SpondEvent {
  id: string;
  heading: string;
  startTimestamp: string;
  endTimestamp: string;
  cancelled: boolean;
  responses: SpondResponse[];
}

export interface SpondResponse {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  status: 'accepted' | 'declined' | 'unanswered' | 'waiting';
}

export class SpondClient {
  private token: string | null = null;

  constructor(
    private username: string,
    private password: string,
  ) {}

  async login(): Promise<void> {
    const res = await fetch(`${SPOND_API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.username, password: this.password }),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error('Spond login failed', { status: res.status, body: text });
      throw new Error(`Spond login failed: ${res.status}`);
    }

    const data = (await res.json()) as { loginToken?: string; token?: string };
    this.token = data.loginToken || data.token || null;
    if (!this.token) {
      throw new Error('No token received from Spond');
    }
  }

  private async request(path: string, params?: Record<string, string>): Promise<any> {
    if (!this.token) {
      await this.login();
    }

    const url = new URL(`${SPOND_API_BASE}${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.token}` },
    });

    if (res.status === 401) {
      // Token expired, retry once
      await this.login();
      const retryRes = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (!retryRes.ok) throw new Error(`Spond API error: ${retryRes.status}`);
      return retryRes.json();
    }

    if (!res.ok) {
      throw new Error(`Spond API error: ${res.status}`);
    }

    return res.json();
  }

  async getGroups(): Promise<SpondGroup[]> {
    const groups = await this.request('/groups');
    return (groups || []).map((g: any) => ({
      id: g.id,
      name: g.name,
      memberCount: g.members?.length || 0,
    }));
  }

  async getEvents(groupId: string, minDate: string, maxDate: string): Promise<SpondEvent[]> {
    const data = await this.request('/sponds', {
      type: 'event',
      groupId,
      minDate,
      maxDate,
      order: 'asc',
      max: '100',
    });

    return (data || []).map((e: any) => ({
      id: e.id,
      heading: e.heading || '',
      startTimestamp: e.startTimestamp,
      endTimestamp: e.endTimestamp,
      cancelled: e.cancelled || false,
      responses: (e.responses?.acceptedIds || [])
        .map((id: string) => {
          const member = findMember(e, id);
          return {
            id,
            firstName: member?.firstName || '',
            lastName: member?.lastName || '',
            email: member?.email,
            status: 'accepted' as const,
          };
        })
        .concat(
          (e.responses?.declinedIds || []).map((id: string) => {
            const member = findMember(e, id);
            return {
              id,
              firstName: member?.firstName || '',
              lastName: member?.lastName || '',
              email: member?.email,
              status: 'declined' as const,
            };
          }),
          (e.responses?.unansweredIds || []).map((id: string) => {
            const member = findMember(e, id);
            return {
              id,
              firstName: member?.firstName || '',
              lastName: member?.lastName || '',
              email: member?.email,
              status: 'unanswered' as const,
            };
          }),
          (e.responses?.waitinglistIds || []).map((id: string) => {
            const member = findMember(e, id);
            return {
              id,
              firstName: member?.firstName || '',
              lastName: member?.lastName || '',
              email: member?.email,
              status: 'waiting' as const,
            };
          }),
        ),
    }));
  }

  /**
   * Change a member's response for an event (accept or decline)
   * @param eventId - The Spond event ID
   * @param memberId - The Spond member ID
   * @param accepted - true to accept, false to decline
   */
  async changeResponse(eventId: string, memberId: string, accepted: boolean): Promise<void> {
    if (!this.token) {
      await this.login();
    }

    const url = `${SPOND_API_BASE}/sponds/${eventId}/responses/${memberId}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ accepted }),
    });

    if (res.status === 401) {
      // Token expired, retry once
      await this.login();
      const retryRes = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accepted }),
      });
      if (!retryRes.ok) {
        const text = await retryRes.text();
        logger.error('Spond changeResponse failed', { status: retryRes.status, body: text });
        throw new Error(`Spond API error: ${retryRes.status}`);
      }
      return;
    }

    if (!res.ok) {
      const text = await res.text();
      logger.error('Spond changeResponse failed', { status: res.status, body: text });
      throw new Error(`Spond API error: ${res.status}`);
    }
  }
}

function findMember(event: any, memberId: string): { firstName: string; lastName: string; email?: string } | undefined {
  // Spond events may have recipients with member details
  const recipients = event.recipients?.group?.members || event.recipients || [];
  const member = recipients.find((m: any) => m.id === memberId);
  if (member) {
    return {
      firstName: member.firstName || '',
      lastName: member.lastName || '',
      email: member.email || member.profile?.email || undefined,
    };
  }
  return undefined;
}
