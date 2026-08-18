import { Router, Response } from 'express';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import { z } from 'zod';
import {
  getUpcomingMaintenance,
  getOverdueMaintenance,
  getMaintenanceSchedule,
  logMaintenance,
  getMaintenanceLog,
  updateMaintenanceSettings,
  getMaintenanceCosts,
  getAssociationMaintenanceCosts,
  sendMaintenanceNotifications,
  runMaintenanceCheck,
} from '../services/maintenanceAlerts';
import db from '../database/connection';

const router = Router();

// Validation schemas
const logMaintenanceSchema = z.object({
  equipmentId: z.string().uuid('Geldig equipment ID is verplicht'),
  maintenanceDate: z.string().min(1, 'Datum is verplicht'),
  performedBy: z.string().optional(),
  description: z.string().min(1, 'Beschrijving is verplicht'),
  cost: z.number().min(0).optional(),
  notes: z.string().optional(),
});

const updateMaintenanceSettingsSchema = z.object({
  maintenanceIntervalMonths: z.number().int().min(1).max(60).optional(),
  lastMaintenanceDate: z.string().optional(),
  maintenanceNotes: z.string().optional(),
});

/**
 * @swagger
 * /maintenance/upcoming:
 *   get:
 *     summary: Get equipment with upcoming maintenance
 *     tags: [Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *         description: Number of days ahead to check (default 30)
 */
router.get(
  '/upcoming',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const daysAhead = parseInt(req.query.days as string) || 30;
    const items = getUpcomingMaintenance(req.user!.associationId!, daysAhead);
    res.json(items);
  }),
);

/**
 * @swagger
 * /maintenance/overdue:
 *   get:
 *     summary: Get equipment with overdue maintenance
 *     tags: [Maintenance]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/overdue',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const items = getOverdueMaintenance(req.user!.associationId!);
    res.json(items);
  }),
);

/**
 * @swagger
 * /maintenance/schedule:
 *   get:
 *     summary: Get full maintenance schedule
 *     tags: [Maintenance]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/schedule',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const schedule = getMaintenanceSchedule(req.user!.associationId!);
    res.json(schedule);
  }),
);

/**
 * @swagger
 * /maintenance/costs:
 *   get:
 *     summary: Get maintenance cost summary
 *     tags: [Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *         description: Start date for cost calculation (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *         description: End date for cost calculation (YYYY-MM-DD)
 */
router.get(
  '/costs',
  authenticateToken,
  requireRole('admin', 'equipment_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const costs = getAssociationMaintenanceCosts(req.user!.associationId!, startDate, endDate);
    res.json(costs);
  }),
);

/**
 * @swagger
 * /maintenance/log:
 *   post:
 *     summary: Log completed maintenance
 *     tags: [Maintenance]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/log',
  authenticateToken,
  requireRole('admin', 'equipment_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = logMaintenanceSchema.parse(req.body);

    // Verify equipment belongs to user's association
    const equipment = db
      .prepare('SELECT id FROM equipment WHERE id = ? AND association_id = ?')
      .get(data.equipmentId, req.user!.associationId);

    if (!equipment) {
      throw new ApiError(404, 'Instrument niet gevonden.');
    }

    const id = logMaintenance(
      data.equipmentId,
      {
        maintenanceDate: data.maintenanceDate,
        performedBy: data.performedBy,
        description: data.description,
        cost: data.cost,
        notes: data.notes,
      },
      req.user!.id,
    );

    logger.info('Maintenance logged via API', { id, equipmentId: data.equipmentId, userId: req.user!.id });

    res.status(201).json({ id, message: 'Onderhoud geregistreerd.' });
  }),
);

/**
 * @swagger
 * /maintenance/log/{equipmentId}:
 *   get:
 *     summary: Get maintenance history for an equipment item
 *     tags: [Maintenance]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/log/:equipmentId',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // Verify equipment belongs to user's association
    const equipment = db
      .prepare('SELECT id FROM equipment WHERE id = ? AND association_id = ?')
      .get(req.params.equipmentId, req.user!.associationId);

    if (!equipment) {
      throw new ApiError(404, 'Instrument niet gevonden.');
    }

    const logs = getMaintenanceLog(req.params.equipmentId);
    const costs = getMaintenanceCosts(req.params.equipmentId);

    res.json({
      logs,
      totalCost: costs.total,
      maintenanceCount: costs.count,
    });
  }),
);

/**
 * @swagger
 * /maintenance/check:
 *   post:
 *     summary: Trigger maintenance check and send notifications
 *     tags: [Maintenance]
 *     security:
 *       - bearerAuth: []
 *     description: Manually trigger the maintenance check job. This is typically called by a cron job.
 */
router.post(
  '/check',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await sendMaintenanceNotifications(req.user!.associationId!);

    logger.info('Manual maintenance check triggered', {
      associationId: req.user!.associationId!,
      triggeredBy: req.user!.id,
      ...result,
    });

    res.json({
      message: 'Onderhoudscontrole uitgevoerd.',
      notificationsSent: result.sent,
      errors: result.errors,
    });
  }),
);

/**
 * @swagger
 * /maintenance/check-all:
 *   post:
 *     summary: Run maintenance check for all associations (super admin only)
 *     tags: [Maintenance]
 *     security:
 *       - bearerAuth: []
 *     description: Run the daily maintenance check for all associations. This endpoint is intended for cron jobs.
 */
router.post(
  '/check-all',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    await runMaintenanceCheck();

    logger.info('Global maintenance check triggered', { triggeredBy: req.user!.id });

    res.json({ message: 'Onderhoudscontrole voor alle verenigingen uitgevoerd.' });
  }),
);

export default router;
