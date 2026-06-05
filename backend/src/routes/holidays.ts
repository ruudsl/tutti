import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import {
    getHolidaysInRange,
    syncHolidaysFromExternalAPI,
    getAvailableYears,
    getRegions,
    DutchRegion,
    SchoolHoliday,
} from '../services/holidays';

const router = Router();

// Types
interface HolidayRow {
    id: string;
    association_id: string | null;
    name: string;
    region: string | null;
    country: string;
    start_date: string;
    end_date: string;
    year: number;
    holiday_type: string | null;
    is_custom: boolean;
    source: string | null;
    created_at: string;
    updated_at: string;
}

interface HolidaySettingsRow {
    id: string;
    association_id: string;
    region: string;
    show_holidays_in_calendar: boolean;
    auto_block_rehearsals: boolean;
    created_at: string;
    updated_at: string;
}

/**
 * Get or create holiday settings for an association
 */
function getOrCreateSettings(associationId: string): HolidaySettingsRow {
    let settings = db.prepare(`
        SELECT * FROM association_holiday_settings WHERE association_id = ?
    `).get(associationId) as HolidaySettingsRow | undefined;

    if (!settings) {
        const id = uuidv4();
        db.prepare(`
            INSERT INTO association_holiday_settings (id, association_id, region, show_holidays_in_calendar, auto_block_rehearsals)
            VALUES (?, ?, 'midden', TRUE, FALSE)
        `).run(id, associationId);

        settings = db.prepare(`
            SELECT * FROM association_holiday_settings WHERE association_id = ?
        `).get(associationId) as HolidaySettingsRow;
    }

    return settings;
}

/**
 * GET /holidays - Get holidays for the association's region
 * Query params: year, startDate, endDate
 */
router.get('/', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user!.associationId) {
        throw new ApiError(400, 'Geen vereniging geselecteerd.');
    }
    const settings = getOrCreateSettings(req.user!.associationId);
    const region = (settings.region || 'midden') as DutchRegion;

    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const startDate = (req.query.startDate as string) || `${year}-01-01`;
    const endDate = (req.query.endDate as string) || `${year}-12-31`;

    // Get system holidays from service (hardcoded data)
    const systemHolidays = getHolidaysInRange(startDate, endDate, region);

    // Get custom holidays from database
    const customHolidays = db.prepare(`
        SELECT * FROM school_holidays
        WHERE association_id = ?
        AND start_date <= ?
        AND end_date >= ?
        AND is_custom = TRUE
        ORDER BY start_date
    `).all(req.user!.associationId, endDate, startDate) as HolidayRow[];

    // Convert system holidays to response format
    const systemHolidaysResponse = systemHolidays.map(h => ({
        id: `system-${h.holidayType}-${h.startDate}-${h.region}`,
        name: h.nameDutch,
        nameEnglish: h.name,
        region: h.region,
        country: 'NL',
        startDate: h.startDate,
        endDate: h.endDate,
        year: h.year,
        holidayType: h.holidayType,
        isCustom: false,
        source: 'system',
    }));

    // Convert custom holidays to response format
    const customHolidaysResponse = customHolidays.map(h => ({
        id: h.id,
        name: h.name,
        region: h.region,
        country: h.country,
        startDate: h.start_date,
        endDate: h.end_date,
        year: h.year,
        holidayType: h.holiday_type,
        isCustom: true,
        source: h.source,
    }));

    // Combine and sort by start date
    const allHolidays = [...systemHolidaysResponse, ...customHolidaysResponse];
    allHolidays.sort((a, b) => a.startDate.localeCompare(b.startDate));

    res.json({
        holidays: allHolidays,
        settings: {
            region: settings.region,
            showHolidaysInCalendar: settings.show_holidays_in_calendar,
            autoBlockRehearsals: settings.auto_block_rehearsals,
        },
        meta: {
            availableYears: getAvailableYears(),
            regions: getRegions(),
        },
    });
}));

/**
 * GET /holidays/check - Check if a date falls within a holiday
 * Query params: date
 */
