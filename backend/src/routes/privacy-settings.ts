import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { cacheMiddleware, cacheInvalidator } from '../middleware/cache';
import { withTransaction } from '../utils/database';
import logger from '../utils/logger';
import { z } from 'zod';

const router = Router();

const CACHE_PATH = '/api/privacy-settings';

const VISIBILITY_LEVELS = ['admin_only', 'committee', 'orchestra', 'section', 'all_members', 'public'] as const;

const STANDARD_FIELDS = ['email', 'profile_photo', 'instruments', 'orchestras'] as const;

const updateUserPrivacySchema = z.object({
  settings: z.array(
    z.object({
      fieldName: z.string().min(1),
      visibility: z.enum(VISIBILITY_LEVELS),
      customFieldId: z.string().uuid().optional(),
    }),
  ),
});

const updateAssociationDefaultsSchema = z.object({
  defaults: z.array(
    z.object({
      fieldName: z.string().min(1),
      defaultVisibility: z.enum(VISIBILITY_LEVELS),
      purposeStatement: z.string().optional(),
      isRequired: z.boolean().optional(),
    }),
  ),
});

const consentSchema = z.object({
  consentVersion: z.string().min(1),
});

// =====================================================
// USER PRIVACY SETTINGS
// =====================================================

router.get(
  '/my-settings',
  authenticateToken,
  cacheMiddleware({ ttlSeconds: 60, varyByUser: true }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const associationId = req.user!.associationId;

    const settings = db
      .prepare(
        `
        SELECT id, field_name, visibility, custom_field_id, updated_at
        FROM user_privacy_settings
        WHERE user_id = ?
        ORDER BY field_name
    `,
      )
      .all(userId) as any[];

    let defaults: any[] = [];
    if (associationId) {
      defaults = db
        .prepare(
          `
            SELECT field_name, default_visibility, purpose_statement, is_required
            FROM association_privacy_defaults
            WHERE association_id = ?
        `,
        )
        .all(associationId) as any[];
    }

    const defaultMap = new Map(defaults.map((d) => [d.field_name, d]));
    const settingsMap = new Map(settings.map((s) => [s.field_name, s]));

    const result: Record<string, any> = {};

    for (const field of STANDARD_FIELDS) {
      const setting = settingsMap.get(field);
      const def = defaultMap.get(field);

      result[field] = {
        fieldName: field,
        visibility: setting?.visibility || def?.default_visibility || 'all_members',
        isDefault: !setting,
        purposeStatement: def?.purpose_statement,
        isRequired: !!def?.is_required,
        updatedAt: setting?.updated_at,
      };
    }

    if (associationId) {
      const customFields = db
        .prepare(
          `
            SELECT id, field_key, field_label
            FROM custom_field_definitions
            WHERE association_id = ? AND entity_type = 'user' AND deleted_at IS NULL
        `,
        )
        .all(associationId) as any[];

      for (const cf of customFields) {
        const setting = settings.find((s) => s.custom_field_id === cf.id);
        const def = defaultMap.get(`custom_${cf.field_key}`);

        result[`custom_${cf.field_key}`] = {
          fieldName: `custom_${cf.field_key}`,
          fieldLabel: cf.field_label,
          customFieldId: cf.id,
          visibility: setting?.visibility || def?.default_visibility || 'all_members',
          isDefault: !setting,
          purposeStatement: def?.purpose_statement,
          isRequired: !!def?.is_required,
          updatedAt: setting?.updated_at,
        };
      }
    }

    res.json(result);
  }),
);

