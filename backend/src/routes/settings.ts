import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import net from 'net';
import { domainToASCII } from 'url';
import nodemailer from 'nodemailer';
import db from '../database/connection';
import config from '../config';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { ipWhitelistMiddleware } from '../middleware/ipWhitelist';
import logger from '../utils/logger';
import { readFileHeader } from '../utils/fileValidation';
import { bestandInMap } from '../utils/bestandInMap';
import { controleerUitgaandAdres, OnveiligAdresFout } from '../utils/uitgaandAdres';
import { logAuditEvent } from './audit-logs';
import { ontsleutelGeheim, versleutelGeheim } from '../utils/encryption';

const router = Router();

// Logo upload configuration - use absolute path for res.sendFile compatibility
const logoDir = path.resolve(config.uploadDir, 'logos');
if (!fs.existsSync(logoDir)) {
  fs.mkdirSync(logoDir, { recursive: true });
}

/**
 * Wat een logo mag zijn, en hoe het terug naar de browser gaat.
 *
 * Het soort bestand volgt uit de eerste bytes, niet uit de extensie of het
 * mimetype dat de browser meestuurt: die kiest de uploader zelf. Hier nam de
 * opslag eerst de extensie van de client over, en serveerde sendFile het
 * bestand met het Content-Type dat bij die extensie hoort. Een "logo" met de
 * naam logo.html kwam zo als text/html terug op het domein van Tutti, zonder
 * inloggen - een script erin draaide met de sessie van wie de link opende.
 *
 * SVG kan zelf script bevatten. Als <img> draait dat nooit; wie het bestand
 * rechtstreeks opent krijgt het als bijlage, met een CSP die script en elke
 * verbinding naar buiten verbiedt.
 */
interface LogoSoort {
  extensie: string;
  contentType: string;
}

const LOGO_SOORTEN = {
  png: { extensie: '.png', contentType: 'image/png' },
  jpeg: { extensie: '.jpg', contentType: 'image/jpeg' },
  gif: { extensie: '.gif', contentType: 'image/gif' },
  webp: { extensie: '.webp', contentType: 'image/webp' },
  svg: { extensie: '.svg', contentType: 'image/svg+xml' },
} satisfies Record<string, LogoSoort>;

/** Genoeg bytes om ook een SVG met een XML-declaratie en commentaar te herkennen. */
const LOGO_KOP_LENGTE = 4096;

/**
 * Herken een logo aan de inhoud. Geeft `null` voor alles wat geen PNG, JPEG,
 * GIF, WebP of SVG is - ook voor HTML met een `<svg>` erin.
 */
function herkenLogo(kop: Buffer): LogoSoort | null {
  if (kop.length >= 8 && kop.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return LOGO_SOORTEN.png;
  }
  if (kop.length >= 3 && kop[0] === 0xff && kop[1] === 0xd8 && kop[2] === 0xff) {
    return LOGO_SOORTEN.jpeg;
  }
  const gif = kop.subarray(0, 6).toString('latin1');
  if (gif === 'GIF87a' || gif === 'GIF89a') {
    return LOGO_SOORTEN.gif;
  }
  if (
    kop.length >= 12 &&
    kop.subarray(0, 4).toString('latin1') === 'RIFF' &&
    kop.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return LOGO_SOORTEN.webp;
  }

  // SVG is tekst. Het eerste element na een eventuele BOM, XML-declaratie,
  // commentaar en doctype moet <svg zijn; een HTML-pagina die ergens een
  // <svg> bevat valt daarmee af.
  const tekst = kop
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .replace(/^\s*<\?xml[^>]*\?>/i, '')
    .replace(/^(\s*<!--[\s\S]*?-->)*/, '')
    .replace(/^\s*<!DOCTYPE\s+svg[^>]*>/i, '')
    .replace(/^(\s*<!--[\s\S]*?-->)*/, '');
  if (/^\s*<svg[\s>]/i.test(tekst)) {
    return LOGO_SOORTEN.svg;
  }

  return null;
}

// Multer schrijft onder een voorlopige naam van de server, zonder bruikbare
// extensie; de extensie van de client komt nergens aan te pas. Na de controle
// op de inhoud krijgt het bestand de extensie die daarbij hoort, of het gaat
// weg. Zo doet de profielfoto het ook (routes/users.ts).
const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, logoDir),
    filename: (_req, _file, cb) => cb(null, `logo-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.upload`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
});

const ontvangLogo = (req: AuthRequest, res: Response, next: NextFunction) => {
  logoUpload.single('logo')(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return next(new ApiError(400, 'Bestand is te groot. Maximaal 2MB.'));
    }
    next(new ApiError(400, 'Upload mislukt.'));
  });
};