router.get('/check', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user!.associationId) {
        throw new ApiError(400, 'Geen vereniging geselecteerd.');
    }
    const date = req.query.date as string;

    if (!date) {
        throw new ApiError(400, 'Datum is verplicht.');
    }

    const settings = getOrCreateSettings(req.user!.associationId);
    const region = (settings.region || 'midden') as DutchRegion;

    // Check system holidays
    const year = parseInt(date.substring(0, 4));
    const systemHolidays = getHolidaysInRange(date, date, region);

    // Check custom holidays
    const customHoliday = db.prepare(`
        SELECT * FROM school_holidays
        WHERE association_id = ?
        AND start_date <= ?
        AND end_date >= ?
        LIMIT 1
    `).get(req.user!.associationId, date, date) as HolidayRow | undefined;

    const holiday = systemHolidays[0] || customHoliday;

    if (holiday) {
        const isSystem = 'nameDutch' in holiday;
        res.json({
            isHoliday: true,
            holiday: {
                name: isSystem ? (holiday as SchoolHoliday).nameDutch : (holiday as HolidayRow).name,
                startDate: isSystem ? (holiday as SchoolHoliday).startDate : (holiday as HolidayRow).start_date,
                endDate: isSystem ? (holiday as SchoolHoliday).endDate : (holiday as HolidayRow).end_date,
                holidayType: isSystem ? (holiday as SchoolHoliday).holidayType : (holiday as HolidayRow).holiday_type,
                isCustom: !isSystem,
            },
        });
    } else {
        res.json({ isHoliday: false, holiday: null });
    }
}));

/**
 * GET /holidays/sync - Sync holidays from external source (or refresh from hardcoded data)
 */
router.get('/sync', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    try {
        const holidays = await syncHolidaysFromExternalAPI(year);

        logger.info(`Holiday sync completed for year ${year}`, {
            associationId: req.user!.associationId,
            holidayCount: holidays.length,
        });

        res.json({
            message: `${holidays.length} feestdagen gesynchroniseerd voor ${year}.`,
            count: holidays.length,
            year,
        });
    } catch (error) {
        logger.error('Holiday sync failed', { error, year });
        throw new ApiError(500, 'Synchronisatie van feestdagen mislukt.');
    }
}));

/**
 * POST /holidays - Add a custom holiday
 */
router.post('/', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user!.associationId) {
        throw new ApiError(400, 'Geen vereniging geselecteerd.');
    }
    const { name, startDate, endDate, region, holidayType } = req.body;

    if (!name || !startDate || !endDate) {
        throw new ApiError(400, 'Naam, startdatum en einddatum zijn verplicht.');
    }

    if (new Date(startDate) > new Date(endDate)) {
        throw new ApiError(400, 'Startdatum moet voor einddatum liggen.');
    }

    const id = uuidv4();
    const year = parseInt(startDate.substring(0, 4));

    db.prepare(`
        INSERT INTO school_holidays (
            id, association_id, name, region, country, start_date, end_date,
            year, holiday_type, is_custom, source
        )
        VALUES (?, ?, ?, ?, 'NL', ?, ?, ?, ?, TRUE, 'manual')
    `).run(
        id,
        req.user!.associationId,
        name,
        region || null,
        startDate,
        endDate,
        year,
        holidayType || null
    );

    logger.info('Custom holiday created', {
        id,
        name,
        associationId: req.user!.associationId,
    });

    res.status(201).json({
        id,
        name,
        startDate,
        endDate,
        region,
        year,
        holidayType,
        isCustom: true,
        source: 'manual',
    });
}));

/**
 * GET /holidays/settings - Get association holiday settings
 * IMPORTANT: This route must be defined BEFORE /:id routes
 */
router.get('/settings', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user!.associationId) {
        throw new ApiError(400, 'Geen vereniging geselecteerd.');
    }
    const settings = getOrCreateSettings(req.user!.associationId);

    res.json({
        region: settings.region,
        showHolidaysInCalendar: settings.show_holidays_in_calendar,
        autoBlockRehearsals: settings.auto_block_rehearsals,
        regions: getRegions(),
    });
}));

/**
 * PUT /holidays/settings - Update association holiday settings
 * IMPORTANT: This route must be defined BEFORE /:id routes
 */
