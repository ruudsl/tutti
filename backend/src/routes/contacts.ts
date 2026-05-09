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

const CACHE_PATH = '/api/contacts';
const CATEGORIES_CACHE_PATH = '/api/contacts/categories';

// Validation schemas
const createCategorySchema = z.object({
    name: z.string().min(1, 'Naam is verplicht.'),
    color: z.string().optional(),
    icon: z.string().optional(),
    sortOrder: z.number().optional(),
});

const updateCategorySchema = z.object({
    name: z.string().min(1, 'Naam is verplicht.').optional(),
    color: z.string().optional(),
    icon: z.string().optional(),
    sortOrder: z.number().optional(),
});

const createContactSchema = z.object({
    contactType: z.enum(['organization', 'person', 'venue', 'vendor']),
    name: z.string().min(1, 'Naam is verplicht.'),
    contactPerson: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional(),
    mobile: z.string().optional(),
    addressLine: z.string().optional(),
    postalCode: z.string().optional(),
    city: z.string().optional(),
    country: z.string().optional(),
    iban: z.string().optional(),
    ibanHolderName: z.string().optional(),
    bic: z.string().optional(),
    vatNumber: z.string().optional(),
    chamberOfCommerce: z.string().optional(),
    website: z.string().url().optional().or(z.literal('')),
    notes: z.string().optional(),
    categoryIds: z.array(z.string().uuid()).optional(),
});

const updateContactSchema = createContactSchema.partial();

const createContactPersonSchema = z.object({
    name: z.string().min(1, 'Naam is verplicht.'),
    role: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional(),
    isPrimary: z.boolean().optional(),
    notes: z.string().optional(),
});

const updateContactPersonSchema = createContactPersonSchema.partial();

// =====================================================
// CATEGORY ROUTES
// =====================================================

router.get('/categories', authenticateToken, cacheMiddleware({ ttlSeconds: 300 }), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const categories = db.prepare(`
        SELECT id, name, color, icon, sort_order, created_at
        FROM contact_categories
        WHERE association_id = ?
        ORDER BY sort_order, name
    `).all(associationId);

    res.json(categories.map((c: any) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        icon: c.icon,
        sortOrder: c.sort_order,
        createdAt: c.created_at,
    })));
}));

router.post('/categories', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(CATEGORIES_CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createCategorySchema.parse(req.body);
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const existing = db.prepare(
        'SELECT id FROM contact_categories WHERE association_id = ? AND LOWER(name) = LOWER(?)'
    ).get(associationId, data.name);

    if (existing) {
        throw new ApiError(409, `Categorie "${data.name}" bestaat al.`);
    }

    const id = uuidv4();
    db.prepare(`
        INSERT INTO contact_categories (id, association_id, name, color, icon, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, associationId, data.name, data.color || null, data.icon || null, data.sortOrder || 0);

    logger.info(`Contact category created: ${data.name}`, { categoryId: id, createdBy: req.user!.id });

    res.status(201).json({
        id,
        name: data.name,
        color: data.color,
        icon: data.icon,
        sortOrder: data.sortOrder || 0,
        message: 'Categorie succesvol aangemaakt.',
    });
}));

router.put('/categories/:id', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(CATEGORIES_CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateCategorySchema.parse(req.body);
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const category = db.prepare(
        'SELECT id FROM contact_categories WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId);

    if (!category) {
        throw new ApiError(404, 'Categorie niet gevonden.');
    }

    if (data.name) {
        const existing = db.prepare(
            'SELECT id FROM contact_categories WHERE association_id = ? AND LOWER(name) = LOWER(?) AND id != ?'
        ).get(associationId, data.name, req.params.id);

        if (existing) {
            throw new ApiError(409, `Categorie "${data.name}" bestaat al.`);
        }
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
    if (data.color !== undefined) { updates.push('color = ?'); values.push(data.color || null); }
    if (data.icon !== undefined) { updates.push('icon = ?'); values.push(data.icon || null); }
    if (data.sortOrder !== undefined) { updates.push('sort_order = ?'); values.push(data.sortOrder); }

    if (updates.length > 0) {
        values.push(req.params.id);
        db.prepare(`UPDATE contact_categories SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    res.json({ message: 'Categorie succesvol bijgewerkt.' });
}));