/**
 * GET /settings - Get association settings (any authenticated user)
 */
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user!.associationId) {
      throw new ApiError(404, 'Gebruiker heeft geen vereniging.');
    }

    const association = db
      .prepare(
        `
        SELECT id, name, display_name, logo_path, theme_json
        FROM associations
        WHERE id = ?
    `,
      )
      .get(req.user!.associationId) as any;

    if (!association) {
      throw new ApiError(404, 'Vereniging niet gevonden.');
    }

    res.json({
      name: association.name,
      displayName: association.display_name || association.name,
      logoPath: association.logo_path || null,
      logoUrl: association.logo_path ? `/api/settings/logo/${path.basename(association.logo_path)}` : null,
      theme: association.theme_json ? JSON.parse(association.theme_json) : null,
    });
  }),
);

/**
 * PUT /settings - Update association settings (admin only)
 */
router.put(
  '/',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { displayName } = req.body;

    if (displayName !== undefined && typeof displayName !== 'string') {
      throw new ApiError(400, 'displayName moet een tekst zijn.');
    }

    if (displayName !== undefined && displayName.trim().length > 100) {
      throw new ApiError(400, 'displayName mag maximaal 100 tekens bevatten.');
    }

    // Alleen schrijven wat het verzoek noemt. Stond hier eerder onvoorwaardelijk,
    // waardoor een PUT zonder displayName - een verzoek dat alleen een ander veld
    // meestuurt, of een leeg verzoek - de weergavenaam van de vereniging wiste.
    // Bewust wissen kan nog steeds: een lege tekst of null valt na trim() op null.
    if (displayName !== undefined) {
      db.prepare('UPDATE associations SET display_name = ? WHERE id = ?').run(
        displayName?.trim() || null,
        req.user!.associationId,
      );
    }

    logger.info(`Association settings updated`, { associationId: req.user!.associationId, updatedBy: req.user!.id });

    // Log audit event
    logAuditEvent(
      req.user!.id,
      'update',
      'settings',
      req.user!.associationId || '',
      'Instellingen',
      { displayName: displayName?.trim() },
      req.ip,
      req.get('user-agent'),
    );

    res.json({ message: 'Instellingen succesvol bijgewerkt.' });
  }),
);

/**
 * POST /settings/logo - Upload association logo (admin only)
 */
router.post(
  '/logo',
  authenticateToken,
  requireRole('admin'),
  ontvangLogo,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      throw new ApiError(400, 'Geen bestand geüpload.');
    }

    const voorlopig = bestandInMap(logoDir, req.file.path);
    const soort = herkenLogo(await readFileHeader(voorlopig, LOGO_KOP_LENGTE).catch(() => Buffer.alloc(0)));
    if (!soort) {
      await fs.promises.unlink(voorlopig).catch(() => {});
      throw new ApiError(400, 'Alleen PNG, JPG, GIF, WebP of SVG bestanden zijn toegestaan.');
    }

    // De naam komt helemaal van de server: de voorlopige naam van multer met
    // de extensie die bij de herkende inhoud hoort.
    const logoPath = bestandInMap(logoDir, `${path.basename(voorlopig, '.upload')}${soort.extensie}`);
    await fs.promises.rename(voorlopig, logoPath);

    try {
      // Remove old logo if exists
      const association = db
        .prepare('SELECT logo_path FROM associations WHERE id = ?')
        .get(req.user!.associationId) as any;
      if (association?.logo_path) {
        const oldPath = path.resolve(association.logo_path);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      // Save new logo path
      db.prepare('UPDATE associations SET logo_path = ? WHERE id = ?').run(logoPath, req.user!.associationId);
    } catch (error) {
      // Clean up uploaded file on error
      await fs.promises.unlink(logoPath).catch(() => {});
      throw error;
    }

    logger.info(`Logo uploaded for association`, {
      associationId: req.user!.associationId,
      uploadedBy: req.user!.id,
    });

    // Log audit event
    logAuditEvent(
      req.user!.id,
      'upload',
      'settings',
      req.user!.associationId || '',
      'Logo',
      { filename: path.basename(logoPath) },
      req.ip,
      req.get('user-agent'),
    );

    res.json({
      message: 'Logo succesvol geüpload.',
      logoUrl: `/api/settings/logo/${path.basename(logoPath)}`,
    });
  }),
);

/**
 * DELETE /settings/logo - Remove association logo (admin only)
 */
router.delete(
  '/logo',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const association = db
      .prepare('SELECT logo_path FROM associations WHERE id = ?')
      .get(req.user!.associationId) as any;

    if (association?.logo_path) {
      const filePath = path.resolve(association.logo_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    db.prepare('UPDATE associations SET logo_path = NULL WHERE id = ?').run(req.user!.associationId);

    logger.info(`Logo removed for association`, { associationId: req.user!.associationId, removedBy: req.user!.id });

    // Log audit event
    logAuditEvent(
      req.user!.id,
      'delete',
      'settings',
      req.user!.associationId || '',
      'Logo',
      undefined,
      req.ip,
      req.get('user-agent'),
    );

    res.json({ message: 'Logo succesvol verwijderd.' });
  }),
);