router.put('/settings', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user!.associationId) {
        throw new ApiError(400, 'Geen vereniging geselecteerd.');
    }
    const { region, showHolidaysInCalendar, autoBlockRehearsals } = req.body;

    // Validate region if provided
    if (region) {
        const validRegions = ['noord', 'midden', 'zuid'];
        if (!validRegions.includes(region)) {
            throw new ApiError(400, 'Ongeldige regio. Kies uit: noord, midden, zuid.');
        }
    }

    // Ensure settings exist
    getOrCreateSettings(req.user!.associationId);

    db.prepare(`
        UPDATE association_holiday_settings
        SET region = COALESCE(?, region),
            show_holidays_in_calendar = COALESCE(?, show_holidays_in_calendar),
            auto_block_rehearsals = COALESCE(?, auto_block_rehearsals),
            updated_at = CURRENT_TIMESTAMP
        WHERE association_id = ?
    `).run(
        region,
        showHolidaysInCalendar !== undefined ? (showHolidaysInCalendar ? 1 : 0) : null,
        autoBlockRehearsals !== undefined ? (autoBlockRehearsals ? 1 : 0) : null,
        req.user!.associationId
    );

    logger.info('Holiday settings updated', {
        associationId: req.user!.associationId,
        region,
        showHolidaysInCalendar,
        autoBlockRehearsals,
    });

    const updatedSettings = getOrCreateSettings(req.user!.associationId);

    res.json({
        message: 'Instellingen bijgewerkt.',
        settings: {
            region: updatedSettings.region,
            showHolidaysInCalendar: updatedSettings.show_holidays_in_calendar,
            autoBlockRehearsals: updatedSettings.auto_block_rehearsals,
        },
    });
}));

/**
 * GET /holidays/upcoming - Get upcoming holidays
 * Query params: limit (default 5)
 * IMPORTANT: This route must be defined BEFORE /:id routes
 */
router.get('/upcoming', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user!.associationId) {
        throw new ApiError(400, 'Geen vereniging geselecteerd.');
    }
    const settings = getOrCreateSettings(req.user!.associationId);
    const region = (settings.region || 'midden') as DutchRegion;
    const limit = parseInt(req.query.limit as string) || 5;

    const today = new Date().toISOString().split('T')[0];
    const oneYearLater = new Date();
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
    const endDate = oneYearLater.toISOString().split('T')[0];

    const systemHolidays = getHolidaysInRange(today, endDate, region);

    // Get custom holidays
    const customHolidays = db.prepare(`
        SELECT * FROM school_holidays
        WHERE association_id = ?
        AND end_date >= ?
        AND is_custom = TRUE
        ORDER BY start_date
    `).all(req.user!.associationId, today) as HolidayRow[];

    // Combine and format
    const allHolidays = [
        ...systemHolidays.map(h => ({
            id: `system-${h.holidayType}-${h.startDate}-${h.region}`,
            name: h.nameDutch,
            startDate: h.startDate,
            endDate: h.endDate,
            holidayType: h.holidayType,
            isCustom: false,
        })),
        ...customHolidays.map(h => ({
            id: h.id,
            name: h.name,
            startDate: h.start_date,
            endDate: h.end_date,
            holidayType: h.holiday_type,
            isCustom: true,
        })),
    ];

    // Sort by start date and filter future holidays
    const upcoming = allHolidays
        .filter(h => h.startDate >= today)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .slice(0, limit);

    res.json(upcoming);
}));

/**
 * PUT /holidays/:id - Update a custom holiday
 */
router.put('/:id', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user!.associationId) {
        throw new ApiError(400, 'Geen vereniging geselecteerd.');
    }
    const { id } = req.params;
    const { name, startDate, endDate, region, holidayType } = req.body;

    const existing = db.prepare(`
        SELECT id FROM school_holidays
        WHERE id = ? AND association_id = ? AND is_custom = TRUE
    `).get(id, req.user!.associationId) as { id: string } | undefined;

    if (!existing) {
        throw new ApiError(404, 'Aangepaste feestdag niet gevonden.');
    }

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        throw new ApiError(400, 'Startdatum moet voor einddatum liggen.');
    }

    const year = startDate ? parseInt(startDate.substring(0, 4)) : undefined;

    db.prepare(`
        UPDATE school_holidays
        SET name = COALESCE(?, name),
            start_date = COALESCE(?, start_date),
            end_date = COALESCE(?, end_date),
            region = COALESCE(?, region),
            holiday_type = COALESCE(?, holiday_type),
            year = COALESCE(?, year),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND association_id = ?
    `).run(name, startDate, endDate, region, holidayType, year, id, req.user!.associationId);

    res.json({ message: 'Feestdag bijgewerkt.' });
}));

/**
 * DELETE /holidays/:id - Delete a custom holiday
 */
router.delete('/:id', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user!.associationId) {
        throw new ApiError(400, 'Geen vereniging geselecteerd.');
    }
    const { id } = req.params;

    const result = db.prepare(`
        DELETE FROM school_holidays
        WHERE id = ? AND association_id = ? AND is_custom = TRUE
    `).run(id, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Aangepaste feestdag niet gevonden of is een systeemfeestdag.');
    }

    logger.info('Custom holiday deleted', { id, associationId: req.user!.associationId });

    res.json({ message: 'Feestdag verwijderd.' });
}));

export default router;