router.put(
  '/my-settings',
  authenticateToken,
  cacheInvalidator(CACHE_PATH),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateUserPrivacySchema.parse(req.body);
    const userId = req.user!.id;
    const associationId = req.user!.associationId;

    let requiredFields: Set<string> = new Set();
    if (associationId) {
      const defaults = db
        .prepare(
          `
            SELECT field_name FROM association_privacy_defaults
            WHERE association_id = ? AND is_required = 1
        `,
        )
        .all(associationId) as any[];
      requiredFields = new Set(defaults.map((d) => d.field_name));
    }

    for (const setting of data.settings) {
      if (requiredFields.has(setting.fieldName)) {
        const associationDefault = db
          .prepare(
            `
                SELECT default_visibility FROM association_privacy_defaults
                WHERE association_id = ? AND field_name = ?
            `,
          )
          .get(associationId, setting.fieldName) as any;

        const allowedLevels = getMoreRestrictiveLevels(associationDefault?.default_visibility || 'admin_only');
        if (!allowedLevels.includes(setting.visibility)) {
          throw new ApiError(
            400,
            `Veld "${setting.fieldName}" moet minimaal ${associationDefault?.default_visibility || 'admin_only'} zichtbaarheid hebben.`,
          );
        }
      }
    }

    withTransaction(() => {
      const upsertStmt = db.prepare(`
            INSERT INTO user_privacy_settings (id, user_id, field_name, visibility, custom_field_id, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, field_name) DO UPDATE SET
                visibility = excluded.visibility,
                custom_field_id = excluded.custom_field_id,
                updated_at = CURRENT_TIMESTAMP
        `);

      for (const setting of data.settings) {
        upsertStmt.run(uuidv4(), userId, setting.fieldName, setting.visibility, setting.customFieldId || null);
      }
    });

    logger.info(`User privacy settings updated`, { userId });

    res.json({ message: 'Privacy-instellingen succesvol bijgewerkt.' });
  }),
);

router.get(
  '/user/:userId',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const requesterId = req.user!.id;
    const requesterRole = req.user!.role;
    const targetUserId = req.params.userId;

    if (targetUserId === requesterId) {
      const settings = db
        .prepare(
          `
            SELECT field_name, visibility
            FROM user_privacy_settings
            WHERE user_id = ?
        `,
        )
        .all(targetUserId) as any[];

      return res.json(Object.fromEntries(settings.map((s) => [s.field_name, s.visibility])));
    }

    const targetUser = db
      .prepare(
        `
        SELECT id, association_id FROM users WHERE id = ?
    `,
      )
      .get(targetUserId) as any;

    if (!targetUser || targetUser.association_id !== associationId) {
      throw new ApiError(404, 'Gebruiker niet gevonden.');
    }

    const settings = db
      .prepare(
        `
        SELECT field_name, visibility
        FROM user_privacy_settings
        WHERE user_id = ?
    `,
      )
      .all(targetUserId) as any[];

    const visibleFields: string[] = [];

    for (const setting of settings) {
      if (canViewField(requesterRole, setting.visibility, requesterId, targetUserId)) {
        visibleFields.push(setting.field_name);
      }
    }

    res.json({ visibleFields });
  }),
);

// =====================================================
// ASSOCIATION PRIVACY DEFAULTS (Admin only)
// =====================================================

router.get(
  '/defaults',
  authenticateToken,
  requireRole('admin'),
  cacheMiddleware({ ttlSeconds: 300 }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
      throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const defaults = db
      .prepare(
        `
        SELECT id, field_name, default_visibility, purpose_statement, is_required
        FROM association_privacy_defaults
        WHERE association_id = ?
        ORDER BY field_name
    `,
      )
      .all(associationId) as any[];

    res.json(
      defaults.map((d) => ({
        id: d.id,
        fieldName: d.field_name,
        defaultVisibility: d.default_visibility,
        purposeStatement: d.purpose_statement,
        isRequired: !!d.is_required,
      })),
    );
  }),
);