// Allowed theme keys for validation
const ALLOWED_THEME_KEYS = [
  'primaryColor',
  'primaryDarkColor',
  'secondaryColor',
  'successColor',
  'dangerColor',
  'warningColor',
  'backgroundColor',
  'surfaceColor',
  'textColor',
  'textLightColor',
  'borderColor',
  'fontFamily',
  'fontSizeBase',
  'borderRadius',
];

const FONT_FAMILIES: Record<string, string> = {
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif",
  inter: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  roboto: "'Roboto', -apple-system, BlinkMacSystemFont, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  mono: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
};

/**
 * GET /settings/theme - Get theme (public, needed before auth for login page styling)
 */
router.get(
  '/theme',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // Dezelfde regel als bij /settings/branding hieronder: met meer dan een
    // vereniging is er zonder slug niet te zeggen wiens thema het moet zijn,
    // en dan is het thema van de eerst aangemaakte vereniging het verkeerde
    // antwoord. Liever geen kleuren dan die van een ander.
    const slug = typeof req.query.slug === 'string' ? req.query.slug : undefined;
    const association = (
      slug
        ? (db.prepare('SELECT theme_json FROM associations WHERE slug = ? AND COALESCE(is_active, 1) = 1').get(slug) as
            { theme_json: string | null } | undefined)
        : enigeVerenigingThema()
    ) as { theme_json: string | null } | undefined;

    res.json({
      theme: association?.theme_json ? JSON.parse(association.theme_json) : null,
      fontFamilies: FONT_FAMILIES,
    });
  }),
);

interface BrandingRij {
  name: string;
  display_name: string | null;
  logo_path: string | null;
}

/**
 * De vereniging als er precies een is, anders niets.
 *
 * Het aantal wordt geteld en niet met LIMIT 1 opgehaald: bij twee verenigingen
 * hoort het antwoord "geen" te zijn, niet "de eerste".
 */
/** Het thema van de enige vereniging, of undefined als er meer zijn. */
function enigeVerenigingThema(): { theme_json: string | null } | undefined {
  const { aantal } = db.prepare('SELECT COUNT(*) AS aantal FROM associations').get() as { aantal: number };
  if (aantal !== 1) return undefined;
  return db.prepare('SELECT theme_json FROM associations').get() as { theme_json: string | null } | undefined;
}

function enigeVereniging(): BrandingRij | undefined {
  const { aantal } = db.prepare('SELECT COUNT(*) AS aantal FROM associations').get() as { aantal: number };
  if (aantal !== 1) return undefined;

  return db.prepare('SELECT name, display_name, logo_path FROM associations').get() as BrandingRij | undefined;
}

/**
 * GET /settings/branding - naam en logo voor het inlogscherm, zonder inloggen.
 *
 * Hier stond `SELECT name, display_name, logo_path FROM associations LIMIT 1`,
 * zonder ORDER BY en zonder filter. Op een installatie met een vereniging klopte dat toevallig; met meer
 * verenigingen kreeg iedereen de eerst aangemaakte te zien, wie hij ook was.
 *
 * Nu bepaalt de slug in de URL het: /login/harmonie-sint-cecilia vraagt
 * ?slug=harmonie-sint-cecilia op. Zonder slug hangt het van de installatie af.
 * Staat er precies een vereniging, dan is er niets te kiezen en is haar naam de
 * juiste; staan er meer, dan is geen enkele vereniging de juiste en tonen we de
 * neutrale huisstijl. Liever geen naam dan de verkeerde.
 *
 * Een slug die niet bestaat valt terug op datzelfde neutrale scherm: een typefout
 * in een gedeelde link hoort geen kapotte pagina op te leveren.
 */
router.get(
  '/branding',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const slug = typeof req.query.slug === 'string' ? req.query.slug.trim() : '';

    const association = slug
      ? (db
          .prepare(
            `SELECT name, display_name, logo_path FROM associations WHERE slug = ? AND COALESCE(is_active, 1) = 1`,
          )
          .get(slug) as BrandingRij | undefined)
      : enigeVereniging();

    res.json({
      displayName: association?.display_name || association?.name || 'Tutti',
      logoUrl: association?.logo_path ? `/api/settings/logo/${path.basename(association.logo_path)}` : null,
    });
  }),
);

/**
 * PUT /settings/theme - Update theme (admin only)
 */