router.delete('/categories/:id', authenticateToken, requireRole('admin'), cacheInvalidator(CATEGORIES_CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const result = db.prepare(
        'DELETE FROM contact_categories WHERE id = ? AND association_id = ?'
    ).run(req.params.id, associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Categorie niet gevonden.');
    }

    res.json({ message: 'Categorie succesvol verwijderd.' });
}));

// =====================================================
// CONTACT ROUTES
// =====================================================

router.get('/', authenticateToken, cacheMiddleware({ ttlSeconds: 60 }), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const { type, category, search, active } = req.query;

    let query = `
        SELECT c.id, c.contact_type, c.name, c.contact_person, c.email, c.phone, c.mobile,
               c.address_line, c.postal_code, c.city, c.country,
               c.iban, c.iban_holder_name, c.bic, c.vat_number, c.chamber_of_commerce,
               c.website, c.notes, c.is_active, c.promoted_to_user_id,
               c.created_at, c.updated_at
        FROM contacts c
        WHERE c.association_id = ? AND c.deleted_at IS NULL
    `;
    const params: any[] = [associationId];

    if (type) {
        query += ' AND c.contact_type = ?';
        params.push(type);
    }

    if (active !== undefined) {
        query += ' AND c.is_active = ?';
        params.push(active === 'true' ? 1 : 0);
    }

    if (category) {
        query += ` AND EXISTS (
            SELECT 1 FROM contact_category_links ccl
            WHERE ccl.contact_id = c.id AND ccl.category_id = ?
        )`;
        params.push(category);
    }

    if (search) {
        query += ` AND (
            LOWER(c.name) LIKE LOWER(?) OR
            LOWER(c.email) LIKE LOWER(?) OR
            LOWER(c.contact_person) LIKE LOWER(?) OR
            LOWER(c.city) LIKE LOWER(?)
        )`;
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    query += ' ORDER BY c.name';

    const contacts = db.prepare(query).all(...params) as any[];

    const result = contacts.map(c => {
        const categories = db.prepare(`
            SELECT cc.id, cc.name, cc.color, cc.icon
            FROM contact_categories cc
            JOIN contact_category_links ccl ON cc.id = ccl.category_id
            WHERE ccl.contact_id = ?
        `).all(c.id);

        return {
            id: c.id,
            contactType: c.contact_type,
            name: c.name,
            contactPerson: c.contact_person,
            email: c.email,
            phone: c.phone,
            mobile: c.mobile,
            addressLine: c.address_line,
            postalCode: c.postal_code,
            city: c.city,
            country: c.country,
            iban: c.iban,
            ibanHolderName: c.iban_holder_name,
            bic: c.bic,
            vatNumber: c.vat_number,
            chamberOfCommerce: c.chamber_of_commerce,
            website: c.website,
            notes: c.notes,
            isActive: !!c.is_active,
            promotedToUserId: c.promoted_to_user_id,
            categories,
            createdAt: c.created_at,
            updatedAt: c.updated_at,
        };
    });

    res.json(result);
}));

