import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { cacheMiddleware, cacheInvalidator } from '../middleware/cache';
import { withTransaction } from '../utils/database';
import logger from '../utils/logger';
import { logAuditEvent } from './audit-logs';
import { z } from 'zod';

const router = Router();

const CACHE_PATH = '/api/custom-fields';

const ENTITY_TYPES = ['user', 'orchestra', 'rehearsal', 'concert', 'music_piece', 'loan', 'instrument', 'contact'] as const;
const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'datetime', 'boolean', 'select', 'multiselect', 'email', 'phone', 'url', 'file'] as const;
const VISIBILITY_TYPES = ['all', 'admin_only', 'committee_plus', 'self_only'] as const;

const createFieldDefinitionSchema = z.object({
    entityType: z.enum(ENTITY_TYPES),
    fieldKey: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/, 'Field key moet beginnen met een letter en mag alleen kleine letters, cijfers en underscores bevatten.'),
    fieldLabel: z.string().min(1, 'Label is verplicht.'),
    fieldType: z.enum(FIELD_TYPES),
    fieldOptions: z.array(z.string()).optional(),
    isRequired: z.boolean().optional(),
    isUnique: z.boolean().optional(),
    visibility: z.enum(VISIBILITY_TYPES).optional(),
    selfEditable: z.boolean().optional(),
    sortOrder: z.number().optional(),
    description: z.string().optional(),
    placeholder: z.string().optional(),
    defaultValue: z.string().optional(),
    validationRegex: z.string().optional(),
});

const updateFieldDefinitionSchema = createFieldDefinitionSchema.partial().omit({ entityType: true, fieldKey: true });

const setFieldValueSchema = z.object({
    entityType: z.enum(ENTITY_TYPES),
    entityId: z.string().uuid(),
    values: z.record(z.string(), z.any()),
});

// =====================================================
// FIELD DEFINITION ROUTES
// =====================================================

router.get('/definitions', authenticateToken, cacheMiddleware({ ttlSeconds: 300 }), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const { entityType } = req.query;

    let query = `
        SELECT id, entity_type, field_key, field_label, field_type, field_options,
               is_required, is_unique, visibility, self_editable, sort_order,
               description, placeholder, default_value, validation_regex,
               created_at, updated_at
        FROM custom_field_definitions
        WHERE association_id = ? AND deleted_at IS NULL
    `;
    const params: any[] = [associationId];

    if (entityType) {
        query += ' AND entity_type = ?';
        params.push(entityType);
    }

    query += ' ORDER BY entity_type, sort_order, field_label';

    const definitions = db.prepare(query).all(...params) as any[];

    res.json(definitions.map(d => ({
        id: d.id,
        entityType: d.entity_type,
        fieldKey: d.field_key,
        fieldLabel: d.field_label,
        fieldType: d.field_type,
        fieldOptions: d.field_options ? JSON.parse(d.field_options) : null,
        isRequired: !!d.is_required,
        isUnique: !!d.is_unique,
        visibility: d.visibility,
        selfEditable: !!d.self_editable,
        sortOrder: d.sort_order,
        description: d.description,
        placeholder: d.placeholder,
        defaultValue: d.default_value,
        validationRegex: d.validation_regex,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
    })));
}));

router.get('/definitions/:entityType', authenticateToken, cacheMiddleware({ ttlSeconds: 300 }), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const { entityType } = req.params;
    if (!ENTITY_TYPES.includes(entityType as any)) {
        throw new ApiError(400, 'Ongeldig entiteit type.');
    }

    const definitions = db.prepare(`
        SELECT id, entity_type, field_key, field_label, field_type, field_options,
               is_required, is_unique, visibility, self_editable, sort_order,
               description, placeholder, default_value, validation_regex
        FROM custom_field_definitions
        WHERE association_id = ? AND entity_type = ? AND deleted_at IS NULL
        ORDER BY sort_order, field_label
    `).all(associationId, entityType) as any[];

    const userRole = req.user!.role;
    const filtered = definitions.filter(d => {
        if (d.visibility === 'all') return true;
        if (d.visibility === 'admin_only') return userRole === 'admin';
        if (d.visibility === 'committee_plus') {
            return ['admin', 'music_committee', 'equipment_committee', 'uniforms_committee', 'conductor'].includes(userRole);
        }
        return true;
    });

    res.json(filtered.map(d => ({
        id: d.id,
        entityType: d.entity_type,
        fieldKey: d.field_key,
        fieldLabel: d.field_label,
        fieldType: d.field_type,
        fieldOptions: d.field_options ? JSON.parse(d.field_options) : null,
        isRequired: !!d.is_required,
        isUnique: !!d.is_unique,
        visibility: d.visibility,
        selfEditable: !!d.self_editable,
        sortOrder: d.sort_order,
        description: d.description,
        placeholder: d.placeholder,
        defaultValue: d.default_value,
        validationRegex: d.validation_regex,
    })));
}));