router.put(
  '/theme',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { theme } = req.body;

    if (theme !== null && typeof theme !== 'object') {
      throw new ApiError(400, 'Ongeldig thema formaat.');
    }

    if (theme !== null) {
      // Validate that only allowed keys are present
      const keys = Object.keys(theme);
      const invalidKeys = keys.filter((k) => !ALLOWED_THEME_KEYS.includes(k));
      if (invalidKeys.length > 0) {
        throw new ApiError(400, `Ongeldige thema-instellingen: ${invalidKeys.join(', ')}`);
      }

      // Validate color values (must be valid hex colors)
      const colorKeys = keys.filter((k) => k.endsWith('Color'));
      for (const key of colorKeys) {
        if (theme[key] && !/^#[0-9a-fA-F]{6}$/.test(theme[key])) {
          throw new ApiError(400, `Ongeldige kleurwaarde voor ${key}. Gebruik hex formaat (bijv. #2563eb).`);
        }
      }

      // Validate fontFamily
      if (theme.fontFamily && !Object.keys(FONT_FAMILIES).includes(theme.fontFamily)) {
        throw new ApiError(400, 'Ongeldig lettertype.');
      }

      // Validate fontSizeBase (12-24px)
      if (theme.fontSizeBase !== undefined) {
        const size = Number(theme.fontSizeBase);
        if (isNaN(size) || size < 12 || size > 24) {
          throw new ApiError(400, 'Lettergrootte moet tussen 12 en 24 zijn.');
        }
      }

      // Validate borderRadius (0-2rem)
      if (theme.borderRadius !== undefined) {
        const radius = Number(theme.borderRadius);
        if (isNaN(radius) || radius < 0 || radius > 2) {
          throw new ApiError(400, 'Hoekafronding moet tussen 0 en 2 zijn.');
        }
      }
    }

    const themeJson = theme ? JSON.stringify(theme) : null;
    db.prepare('UPDATE associations SET theme_json = ? WHERE id = ?').run(themeJson, req.user!.associationId);

    logger.info(`Theme updated`, { associationId: req.user!.associationId, updatedBy: req.user!.id });

    // Log audit event
    logAuditEvent(
      req.user!.id,
      'update',
      'settings',
      req.user!.associationId || '',
      'Thema',
      theme ? { keys: Object.keys(theme) } : { reset: true },
      req.ip,
      req.get('user-agent'),
    );

    res.json({ message: 'Thema succesvol bijgewerkt.' });
  }),
);

/**
 * GET /settings/logo/:filename - Serve logo file (public, no auth needed for img tags)
 */
router.get(
  '/logo/:filename',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { filename } = req.params;

    // Prevent directory traversal
    const safeFilename = path.basename(filename);
    const filePath = path.join(logoDir, safeFilename);

    if (!fs.existsSync(filePath)) {
      throw new ApiError(404, 'Logo niet gevonden.');
    }

    // Het Content-Type volgt uit de inhoud, niet uit de extensie: een logo van
    // vóór deze controle kan nog logo-….html heten. Wat geen afbeelding is,
    // komt hier nooit terug - ook niet als tekst of html.
    const soort = herkenLogo(await readFileHeader(filePath, LOGO_KOP_LENGTE));
    if (!soort) {
      logger.warn('Logo met onbekende inhoud niet geserveerd', { filename: safeFilename });
      throw new ApiError(404, 'Logo niet gevonden.');
    }

    res.setHeader('Content-Type', soort.contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (soort === LOGO_SOORTEN.svg) {
      // Als <img> blijft een SVG gewoon zichtbaar; rechtstreeks geopend wordt
      // hij gedownload, en mocht een browser hem toch tonen, dan zonder script.
      res.setHeader('Content-Disposition', 'attachment; filename="logo.svg"');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");
    }

    // Cache logo for 1 hour
    res.set('Cache-Control', 'public, max-age=3600');
    res.sendFile(filePath);
  }),
);

/**
 * GET /settings/smtp - Get SMTP configuration (admin only)
 */
router.get(
  '/smtp',
  authenticateToken,
  requireRole('admin'),
  ipWhitelistMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const association = db
      .prepare(
        `
        SELECT smtp_host, smtp_port, smtp_secure, smtp_user, smtp_from, smtp_enabled
        FROM associations WHERE id = ?
    `,
      )
      .get(req.user!.associationId) as any;

    if (!association) {
      throw new ApiError(404, 'Vereniging niet gevonden.');
    }

    res.json({
      host: association.smtp_host || '',
      port: association.smtp_port || 587,
      secure: !!association.smtp_secure,
      user: association.smtp_user || '',
      from: association.smtp_from || '',
      enabled: !!association.smtp_enabled,
      configured: !!association.smtp_host,
    });
  }),
);

/**
 * PUT /settings/smtp - Save SMTP configuration (admin only)
 */