router.get('/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const contact = db.prepare(`
        SELECT c.id, c.contact_type, c.name, c.contact_person, c.email, c.phone, c.mobile,
               c.address_line, c.postal_code, c.city, c.country,
               c.iban, c.iban_holder_name, c.bic, c.vat_number, c.chamber_of_commerce,
               c.website, c.notes, c.is_active, c.promoted_to_user_id,
               c.created_at, c.updated_at
        FROM contacts c
        WHERE c.id = ? AND c.association_id = ? AND c.deleted_at IS NULL
    `).get(req.params.id, associationId) as any;

    if (!contact) {
        throw new ApiError(404, 'Contact niet gevonden.');
    }

    const categories = db.prepare(`
        SELECT cc.id, cc.name, cc.color, cc.icon
        FROM contact_categories cc
        JOIN contact_category_links ccl ON cc.id = ccl.category_id
        WHERE ccl.contact_id = ?
    `).all(contact.id);

    const contactPersons = db.prepare(`
        SELECT id, name, role, email, phone, is_primary, notes, created_at
        FROM contact_persons
        WHERE contact_id = ?
        ORDER BY is_primary DESC, name
    `).all(contact.id);

    res.json({
        id: contact.id,
        contactType: contact.contact_type,
        name: contact.name,
        contactPerson: contact.contact_person,
        email: contact.email,
        phone: contact.phone,
        mobile: contact.mobile,
        addressLine: contact.address_line,
        postalCode: contact.postal_code,
        city: contact.city,
        country: contact.country,
        iban: contact.iban,
        ibanHolderName: contact.iban_holder_name,
        bic: contact.bic,
        vatNumber: contact.vat_number,
        chamberOfCommerce: contact.chamber_of_commerce,
        website: contact.website,
        notes: contact.notes,
        isActive: !!contact.is_active,
        promotedToUserId: contact.promoted_to_user_id,
        categories,
        contactPersons: contactPersons.map((cp: any) => ({
            id: cp.id,
            name: cp.name,
            role: cp.role,
            email: cp.email,
            phone: cp.phone,
            isPrimary: !!cp.is_primary,
            notes: cp.notes,
            createdAt: cp.created_at,
        })),
        createdAt: contact.created_at,
        updatedAt: contact.updated_at,
    });
}));

router.post('/', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createContactSchema.parse(req.body);
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const id = uuidv4();

    withTransaction(() => {
        db.prepare(`
            INSERT INTO contacts (
                id, association_id, contact_type, name, contact_person,
                email, phone, mobile, address_line, postal_code, city, country,
                iban, iban_holder_name, bic, vat_number, chamber_of_commerce,
                website, notes, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id, associationId, data.contactType, data.name, data.contactPerson || null,
            data.email || null, data.phone || null, data.mobile || null,
            data.addressLine || null, data.postalCode || null, data.city || null, data.country || 'NL',
            data.iban || null, data.ibanHolderName || null, data.bic || null,
            data.vatNumber || null, data.chamberOfCommerce || null,
            data.website || null, data.notes || null, req.user!.id
        );

        if (data.categoryIds && data.categoryIds.length > 0) {
            const insertLink = db.prepare(
                'INSERT INTO contact_category_links (contact_id, category_id) VALUES (?, ?)'
            );
            for (const categoryId of data.categoryIds) {
                insertLink.run(id, categoryId);
            }
        }
    });

    logger.info(`Contact created: ${data.name}`, { contactId: id, createdBy: req.user!.id });

    logAuditEvent(
        req.user!.id,
        'create',
        'contact',
        id,
        data.name,
        { contactType: data.contactType },
        req.ip,
        req.get('user-agent')
    );

    res.status(201).json({
        id,
        name: data.name,
        message: 'Contact succesvol aangemaakt.',
    });
}));

router.patch('/:id', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateContactSchema.parse(req.body);
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const contact = db.prepare(
        'SELECT id, name FROM contacts WHERE id = ? AND association_id = ? AND deleted_at IS NULL'
    ).get(req.params.id, associationId) as any;

    if (!contact) {
        throw new ApiError(404, 'Contact niet gevonden.');
    }

    withTransaction(() => {
        const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
        const values: any[] = [];

        if (data.contactType !== undefined) { updates.push('contact_type = ?'); values.push(data.contactType); }
        if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
        if (data.contactPerson !== undefined) { updates.push('contact_person = ?'); values.push(data.contactPerson || null); }
        if (data.email !== undefined) { updates.push('email = ?'); values.push(data.email || null); }
        if (data.phone !== undefined) { updates.push('phone = ?'); values.push(data.phone || null); }
        if (data.mobile !== undefined) { updates.push('mobile = ?'); values.push(data.mobile || null); }
        if (data.addressLine !== undefined) { updates.push('address_line = ?'); values.push(data.addressLine || null); }
        if (data.postalCode !== undefined) { updates.push('postal_code = ?'); values.push(data.postalCode || null); }
        if (data.city !== undefined) { updates.push('city = ?'); values.push(data.city || null); }
        if (data.country !== undefined) { updates.push('country = ?'); values.push(data.country || null); }
        if (data.iban !== undefined) { updates.push('iban = ?'); values.push(data.iban || null); }
        if (data.ibanHolderName !== undefined) { updates.push('iban_holder_name = ?'); values.push(data.ibanHolderName || null); }
        if (data.bic !== undefined) { updates.push('bic = ?'); values.push(data.bic || null); }
        if (data.vatNumber !== undefined) { updates.push('vat_number = ?'); values.push(data.vatNumber || null); }
        if (data.chamberOfCommerce !== undefined) { updates.push('chamber_of_commerce = ?'); values.push(data.chamberOfCommerce || null); }
        if (data.website !== undefined) { updates.push('website = ?'); values.push(data.website || null); }
        if (data.notes !== undefined) { updates.push('notes = ?'); values.push(data.notes || null); }

        values.push(req.params.id);
        db.prepare(`UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`).run(...values);

        if (data.categoryIds !== undefined) {
            db.prepare('DELETE FROM contact_category_links WHERE contact_id = ?').run(req.params.id);
            if (data.categoryIds.length > 0) {
                const insertLink = db.prepare(
                    'INSERT INTO contact_category_links (contact_id, category_id) VALUES (?, ?)'
                );
                for (const categoryId of data.categoryIds) {
                    insertLink.run(req.params.id, categoryId);
                }
            }
        }
    });

    const sanitizedContactIdForLog = String(req.params.id).replace(/[\r\n]/g, '');
    logger.info(`Contact updated: ${sanitizedContactIdForLog}`, { updatedBy: req.user!.id });

    logAuditEvent(
        req.user!.id,
        'update',
        'contact',
        req.params.id,
        contact.name,
        undefined,
        req.ip,
        req.get('user-agent')
    );

    res.json({ message: 'Contact succesvol bijgewerkt.' });
}));

