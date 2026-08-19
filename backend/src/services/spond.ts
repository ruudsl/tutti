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
/**
 * Fout die zegt: het inloggen bij Spond zelf is misgegaan.
 *
 * De aanroepende code moet kunnen zien wat er gebeurde. Weigerde Spond de
 * gegevens (401 of 403), dan klopt het wachtwoord niet. Kwam er een 5xx, dan
 * ligt het aan Spond. Kwam er helemaal geen antwoord, dan konden we er niet
 * bij. Dat zijn drie verschillende problemen met drie verschillende
 * oplossingen, en de gebruiker hoort niet bij alle drie te lezen dat hij zijn
 * wachtwoord moet controleren.
 */
export class SpondLoginError extends Error {
  constructor(
    message: string,
    readonly reason: 'rejected' | 'unreachable' | 'unexpected',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'SpondLoginError';
  }
}

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

  /**
   * Aanmeldpaden, in volgorde van proberen.
   *
   * Uit de productielogs: Spond antwoordde op /login met een 404 en
   * errorCode 404. Het pad bestaat dus niet meer; de gegevens van de gebruiker
   * werden nooit gecontroleerd. Spond zet zijn aanmelding tegenwoordig onder
   * auth2. Het oude pad blijft als tweede staan, zodat een omgeving die nog op
   * de vorige versie draait blijft werken - en zodat de logs laten zien welk
   * pad het wél deed.
   */
  private static readonly LOGIN_PATHS = ['/auth2/login', '/login'];

  private async postLogin(path: string): Promise<Response> {
    try {
      return await fetch(`${SPOND_API_BASE}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Spond weigert aanvragen zonder herkenbare afzender. Node stuurt
          // van zichzelf niets bruikbaars mee, wat een 403 oplevert die niets
          // met het wachtwoord te maken heeft.
          'User-Agent': 'Tutti/1.0 (+https://github.com/ruudsl/tutti)',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email: this.username, password: this.password }),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      logger.error('Spond niet bereikbaar', { path, detail });
      throw new SpondLoginError(`Spond was niet bereikbaar: ${detail}`, 'unreachable');
    }
  }

  async login(): Promise<void> {
    let res: Response | null = null;
    let gebruiktPad = '';

    for (const path of SpondClient.LOGIN_PATHS) {
      const poging = await this.postLogin(path);
      // Alleen bij een 404 heeft het zin het volgende pad te proberen. Een 401
      // betekent dat we het juiste adres te pakken hebben en dat de gegevens
      // worden afgewezen; dan moeten we niet doorzoeken.
      if (poging.status === 404) {
        logger.warn('Spond kent dit aanmeldpad niet', { path });
        continue;
      }
      res = poging;
      gebruiktPad = path;
      break;
    }

    if (!res) {
      throw new SpondLoginError(
        `Spond kent geen van de bekende aanmeldadressen (${SpondClient.LOGIN_PATHS.join(', ')}). ` +
          'Waarschijnlijk is hun API gewijzigd.',
        'unexpected',
        404,
      );
    }

    if (!res.ok) {
      const text = await res.text();
      logger.error('Spond weigerde het inloggen', {
        path: gebruiktPad,
        status: res.status,
        body: text.slice(0, 500),
      });

      if (res.status === 401 || res.status === 403) {
        throw new SpondLoginError('Spond wees de inloggegevens af.', 'rejected', res.status);
      }
      throw new SpondLoginError(`Spond antwoordde met status ${res.status}.`, 'unexpected', res.status);
    }

    const data = (await res.json()) as { loginToken?: string; token?: string };
    this.token = data.loginToken || data.token || null;
    if (!this.token) {
      logger.error('Spond gaf geen token terug', { path: gebruiktPad, keys: Object.keys(data) });
      throw new SpondLoginError(
        'Spond gaf geen aanmeldtoken terug. Mogelijk is de koppeling met tweestapsverificatie beveiligd.',
        'unexpected',
      );
    }

    logger.info('Aangemeld bij Spond', { path: gebruiktPad });
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