router.put(
  '/smtp',
  authenticateToken,
  requireRole('admin'),
  ipWhitelistMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { host, port, secure, user, password, from, enabled } = req.body;

    if (!host || typeof host !== 'string' || !host.trim()) {
      throw new ApiError(400, 'SMTP host is verplicht.');
    }

    const portNum = Number(port) || 587;
    if (portNum < 1 || portNum > 65535) {
      throw new ApiError(400, 'Poort moet tussen 1 en 65535 liggen.');
    }

    // Check if there's an existing password stored
    const existing = db.prepare('SELECT smtp_pass FROM associations WHERE id = ?').get(req.user!.associationId) as any;

    // Alleen een nieuw wachtwoord vervangt het oude. Het staat versleuteld in
    // de database; het bestaande gaat ongewijzigd terug.
    const smtpPass = password?.trim() ? versleutelGeheim(password.trim()) : existing?.smtp_pass || null;

    db.prepare(
      `
        UPDATE associations
        SET smtp_host = ?, smtp_port = ?, smtp_secure = ?, smtp_user = ?, smtp_pass = ?, smtp_from = ?, smtp_enabled = ?
        WHERE id = ?
    `,
    ).run(
      host.trim(),
      portNum,
      secure ? 1 : 0,
      user?.trim() || null,
      smtpPass,
      from?.trim() || null,
      enabled ? 1 : 0,
      req.user!.associationId,
    );

    logger.info('SMTP config updated', { associationId: req.user!.associationId, updatedBy: req.user!.id });

    // Log audit event
    logAuditEvent(
      req.user!.id,
      'update',
      'settings',
      req.user!.associationId || '',
      'SMTP configuratie',
      { host: host.trim(), port: portNum, enabled: !!enabled },
      req.ip,
      req.get('user-agent'),
    );

    res.json({ message: 'SMTP-instellingen opgeslagen.' });
  }),
);

/**
 * DELETE /settings/smtp - Remove SMTP configuration (admin only)
 */
router.delete(
  '/smtp',
  authenticateToken,
  requireRole('admin'),
  ipWhitelistMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    db.prepare(
      `
        UPDATE associations
        SET smtp_host = NULL, smtp_port = 587, smtp_secure = 0, smtp_user = NULL, smtp_pass = NULL, smtp_from = NULL, smtp_enabled = 0
        WHERE id = ?
    `,
    ).run(req.user!.associationId);

    logger.info('SMTP config removed', { associationId: req.user!.associationId, removedBy: req.user!.id });

    // Log audit event
    logAuditEvent(
      req.user!.id,
      'delete',
      'settings',
      req.user!.associationId || '',
      'SMTP configuratie',
      undefined,
      req.ip,
      req.get('user-agent'),
    );

    res.json({ message: 'SMTP-instellingen verwijderd.' });
  }),
);

/**
 * Mag de server met deze SMTP-host verbinden?
 *
 * De host komt van een beheerder, en dus niet vanzelf van buiten: zonder
 * controle is de testknop een manier om vanaf de server `127.0.0.1:6379` of
 * een adres in het interne netwerk te benaderen. controleerUitgaandAdres
 * kent alleen URL's; de host gaat er daarom als https-adres in. De poort doet
 * voor die controle niet mee: het gaat om waar de naam heen wijst.
 *
 * @returns de host zoals gecontroleerd, om precies die aan te roepen.
 */
async function controleerSmtpHost(ruw: string): Promise<string> {
  const host = ruw.trim().toLowerCase();
  const alsUrlHost = net.isIPv6(host) ? `[${host}]` : host;

  let url: URL;
  try {
    url = await controleerUitgaandAdres(`https://${alsUrlHost}/`);
  } catch (error) {
    if (error instanceof OnveiligAdresFout) {
      throw new ApiError(400, `SMTP-host geweigerd: ${error.message}`);
    }
    throw error;
  }

  // Een host met `/`, `@` of `:` erin leest als URL anders dan als hostnaam:
  // dan is iets anders gecontroleerd dan wat nodemailer zou aanroepen.
  // Een naam met bijzondere letters staat in de URL in zijn ASCII-vorm.
  const gecontroleerd = url.hostname.replace(/^\[|\]$/g, '');
  const verwacht = net.isIP(host) ? host : domainToASCII(host);
  if (!verwacht || gecontroleerd !== verwacht) {
    throw new ApiError(400, 'SMTP-host geweigerd: dit is geen geldige hostnaam.');
  }
  return gecontroleerd;
}

/**
 * POST /settings/smtp/test - Send a test email (admin only)
 */