router.delete('/:id', authenticateToken, requireRole('admin'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const contact = db.prepare(
        'SELECT id, name FROM contacts WHERE id = ? AND association_id = ? AND deleted_at IS NULL'
    ).get(req.params.id, associationId) as any;

    if (!contact) {
        throw new ApiError(404, 'Contact niet gevonden.');
    }

    db.prepare(
        'UPDATE contacts SET deleted_at = CURRENT_TIMESTAMP, is_active = 0 WHERE id = ?'
    ).run(req.params.id);

    logger.info(`Contact deleted (soft): ${req.params.id}`, { deletedBy: req.user!.id });

    logAuditEvent(
        req.user!.id,
        'delete',
        'contact',
        req.params.id,
        contact.name,
        undefined,
        req.ip,
        req.get('user-agent')
    );

    res.json({ message: 'Contact succesvol verwijderd.' });
}));

router.post('/:id/activate', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const result = db.prepare(
        'UPDATE contacts SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND association_id = ? AND deleted_at IS NULL'
    ).run(req.params.id, associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Contact niet gevonden.');
    }

    res.json({ message: 'Contact geactiveerd.' });
}));

router.post('/:id/deactivate', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const result = db.prepare(
        'UPDATE contacts SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND association_id = ? AND deleted_at IS NULL'
    ).run(req.params.id, associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Contact niet gevonden.');
    }

    res.json({ message: 'Contact gedeactiveerd.' });
}));

// =====================================================
// CONTACT PERSON ROUTES
// =====================================================

router.get('/:id/persons', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const contact = db.prepare(
        'SELECT id FROM contacts WHERE id = ? AND association_id = ? AND deleted_at IS NULL'
    ).get(req.params.id, associationId);

    if (!contact) {
        throw new ApiError(404, 'Contact niet gevonden.');
    }

    const persons = db.prepare(`
        SELECT id, name, role, email, phone, is_primary, notes, created_at
        FROM contact_persons
        WHERE contact_id = ?
        ORDER BY is_primary DESC, name
    `).all(req.params.id);

    res.json(persons.map((p: any) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        email: p.email,
        phone: p.phone,
        isPrimary: !!p.is_primary,
        notes: p.notes,
        createdAt: p.created_at,
    })));
}));