router.post('/definitions', authenticateToken, requireRole('admin'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createFieldDefinitionSchema.parse(req.body);
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const existing = db.prepare(
        'SELECT id FROM custom_field_definitions WHERE association_id = ? AND entity_type = ? AND field_key = ? AND deleted_at IS NULL'
    ).get(associationId, data.entityType, data.fieldKey);

    if (existing) {
        throw new ApiError(409, `Veld "${data.fieldKey}" bestaat al voor ${data.entityType}.`);
    }

    const id = uuidv4();
    db.prepare(`
        INSERT INTO custom_field_definitions (
            id, association_id, entity_type, field_key, field_label, field_type,
            field_options, is_required, is_unique, visibility, self_editable,
            sort_order, description, placeholder, default_value, validation_regex
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, associationId, data.entityType, data.fieldKey, data.fieldLabel, data.fieldType,
        data.fieldOptions ? JSON.stringify(data.fieldOptions) : null,
        data.isRequired ? 1 : 0,
        data.isUnique ? 1 : 0,
        data.visibility || 'all',
        data.selfEditable ? 1 : 0,
        data.sortOrder || 0,
        data.description || null,
        data.placeholder || null,
        data.defaultValue || null,
        data.validationRegex || null
    );

    logger.info(`Custom field definition created: ${data.fieldKey}`, { definitionId: id, createdBy: req.user!.id });

    logAuditEvent(
        req.user!.id,
        'create',
        'custom_field_definition',
        id,
        `${data.entityType}.${data.fieldKey}`,
        { fieldType: data.fieldType },
        req.ip,
        req.get('user-agent')
    );

    res.status(201).json({
        id,
        entityType: data.entityType,
        fieldKey: data.fieldKey,
        fieldLabel: data.fieldLabel,
        message: 'Aangepast veld succesvol aangemaakt.',
    });
}));

router.patch('/definitions/:id', authenticateToken, requireRole('admin'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateFieldDefinitionSchema.parse(req.body);
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const definition = db.prepare(
        'SELECT id, field_key FROM custom_field_definitions WHERE id = ? AND association_id = ? AND deleted_at IS NULL'
    ).get(req.params.id, associationId) as any;

    if (!definition) {
        throw new ApiError(404, 'Velddefinitie niet gevonden.');
    }

    const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: any[] = [];

    if (data.fieldLabel !== undefined) { updates.push('field_label = ?'); values.push(data.fieldLabel); }
    if (data.fieldType !== undefined) { updates.push('field_type = ?'); values.push(data.fieldType); }
    if (data.fieldOptions !== undefined) { updates.push('field_options = ?'); values.push(data.fieldOptions ? JSON.stringify(data.fieldOptions) : null); }
    if (data.isRequired !== undefined) { updates.push('is_required = ?'); values.push(data.isRequired ? 1 : 0); }
    if (data.isUnique !== undefined) { updates.push('is_unique = ?'); values.push(data.isUnique ? 1 : 0); }
    if (data.visibility !== undefined) { updates.push('visibility = ?'); values.push(data.visibility); }
    if (data.selfEditable !== undefined) { updates.push('self_editable = ?'); values.push(data.selfEditable ? 1 : 0); }
    if (data.sortOrder !== undefined) { updates.push('sort_order = ?'); values.push(data.sortOrder); }
    if (data.description !== undefined) { updates.push('description = ?'); values.push(data.description || null); }
    if (data.placeholder !== undefined) { updates.push('placeholder = ?'); values.push(data.placeholder || null); }
    if (data.defaultValue !== undefined) { updates.push('default_value = ?'); values.push(data.defaultValue || null); }
    if (data.validationRegex !== undefined) { updates.push('validation_regex = ?'); values.push(data.validationRegex || null); }

    values.push(req.params.id);
    db.prepare(`UPDATE custom_field_definitions SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    logger.info(`Custom field definition updated: ${req.params.id}`, { updatedBy: req.user!.id });

    logAuditEvent(
        req.user!.id,
        'update',
        'custom_field_definition',
        req.params.id,
        definition.field_key,
        undefined,
        req.ip,
        req.get('user-agent')
    );

    res.json({ message: 'Velddefinitie succesvol bijgewerkt.' });
}));