router.post(
  '/smtp/test',
  authenticateToken,
  requireRole('admin'),
  ipWhitelistMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const association = db
      .prepare(
        `
        SELECT smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from
        FROM associations WHERE id = ?
    `,
      )
      .get(req.user!.associationId) as any;

    if (!association?.smtp_host) {
      throw new ApiError(400, 'SMTP is niet geconfigureerd. Sla eerst de instellingen op.');
    }

    const host = await controleerSmtpHost(association.smtp_host);

    const testTransporter = nodemailer.createTransport({
      host,
      port: association.smtp_port || 587,
      secure: !!association.smtp_secure,
      auth: association.smtp_user
        ? {
            user: association.smtp_user,
            pass: ontsleutelGeheim(association.smtp_pass, 'SMTP-wachtwoord') || '',
          }
        : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    try {
      await testTransporter.verify();

      // Send test email to the admin's own email
      const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user!.id) as any;
      const fromAddress = association.smtp_from || `"Harmonie App" <${association.smtp_user}>`;

      await testTransporter.sendMail({
        from: fromAddress,
        to: user.email,
        subject: 'Harmonie App - SMTP Test',
        text: 'Dit is een testbericht. Als je dit ontvangt, werkt de SMTP-configuratie correct!',
        html: '<p>Dit is een <strong>testbericht</strong>.</p><p>Als je dit ontvangt, werkt de SMTP-configuratie correct!</p>',
      });

      logger.info('SMTP test email sent', { associationId: req.user!.associationId, to: user.email });

      res.json({ message: `Testmail verzonden naar ${user.email}.` });
    } catch (error: any) {
      // De ruwe melding (`connect ECONNREFUSED 10.0.0.5:25`, de begroeting van
      // de server) gaat alleen naar het logboek: aan de client verklapt hij
      // welke hosts en poorten er achter de server openstaan.
      logger.error('SMTP test failed', {
        error: error?.message,
        code: error?.code,
        associationId: req.user!.associationId,
      });
      if (error?.code === 'EAUTH') {
        throw new ApiError(
          400,
          'SMTP-test mislukt: inloggen bij de mailserver lukte niet. Controleer gebruikersnaam en wachtwoord.',
        );
      }
      throw new ApiError(
        400,
        'SMTP-test mislukt. Controleer host, poort en beveiliging; de precieze fout staat in het logboek van de server.',
      );
    }
  }),
);

// =============================================
// TELEGRAM CONFIGURATION
// =============================================

/**
 * Wat de beheerschermen zien in plaats van een opgeslagen token: alleen dát er
 * een is. Ook een begin van het token gaat niet naar de browser.
 */
const GEHEIM_MASKER = '•'.repeat(20);

/**
 * GET /settings/telegram - Get Telegram bot configuration (admin only)
 */
router.get(
  '/telegram',
  authenticateToken,
  requireRole('admin'),
  ipWhitelistMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const association = db
      .prepare(
        `
        SELECT telegram_bot_token, telegram_enabled
        FROM associations WHERE id = ?
    `,
      )
      .get(req.user!.associationId) as { telegram_bot_token: string | null; telegram_enabled: number } | undefined;

    if (!association) {
      throw new ApiError(404, 'Vereniging niet gevonden.');
    }

    // Alleen of er een token is, geen enkel teken ervan.
    const ingesteld = !!association.telegram_bot_token;
    res.json({
      tokenPreview: ingesteld ? GEHEIM_MASKER : '',
      configured: ingesteld,
      enabled: !!association.telegram_enabled,
    });
  }),
);

/**
 * PUT /settings/telegram - Save Telegram bot configuration (admin only)
 */
router.put(
  '/telegram',
  authenticateToken,
  requireRole('admin'),
  ipWhitelistMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { botToken, enabled } = req.body as { botToken?: string; enabled?: boolean };

    // Preserve existing token if not provided
    const existing = db
      .prepare('SELECT telegram_bot_token FROM associations WHERE id = ?')
      .get(req.user!.associationId) as { telegram_bot_token: string | null } | undefined;
    const finalToken =
      typeof botToken === 'string' && botToken.trim()
        ? versleutelGeheim(botToken.trim())
        : existing?.telegram_bot_token || null;

    if (enabled && !finalToken) {
      throw new ApiError(400, 'Een bot token is vereist om Telegram in te schakelen.');
    }

    db.prepare(
      `
        UPDATE associations
        SET telegram_bot_token = ?, telegram_enabled = ?
        WHERE id = ?
    `,
    ).run(finalToken, enabled ? 1 : 0, req.user!.associationId);

    logger.info('Telegram config updated', { associationId: req.user!.associationId, updatedBy: req.user!.id });
    logAuditEvent(
      req.user!.id,
      'update',
      'settings',
      req.user!.associationId || '',
      'Telegram configuratie',
      { enabled: !!enabled, configured: !!finalToken },
      req.ip,
      req.get('user-agent'),
    );

    res.json({ message: 'Telegram-instellingen opgeslagen.' });
  }),
);

/**
 * DELETE /settings/telegram - Remove Telegram configuration (admin only)
 */