router.put(
  '/defaults',
  authenticateToken,
  requireRole('admin'),
  cacheInvalidator(CACHE_PATH),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateAssociationDefaultsSchema.parse(req.body);
    const associationId = req.user!.associationId;
    if (!associationId) {
      throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    withTransaction(() => {
      const upsertStmt = db.prepare(`
            INSERT INTO association_privacy_defaults (id, association_id, field_name, default_visibility, purpose_statement, is_required)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(association_id, field_name) DO UPDATE SET
                default_visibility = excluded.default_visibility,
                purpose_statement = excluded.purpose_statement,
                is_required = excluded.is_required
        `);

      for (const def of data.defaults) {
        upsertStmt.run(
          uuidv4(),
          associationId,
          def.fieldName,
          def.defaultVisibility,
          def.purposeStatement || null,
          def.isRequired ? 1 : 0,
        );
      }
    });

    logger.info(`Association privacy defaults updated`, { associationId, updatedBy: req.user!.id });

    res.json({ message: 'Standaard privacy-instellingen succesvol bijgewerkt.' });
  }),
);

router.delete(
  '/defaults/:fieldName',
  authenticateToken,
  requireRole('admin'),
  cacheInvalidator(CACHE_PATH),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
      throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const result = db
      .prepare(
        `
        DELETE FROM association_privacy_defaults
        WHERE association_id = ? AND field_name = ?
    `,
      )
      .run(associationId, req.params.fieldName);

    if (result.changes === 0) {
      throw new ApiError(404, 'Privacy-standaard niet gevonden.');
    }

    res.json({ message: 'Privacy-standaard succesvol verwijderd.' });
  }),
);

// =====================================================
// PRIVACY CONSENT
// =====================================================

router.get(
  '/consent',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;

    const consents = db
      .prepare(
        `
        SELECT id, consent_version, consented_at, ip_address
        FROM privacy_consents
        WHERE user_id = ?
        ORDER BY consented_at DESC
    `,
      )
      .all(userId) as any[];

    res.json(
      consents.map((c) => ({
        id: c.id,
        consentVersion: c.consent_version,
        consentedAt: c.consented_at,
        ipAddress: c.ip_address,
      })),
    );
  }),
);

router.post(
  '/consent',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = consentSchema.parse(req.body);
    const userId = req.user!.id;

    const existing = db
      .prepare(
        `
        SELECT id FROM privacy_consents
        WHERE user_id = ? AND consent_version = ?
    `,
      )
      .get(userId, data.consentVersion);

    if (existing) {
      return res.json({ message: 'Consent al geregistreerd.', alreadyConsented: true });
    }

    const id = uuidv4();
    db.prepare(
      `
        INSERT INTO privacy_consents (id, user_id, consent_version, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?)
    `,
    ).run(id, userId, data.consentVersion, req.ip, req.get('user-agent'));

    logger.info(`Privacy consent recorded`, { userId, consentVersion: data.consentVersion });

    res.status(201).json({
      id,
      consentVersion: data.consentVersion,
      message: 'Consent succesvol geregistreerd.',
    });
  }),
);

router.get(
  '/consent/check/:version',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;

    const consent = db
      .prepare(
        `
        SELECT id, consented_at FROM privacy_consents
        WHERE user_id = ? AND consent_version = ?
    `,
      )
      .get(userId, req.params.version) as any;

    res.json({
      hasConsented: !!consent,
      consentedAt: consent?.consented_at || null,
    });
  }),
);

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function getMoreRestrictiveLevels(minLevel: string): string[] {
  const levelOrder = ['public', 'all_members', 'section', 'orchestra', 'committee', 'admin_only'];
  const minIndex = levelOrder.indexOf(minLevel);
  if (minIndex === -1) return levelOrder;
  return levelOrder.slice(minIndex);
}

function canViewField(viewerRole: string, fieldVisibility: string, viewerId: string, ownerId: string): boolean {
  if (viewerId === ownerId) return true;
  if (viewerRole === 'admin') return true;

  switch (fieldVisibility) {
    case 'public':
      return true;
    case 'all_members':
      return true;
    case 'section':
    case 'orchestra':
      return true;
    case 'committee':
      return ['music_committee', 'equipment_committee', 'uniforms_committee', 'conductor'].includes(viewerRole);
    case 'admin_only':
      return viewerRole === 'admin';
    default:
      return false;
  }
}

export default router;