router.delete('/definitions/:id', authenticateToken, requireRole('admin'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const definition = db.prepare(
        'SELECT id, field_key FROM custom_field_definitions WHERE id = ? AND association_id = ? AND deleted_at IS NULL'
    ).get(req.params.id, associationId) as any;

    if (!definition) {
        throw new ApiError(404, 'Velddefinitie niet gevonden.');
    }

    db.prepare(
        'UPDATE custom_field_definitions SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(req.params.id);

    logger.info(`Custom field definition deleted (soft): ${req.params.id}`, { deletedBy: req.user!.id });

    logAuditEvent(
        req.user!.id,
        'delete',
        'custom_field_definition',
        req.params.id,
        definition.field_key,
        undefined,
        req.ip,
        req.get('user-agent')
    );

    res.json({ message: 'Velddefinitie succesvol verwijderd.' });
}));

// =====================================================
// FIELD VALUE ROUTES
// =====================================================

router.get('/values/:entityType/:entityId', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const { entityType, entityId } = req.params;
    if (!ENTITY_TYPES.includes(entityType as any)) {
        throw new ApiError(400, 'Ongeldig entiteit type.');
    }

    const userRole = req.user!.role;
    const userId = req.user!.id;

    const definitions = db.prepare(`
        SELECT cfd.id, cfd.field_key, cfd.field_label, cfd.field_type, cfd.field_options,
               cfd.visibility, cfd.self_editable, cfd.is_required,
               cfv.value_text, cfv.value_number, cfv.value_date, cfv.value_boolean, cfv.value_json
        FROM custom_field_definitions cfd
        LEFT JOIN custom_field_values cfv ON cfd.id = cfv.field_definition_id
            AND cfv.entity_type = ? AND cfv.entity_id = ?
        WHERE cfd.association_id = ? AND cfd.entity_type = ? AND cfd.deleted_at IS NULL
        ORDER BY cfd.sort_order, cfd.field_label
    `).all(entityType, entityId, associationId, entityType) as any[];

    const result: Record<string, any> = {};
    const meta: Record<string, any> = {};

    for (const def of definitions) {
        let canView = true;
        if (def.visibility === 'admin_only' && userRole !== 'admin') canView = false;
        if (def.visibility === 'committee_plus' && !['admin', 'music_committee', 'equipment_committee', 'uniforms_committee', 'conductor'].includes(userRole)) canView = false;
        if (def.visibility === 'self_only' && entityType === 'user' && entityId !== userId) canView = false;

        if (!canView) continue;

        let value: any;
        switch (def.field_type) {
            case 'number':
                value = def.value_number;
                break;
            case 'date':
            case 'datetime':
                value = def.value_date;
                break;
            case 'boolean':
                value = def.value_boolean !== null ? !!def.value_boolean : null;
                break;
            case 'multiselect':
            case 'file':
                value = def.value_json ? JSON.parse(def.value_json) : null;
                break;
            default:
                value = def.value_text;
        }

        result[def.field_key] = value;
        meta[def.field_key] = {
            id: def.id,
            label: def.field_label,
            type: def.field_type,
            options: def.field_options ? JSON.parse(def.field_options) : null,
            required: !!def.is_required,
            editable: userRole === 'admin' || (def.self_editable && entityType === 'user' && entityId === userId),
        };
    }

    res.json({ values: result, meta });
}));