router.delete(
  '/telegram',
  authenticateToken,
  requireRole('admin'),
  ipWhitelistMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    db.prepare(
      `
        UPDATE associations
        SET telegram_bot_token = NULL, telegram_enabled = 0
        WHERE id = ?
    `,
    ).run(req.user!.associationId);

    logger.info('Telegram config removed', { associationId: req.user!.associationId, removedBy: req.user!.id });
    res.json({ message: 'Telegram-instellingen verwijderd.' });
  }),
);

// =============================================
// WHATSAPP CONFIGURATION
// =============================================

/**
 * GET /settings/whatsapp - Get WhatsApp configuration (admin only)
 */
router.get(
  '/whatsapp',
  authenticateToken,
  requireRole('admin'),
  ipWhitelistMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const association = db
      .prepare(
        `
        SELECT whatsapp_provider, whatsapp_enabled,
               whatsapp_phone_number_id, whatsapp_access_token,
               twilio_account_sid, twilio_auth_token, twilio_whatsapp_from
        FROM associations WHERE id = ?
    `,
      )
      .get(req.user!.associationId) as
      | {
          whatsapp_provider: string | null;
          whatsapp_enabled: number;
          whatsapp_phone_number_id: string | null;
          whatsapp_access_token: string | null;
          twilio_account_sid: string | null;
          twilio_auth_token: string | null;
          twilio_whatsapp_from: string | null;
        }
      | undefined;

    if (!association) {
      throw new ApiError(404, 'Vereniging niet gevonden.');
    }

    const provider = (association.whatsapp_provider === 'twilio' ? 'twilio' : 'meta') as 'meta' | 'twilio';
    const metaConfigured = !!(association.whatsapp_phone_number_id && association.whatsapp_access_token);
    const twilioConfigured = !!(
      association.twilio_account_sid &&
      association.twilio_auth_token &&
      association.twilio_whatsapp_from
    );

    res.json({
      provider,
      enabled: !!association.whatsapp_enabled,
      configured: provider === 'meta' ? metaConfigured : twilioConfigured,
      meta: {
        phoneNumberId: association.whatsapp_phone_number_id || '',
        accessTokenPreview: association.whatsapp_access_token ? GEHEIM_MASKER : '',
        configured: metaConfigured,
      },
      twilio: {
        accountSid: association.twilio_account_sid || '',
        authTokenPreview: association.twilio_auth_token ? GEHEIM_MASKER : '',
        whatsappFrom: association.twilio_whatsapp_from || '',
        configured: twilioConfigured,
      },
    });
  }),
);

/**
 * PUT /settings/whatsapp - Save WhatsApp configuration (admin only)
 */
router.put(
  '/whatsapp',
  authenticateToken,
  requireRole('admin'),
  ipWhitelistMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const body = req.body as {
      provider?: 'meta' | 'twilio';
      enabled?: boolean;
      meta?: { phoneNumberId?: string; accessToken?: string };
      twilio?: { accountSid?: string; authToken?: string; whatsappFrom?: string };
    };

    if (body.provider && body.provider !== 'meta' && body.provider !== 'twilio') {
      throw new ApiError(400, 'Provider moet "meta" of "twilio" zijn.');
    }

    // Preserve existing secrets when the client doesn't send them
    const existing = db
      .prepare(
        `
        SELECT whatsapp_access_token, twilio_auth_token
        FROM associations WHERE id = ?
    `,
      )
      .get(req.user!.associationId) as
      { whatsapp_access_token: string | null; twilio_auth_token: string | null } | undefined;

    const phoneNumberId = body.meta?.phoneNumberId?.trim() || null;
    // Nieuwe tokens gaan versleuteld de database in; de bestaande staan er al zo.
    const nieuwAccessToken = body.meta?.accessToken?.trim();
    const accessToken = nieuwAccessToken ? versleutelGeheim(nieuwAccessToken) : existing?.whatsapp_access_token || null;
    const accountSid = body.twilio?.accountSid?.trim() || null;
    const nieuwAuthToken = body.twilio?.authToken?.trim();
    const authToken = nieuwAuthToken ? versleutelGeheim(nieuwAuthToken) : existing?.twilio_auth_token || null;
    const whatsappFrom = body.twilio?.whatsappFrom?.trim() || null;

    const provider = body.provider || 'meta';

    const metaConfigured = !!(phoneNumberId && accessToken);
    const twilioConfigured = !!(accountSid && authToken && whatsappFrom);

    if (body.enabled) {
      if (provider === 'meta' && !metaConfigured) {
        throw new ApiError(400, 'Meta WhatsApp vereist een Phone Number ID en Access Token.');
      }
      if (provider === 'twilio' && !twilioConfigured) {
        throw new ApiError(400, 'Twilio WhatsApp vereist Account SID, Auth Token en From-nummer.');
      }
    }

    db.prepare(
      `
        UPDATE associations
        SET whatsapp_provider = ?,
            whatsapp_enabled = ?,
            whatsapp_phone_number_id = ?,
            whatsapp_access_token = ?,
            twilio_account_sid = ?,
            twilio_auth_token = ?,
            twilio_whatsapp_from = ?
        WHERE id = ?
    `,
    ).run(
      provider,
      body.enabled ? 1 : 0,
      phoneNumberId,
      accessToken,
      accountSid,
      authToken,
      whatsappFrom,
      req.user!.associationId,
    );

    logger.info('WhatsApp config updated', {
      associationId: req.user!.associationId,
      updatedBy: req.user!.id,
      provider,
    });
    logAuditEvent(
      req.user!.id,
      'update',
      'settings',
      req.user!.associationId || '',
      'WhatsApp configuratie',
      { provider, enabled: !!body.enabled },
      req.ip,
      req.get('user-agent'),
    );

    res.json({ message: 'WhatsApp-instellingen opgeslagen.' });
  }),
);