router.post('/:id/persons', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createContactPersonSchema.parse(req.body);
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const contact = db.prepare(
        'SELECT id FROM contacts WHERE id = ? AND association_id = ? AND deleted_at IS NULL'
    ).get(req.params.id, associationId);

    if (!contact) {
        throw new ApiError(404, 'Contact niet gevonden.');
    }

    const personId = uuidv4();

    withTransaction(() => {
        if (data.isPrimary) {
            db.prepare('UPDATE contact_persons SET is_primary = 0 WHERE contact_id = ?').run(req.params.id);
        }

        db.prepare(`
            INSERT INTO contact_persons (id, contact_id, name, role, email, phone, is_primary, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            personId, req.params.id, data.name, data.role || null,
            data.email || null, data.phone || null, data.isPrimary ? 1 : 0, data.notes || null
        );
    });

    res.status(201).json({
        id: personId,
        name: data.name,
        message: 'Contactpersoon succesvol toegevoegd.',
    });
}));

router.put('/:id/persons/:personId', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateContactPersonSchema.parse(req.body);
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const contact = db.prepare(
        'SELECT id FROM contacts WHERE id = ? AND association_id = ? AND deleted_at IS NULL'
    ).get(req.params.id, associationId);

    if (!contact) {
        throw new ApiError(404, 'Contact niet gevonden.');
    }

    const person = db.prepare(
        'SELECT id FROM contact_persons WHERE id = ? AND contact_id = ?'
    ).get(req.params.personId, req.params.id);

    if (!person) {
        throw new ApiError(404, 'Contactpersoon niet gevonden.');
    }

    withTransaction(() => {
        if (data.isPrimary) {
            db.prepare('UPDATE contact_persons SET is_primary = 0 WHERE contact_id = ?').run(req.params.id);
        }

        const updates: string[] = [];
        const values: any[] = [];

        if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
        if (data.role !== undefined) { updates.push('role = ?'); values.push(data.role || null); }
        if (data.email !== undefined) { updates.push('email = ?'); values.push(data.email || null); }
        if (data.phone !== undefined) { updates.push('phone = ?'); values.push(data.phone || null); }
        if (data.isPrimary !== undefined) { updates.push('is_primary = ?'); values.push(data.isPrimary ? 1 : 0); }
        if (data.notes !== undefined) { updates.push('notes = ?'); values.push(data.notes || null); }

        if (updates.length > 0) {
            values.push(req.params.personId);
            db.prepare(`UPDATE contact_persons SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        }
    });

    res.json({ message: 'Contactpersoon succesvol bijgewerkt.' });
}));

router.delete('/:id/persons/:personId', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const contact = db.prepare(
        'SELECT id FROM contacts WHERE id = ? AND association_id = ? AND deleted_at IS NULL'
    ).get(req.params.id, associationId);

    if (!contact) {
        throw new ApiError(404, 'Contact niet gevonden.');
    }

    const result = db.prepare(
        'DELETE FROM contact_persons WHERE id = ? AND contact_id = ?'
    ).run(req.params.personId, req.params.id);

    if (result.changes === 0) {
        throw new ApiError(404, 'Contactpersoon niet gevonden.');
    }

    res.json({ message: 'Contactpersoon succesvol verwijderd.' });
}));

// =====================================================
// PROMOTE CONTACT TO USER
// =====================================================

router.post('/:id/promote', authenticateToken, requireRole('admin'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const contact = db.prepare(`
        SELECT id, name, email, contact_type
        FROM contacts
        WHERE id = ? AND association_id = ? AND deleted_at IS NULL
    `).get(req.params.id, associationId) as any;

    if (!contact) {
        throw new ApiError(404, 'Contact niet gevonden.');
    }

    if (contact.promoted_to_user_id) {
        throw new ApiError(400, 'Dit contact is al gepromoveerd tot gebruiker.');
    }

    if (!contact.email) {
        throw new ApiError(400, 'Contact heeft geen e-mailadres. Vul eerst een e-mailadres in.');
    }

    if (contact.contact_type !== 'person') {
        throw new ApiError(400, 'Alleen persoon-type contacten kunnen worden gepromoveerd tot gebruiker.');
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(contact.email);
    if (existingUser) {
        throw new ApiError(409, 'Er bestaat al een gebruiker met dit e-mailadres.');
    }

    const nameParts = contact.name.split(' ');
    const firstName = nameParts[0] || contact.name;
    const lastName = nameParts.slice(1).join(' ') || '';

    const userId = uuidv4();
    const tempPassword = uuidv4().substring(0, 12);
    const bcrypt = require('bcrypt');
    const passwordHash = bcrypt.hashSync(tempPassword, 10);

    withTransaction(() => {
        db.prepare(`
            INSERT INTO users (id, email, password_hash, first_name, last_name, role, status, association_id)
            VALUES (?, ?, ?, ?, ?, 'member', 'pending', ?)
        `).run(userId, contact.email, passwordHash, firstName, lastName, associationId);

        db.prepare(
            'UPDATE contacts SET promoted_to_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run(userId, contact.id);
    });

    logger.info(`Contact promoted to user: ${contact.name}`, { contactId: contact.id, userId, promotedBy: req.user!.id });

    logAuditEvent(
        req.user!.id,
        'promote',
        'contact',
        contact.id,
        contact.name,
        { newUserId: userId },
        req.ip,
        req.get('user-agent')
    );

    res.status(201).json({
        userId,
        email: contact.email,
        tempPassword,
        message: 'Contact succesvol gepromoveerd tot gebruiker. Stuur de inloggegevens naar de gebruiker.',
    });
}));

export default router;