router.post('/values', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = setFieldValueSchema.parse(req.body);
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const userRole = req.user!.role;
    const userId = req.user!.id;

    const definitions = db.prepare(`
        SELECT id, field_key, field_type, visibility, self_editable, is_required, is_unique, validation_regex
        FROM custom_field_definitions
        WHERE association_id = ? AND entity_type = ? AND deleted_at IS NULL
    `).all(associationId, data.entityType) as any[];

    const defMap = new Map(definitions.map(d => [d.field_key, d]));

    withTransaction(() => {
        for (const [fieldKey, value] of Object.entries(data.values)) {
            const def = defMap.get(fieldKey);
            if (!def) continue;

            let canEdit = false;
            if (userRole === 'admin') {
                canEdit = true;
            } else if (def.self_editable && data.entityType === 'user' && data.entityId === userId) {
                canEdit = true;
            } else if (['music_committee', 'equipment_committee', 'uniforms_committee', 'conductor'].includes(userRole)) {
                if (def.visibility !== 'admin_only') canEdit = true;
            }

            if (!canEdit) {
                throw new ApiError(403, `Geen rechten om veld "${def.field_key}" te bewerken.`);
            }

            if (def.is_required && (value === null || value === undefined || value === '')) {
                throw new ApiError(400, `Veld "${def.field_key}" is verplicht.`);
            }

            if (def.validation_regex && value && typeof value === 'string') {
                const regex = new RegExp(def.validation_regex);
                if (!regex.test(value)) {
                    throw new ApiError(400, `Veld "${def.field_key}" voldoet niet aan de validatie.`);
                }
            }

            if (def.is_unique && value !== null && value !== undefined && value !== '') {
                const existing = db.prepare(`
                    SELECT cfv.entity_id
                    FROM custom_field_values cfv
                    WHERE cfv.field_definition_id = ? AND cfv.value_text = ? AND cfv.entity_id != ?
                `).get(def.id, value, data.entityId);

                if (existing) {
                    throw new ApiError(409, `Waarde "${value}" voor veld "${def.field_key}" is al in gebruik.`);
                }
            }

            const existing = db.prepare(`
                SELECT id FROM custom_field_values
                WHERE field_definition_id = ? AND entity_type = ? AND entity_id = ?
            `).get(def.id, data.entityType, data.entityId);

            let valueText: string | null = null;
            let valueNumber: number | null = null;
            let valueDate: string | null = null;
            let valueBoolean: number | null = null;
            let valueJson: string | null = null;

            if (value !== null && value !== undefined) {
                switch (def.field_type) {
                    case 'number':
                        valueNumber = typeof value === 'number' ? value : parseFloat(value);
                        break;
                    case 'date':
                    case 'datetime':
                        valueDate = value as string;
                        break;
                    case 'boolean':
                        valueBoolean = value ? 1 : 0;
                        break;
                    case 'multiselect':
                    case 'file':
                        valueJson = JSON.stringify(value);
                        break;
                    default:
                        valueText = String(value);
                }
            }

            if (existing) {
                db.prepare(`
                    UPDATE custom_field_values
                    SET value_text = ?, value_number = ?, value_date = ?, value_boolean = ?, value_json = ?,
                        updated_by = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE field_definition_id = ? AND entity_type = ? AND entity_id = ?
                `).run(valueText, valueNumber, valueDate, valueBoolean, valueJson, userId, def.id, data.entityType, data.entityId);
            } else {
                const valueId = uuidv4();
                db.prepare(`
                    INSERT INTO custom_field_values (
                        id, field_definition_id, entity_type, entity_id,
                        value_text, value_number, value_date, value_boolean, value_json, updated_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(valueId, def.id, data.entityType, data.entityId, valueText, valueNumber, valueDate, valueBoolean, valueJson, userId);
            }
        }
    });

    logger.info(`Custom field values updated for ${data.entityType}/${data.entityId}`, { updatedBy: userId });

    res.json({ message: 'Veldwaarden succesvol bijgewerkt.' });
}));

router.delete('/values/:entityType/:entityId/:fieldKey', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const { entityType, entityId, fieldKey } = req.params;

    const definition = db.prepare(`
        SELECT id FROM custom_field_definitions
        WHERE association_id = ? AND entity_type = ? AND field_key = ? AND deleted_at IS NULL
    `).get(associationId, entityType, fieldKey) as any;

    if (!definition) {
        throw new ApiError(404, 'Velddefinitie niet gevonden.');
    }

    const result = db.prepare(`
        DELETE FROM custom_field_values
        WHERE field_definition_id = ? AND entity_type = ? AND entity_id = ?
    `).run(definition.id, entityType, entityId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Veldwaarde niet gevonden.');
    }

    res.json({ message: 'Veldwaarde succesvol verwijderd.' });
}));

// =====================================================
// BULK OPERATIONS
// =====================================================

router.post('/definitions/reorder', authenticateToken, requireRole('admin'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const schema = z.object({
        entityType: z.enum(ENTITY_TYPES),
        fieldIds: z.array(z.string().uuid()),
    });

    const data = schema.parse(req.body);
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    withTransaction(() => {
        const updateStmt = db.prepare(
            'UPDATE custom_field_definitions SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND association_id = ?'
        );
        data.fieldIds.forEach((id, index) => {
            updateStmt.run(index, id, associationId);
        });
    });

    res.json({ message: 'Volgorde succesvol bijgewerkt.' });
}));

export default router;