/**
 * DELETE /settings/whatsapp - Remove WhatsApp configuration (admin only)
 */
router.delete(
  '/whatsapp',
  authenticateToken,
  requireRole('admin'),
  ipWhitelistMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    db.prepare(
      `
        UPDATE associations
        SET whatsapp_provider = NULL,
            whatsapp_enabled = 0,
            whatsapp_phone_number_id = NULL,
            whatsapp_access_token = NULL,
            twilio_account_sid = NULL,
            twilio_auth_token = NULL,
            twilio_whatsapp_from = NULL
        WHERE id = ?
    `,
    ).run(req.user!.associationId);

    logger.info('WhatsApp config removed', { associationId: req.user!.associationId, removedBy: req.user!.id });
    res.json({ message: 'WhatsApp-instellingen verwijderd.' });
  }),
);

/**
 * GET /settings/google-drive - Get Google Drive picker configuration (admin only)
 */
router.get(
  '/google-drive',
  authenticateToken,
  requireRole('admin'),
  ipWhitelistMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const association = db
      .prepare(
        `
        SELECT google_drive_client_id, google_drive_api_key, google_drive_enabled
        FROM associations WHERE id = ?
    `,
      )
      .get(req.user!.associationId) as any;

    if (!association) {
      throw new ApiError(404, 'Vereniging niet gevonden.');
    }

    res.json({
      clientId: association.google_drive_client_id || '',
      apiKey: association.google_drive_api_key || '',
      enabled: !!association.google_drive_enabled,
      configured: !!(association.google_drive_client_id && association.google_drive_api_key),
    });
  }),
);

/**
 * PUT /settings/google-drive - Save Google Drive picker configuration (admin only)
 */
router.put(
  '/google-drive',
  authenticateToken,
  requireRole('admin'),
  ipWhitelistMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { clientId, apiKey, enabled } = req.body;

    if (!clientId || typeof clientId !== 'string' || !clientId.trim()) {
      throw new ApiError(400, 'Google Drive Client ID is verplicht.');
    }
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      throw new ApiError(400, 'Google Drive API Key is verplicht.');
    }

    db.prepare(
      `
        UPDATE associations
        SET google_drive_client_id = ?, google_drive_api_key = ?, google_drive_enabled = ?
        WHERE id = ?
    `,
    ).run(clientId.trim(), apiKey.trim(), enabled ? 1 : 0, req.user!.associationId);

    logger.info('Google Drive config updated', { associationId: req.user!.associationId, updatedBy: req.user!.id });

    logAuditEvent(
      req.user!.id,
      'update',
      'settings',
      req.user!.associationId || '',
      'Google Drive configuratie',
      { enabled: !!enabled },
      req.ip,
      req.get('user-agent'),
    );

    res.json({ message: 'Google Drive-instellingen opgeslagen.' });
  }),
);

/**
 * DELETE /settings/google-drive - Remove Google Drive picker configuration (admin only)
 */
router.delete(
  '/google-drive',
  authenticateToken,
  requireRole('admin'),
  ipWhitelistMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    db.prepare(
      `
        UPDATE associations
        SET google_drive_client_id = NULL, google_drive_api_key = NULL, google_drive_enabled = 0
        WHERE id = ?
    `,
    ).run(req.user!.associationId);

    logger.info('Google Drive config removed', { associationId: req.user!.associationId, removedBy: req.user!.id });

    logAuditEvent(
      req.user!.id,
      'delete',
      'settings',
      req.user!.associationId || '',
      'Google Drive configuratie',
      undefined,
      req.ip,
      req.get('user-agent'),
    );

    res.json({ message: 'Google Drive-instellingen verwijderd.' });
  }),
);

export default router;
