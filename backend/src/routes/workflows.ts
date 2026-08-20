import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { executeWorkflow, processScheduledWorkflows, processDateFieldWorkflows } from '../services/workflowEngine';

const router = Router();

router.use(authenticateToken);
router.use(requireRole('admin'));

// Validation schemas
const triggerSchema = z.object({
  triggerType: z.enum(['schedule', 'event', 'date_field', 'manual']),
  eventName: z.string().optional(),
  scheduleCron: z.string().optional(),
  dateFieldEntity: z.string().optional(),
  dateFieldName: z.string().optional(),
  daysBefore: z.number().optional(),
  daysAfter: z.number().optional(),
  timeOfDay: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  conditions: z.any().optional(),
});

const actionSchema = z.object({
  actionType: z.enum(['send_email', 'send_notification', 'create_task', 'update_field', 'webhook', 'delay']),
  actionOrder: z.number().optional(),
  config: z.any(),
  conditions: z.any().optional(),
});

const createWorkflowSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  runOncePerEntity: z.boolean().optional(),
  triggers: z.array(triggerSchema).min(1),
  actions: z.array(actionSchema).min(1),
});

const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  runOncePerEntity: z.boolean().optional(),
});

// GET /api/workflows - List all workflows
router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const workflows = db
      .prepare(
        `
    SELECT w.*,
           u.first_name || ' ' || u.last_name as created_by_name,
           (SELECT COUNT(*) FROM workflow_triggers t WHERE t.workflow_id = w.id) as trigger_count,
           (SELECT COUNT(*) FROM workflow_actions a WHERE a.workflow_id = w.id) as action_count,
           (SELECT COUNT(*) FROM workflow_executions e WHERE e.workflow_id = w.id) as execution_count,
           (SELECT COUNT(*) FROM workflow_executions e WHERE e.workflow_id = w.id AND e.status = 'failed') as failed_count
    FROM workflows w
    LEFT JOIN users u ON w.created_by = u.id
    WHERE w.association_id = ? AND w.deleted_at IS NULL
    ORDER BY w.created_at DESC
  `,
      )
      .all(associationId);

    res.json(
      workflows.map((w: any) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        isActive: !!w.is_active,
        runOncePerEntity: !!w.run_once_per_entity,
        triggerCount: w.trigger_count,
        actionCount: w.action_count,
        executionCount: w.execution_count,
        failedCount: w.failed_count,
        createdByName: w.created_by_name,
        createdAt: w.created_at,
        updatedAt: w.updated_at,
      })),
    );
  }),
);

// GET /api/workflows/:id - Get single workflow with triggers and actions
router.get(
  '/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const workflow = db
      .prepare(
        `
    SELECT w.*, u.first_name || ' ' || u.last_name as created_by_name
    FROM workflows w
    LEFT JOIN users u ON w.created_by = u.id
    WHERE w.id = ? AND w.association_id = ? AND w.deleted_at IS NULL
  `,
      )
      .get(req.params.id, associationId) as any;

    if (!workflow) {
      throw new ApiError(404, 'Workflow not found');
    }

    const triggers = db
      .prepare(
        `
    SELECT * FROM workflow_triggers WHERE workflow_id = ? ORDER BY created_at
  `,
      )
      .all(workflow.id);

    const actions = db
      .prepare(
        `
    SELECT * FROM workflow_actions WHERE workflow_id = ? ORDER BY action_order
  `,
      )
      .all(workflow.id);

    res.json({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      isActive: !!workflow.is_active,
      runOncePerEntity: !!workflow.run_once_per_entity,
      createdBy: workflow.created_by,
      createdByName: workflow.created_by_name,
      createdAt: workflow.created_at,
      updatedAt: workflow.updated_at,
      triggers: triggers.map((t: any) => ({
        id: t.id,
        triggerType: t.trigger_type,
        eventName: t.event_name,
        scheduleCron: t.schedule_cron,
        dateFieldEntity: t.date_field_entity,
        dateFieldName: t.date_field_name,
        daysBefore: t.days_before,
        daysAfter: t.days_after,
        timeOfDay: t.time_of_day,
        conditions: t.conditions ? JSON.parse(t.conditions) : null,
        isActive: !!t.is_active,
      })),
      actions: actions.map((a: any) => ({
        id: a.id,
        actionType: a.action_type,
        actionOrder: a.action_order,
        config: a.config ? JSON.parse(a.config) : {},
        conditions: a.conditions ? JSON.parse(a.conditions) : null,
        isActive: !!a.is_active,
      })),
    });
  }),
);

// POST /api/workflows - Create workflow
router.post(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const data = createWorkflowSchema.parse(req.body);

    const workflowId = uuidv4();
    const now = new Date().toISOString();

    // Insert workflow
    db.prepare(
      `
    INSERT INTO workflows (id, association_id, name, description, is_active, run_once_per_entity, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    ).run(
      workflowId,
      associationId,
      data.name,
      data.description || null,
      data.isActive !== false ? 1 : 0,
      data.runOncePerEntity ? 1 : 0,
      req.user!.id,
      now,
      now,
    );

    // Insert triggers
    for (const trigger of data.triggers) {
      db.prepare(
        `
      INSERT INTO workflow_triggers (id, workflow_id, trigger_type, event_name, schedule_cron, date_field_entity, date_field_name, days_before, days_after, time_of_day, conditions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      ).run(
        uuidv4(),
        workflowId,
        trigger.triggerType,
        trigger.eventName || null,
        trigger.scheduleCron || null,
        trigger.dateFieldEntity || null,
        trigger.dateFieldName || null,
        trigger.daysBefore || 0,
        trigger.daysAfter || 0,
        trigger.timeOfDay || null,
        trigger.conditions ? JSON.stringify(trigger.conditions) : null,
      );
    }

    // Insert actions
    for (let i = 0; i < data.actions.length; i++) {
      const action = data.actions[i];
      db.prepare(
        `
      INSERT INTO workflow_actions (id, workflow_id, action_type, action_order, config, conditions)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      ).run(
        uuidv4(),
        workflowId,
        action.actionType,
        action.actionOrder ?? i,
        JSON.stringify(action.config),
        action.conditions ? JSON.stringify(action.conditions) : null,
      );
    }

    res.status(201).json({ id: workflowId, message: 'Workflow created' });
  }),
);

// PATCH /api/workflows/:id - Update workflow
router.patch(
  '/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const data = updateWorkflowSchema.parse(req.body);

    const workflow = db
      .prepare(`SELECT id FROM workflows WHERE id = ? AND association_id = ? AND deleted_at IS NULL`)
      .get(req.params.id, associationId);
    if (!workflow) {
      throw new ApiError(404, 'Workflow not found');
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description);
    }
    if (data.isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(data.isActive ? 1 : 0);
    }
    if (data.runOncePerEntity !== undefined) {
      updates.push('run_once_per_entity = ?');
      values.push(data.runOncePerEntity ? 1 : 0);
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(req.params.id);

    db.prepare(`UPDATE workflows SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    res.json({ message: 'Workflow updated' });
  }),
);

// DELETE /api/workflows/:id - Soft delete workflow
router.delete(
  '/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const result = db
      .prepare(
        `
    UPDATE workflows SET deleted_at = ? WHERE id = ? AND association_id = ? AND deleted_at IS NULL
  `,
      )
      .run(new Date().toISOString(), req.params.id, associationId);

    if (result.changes === 0) {
      throw new ApiError(404, 'Workflow not found');
    }

    res.json({ message: 'Workflow deleted' });
  }),
);

// POST /api/workflows/:id/triggers - Add trigger
router.post(
  '/:id/triggers',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const data = triggerSchema.parse(req.body);

    const workflow = db
      .prepare(`SELECT id FROM workflows WHERE id = ? AND association_id = ? AND deleted_at IS NULL`)
      .get(req.params.id, associationId);
    if (!workflow) {
      throw new ApiError(404, 'Workflow not found');
    }

    const id = uuidv4();

    db.prepare(
      `
    INSERT INTO workflow_triggers (id, workflow_id, trigger_type, event_name, schedule_cron, date_field_entity, date_field_name, days_before, days_after, time_of_day, conditions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    ).run(
      id,
      req.params.id,
      data.triggerType,
      data.eventName || null,
      data.scheduleCron || null,
      data.dateFieldEntity || null,
      data.dateFieldName || null,
      data.daysBefore || 0,
      data.daysAfter || 0,
      data.timeOfDay || null,
      data.conditions ? JSON.stringify(data.conditions) : null,
    );

    res.status(201).json({ id, message: 'Trigger added' });
  }),
);

// DELETE /api/workflows/:id/triggers/:triggerId - Remove trigger
//
// Het workflow-id komt uit het pad en zei op zichzelf niets over de vereniging.
// De buurroute die een trigger toevoegt controleert dat wel; deze bleef achter,
// waardoor elke beheerder de automatisering van een andere vereniging uit
// elkaar kon halen.
router.delete(
  '/:id/triggers/:triggerId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db
      .prepare(
        `DELETE FROM workflow_triggers
         WHERE id = ? AND workflow_id IN (
           SELECT id FROM workflows WHERE id = ? AND association_id = ? AND deleted_at IS NULL
         )`,
      )
      .run(req.params.triggerId, req.params.id, req.user!.associationId);

    if (result.changes === 0) {
      throw new ApiError(404, 'Trigger not found');
    }

    res.json({ message: 'Trigger removed' });
  }),
);

// POST /api/workflows/:id/actions - Add action
router.post(
  '/:id/actions',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const data = actionSchema.parse(req.body);

    const workflow = db
      .prepare(`SELECT id FROM workflows WHERE id = ? AND association_id = ? AND deleted_at IS NULL`)
      .get(req.params.id, associationId);
    if (!workflow) {
      throw new ApiError(404, 'Workflow not found');
    }

    // Get next action order
    const maxOrder = db
      .prepare(`SELECT COALESCE(MAX(action_order), -1) as max_order FROM workflow_actions WHERE workflow_id = ?`)
      .get(req.params.id) as any;

    const id = uuidv4();

    db.prepare(
      `
    INSERT INTO workflow_actions (id, workflow_id, action_type, action_order, config, conditions)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
    ).run(
      id,
      req.params.id,
      data.actionType,
      data.actionOrder ?? maxOrder.max_order + 1,
      JSON.stringify(data.config),
      data.conditions ? JSON.stringify(data.conditions) : null,
    );

    res.status(201).json({ id, message: 'Action added' });
  }),
);

// DELETE /api/workflows/:id/actions/:actionId - Remove action (zie de trigger hierboven)
router.delete(
  '/:id/actions/:actionId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db
      .prepare(
        `DELETE FROM workflow_actions
         WHERE id = ? AND workflow_id IN (
           SELECT id FROM workflows WHERE id = ? AND association_id = ? AND deleted_at IS NULL
         )`,
      )
      .run(req.params.actionId, req.params.id, req.user!.associationId);

    if (result.changes === 0) {
      throw new ApiError(404, 'Action not found');
    }

    res.json({ message: 'Action removed' });
  }),
);

// POST /api/workflows/:id/run - Manually run workflow
router.post(
  '/:id/run',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    if (!associationId) {
      throw new ApiError(400, 'Association ID required');
    }

    const workflow = db
      .prepare(
        `
    SELECT * FROM workflows WHERE id = ? AND association_id = ? AND deleted_at IS NULL
  `,
      )
      .get(req.params.id, associationId) as any;

    if (!workflow) {
      throw new ApiError(404, 'Workflow not found');
    }

    const result = await executeWorkflow(req.params.id, associationId, 'manual', req.user!.id);

    if (result.success) {
      res.json({ executionId: result.executionId, message: 'Workflow executed successfully' });
    } else {
      res.status(500).json({ executionId: result.executionId, message: 'Workflow failed', error: result.error });
    }
  }),
);

// POST /api/workflows/process-scheduled - de planning handmatig aftrappen
//
// Deze twee routes riepen de verwerking aan zonder vereniging, en dan gaat die
// over de hele installatie. Een beheerder van de ene vereniging kon daarmee de
// mails, meldingen en taken van elke andere vereniging laten afgaan, zo vaak
// als hij het verzoek herhaalde. De planner in scheduler/workflow-runner.ts
// roept dezelfde functies wel zonder vereniging aan; daar hoort dat ook.
router.post(
  '/process/scheduled',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    processScheduledWorkflows(req.user!.associationId!);
    res.json({ message: 'Scheduled workflows processing initiated' });
  }),
);

// POST /api/workflows/process-date-fields - idem voor de datumvelden
router.post(
  '/process/date-fields',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    processDateFieldWorkflows(req.user!.associationId!);
    res.json({ message: 'Date field workflows processing initiated' });
  }),
);

// GET /api/workflows/:id/executions - Get workflow execution history
router.get(
  '/:id/executions',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const workflow = db
      .prepare(`SELECT id FROM workflows WHERE id = ? AND association_id = ? AND deleted_at IS NULL`)
      .get(req.params.id, associationId);
    if (!workflow) {
      throw new ApiError(404, 'Workflow not found');
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const executions = db
      .prepare(
        `
    SELECT e.*, u.first_name || ' ' || u.last_name as triggered_by_name
    FROM workflow_executions e
    LEFT JOIN users u ON e.triggered_by_user_id = u.id
    WHERE e.workflow_id = ?
    ORDER BY e.created_at DESC
    LIMIT ? OFFSET ?
  `,
      )
      .all(req.params.id, limit, offset);

    const total = db
      .prepare(`SELECT COUNT(*) as count FROM workflow_executions WHERE workflow_id = ?`)
      .get(req.params.id) as any;

    res.json({
      executions: executions.map((e: any) => ({
        id: e.id,
        triggeredBy: e.triggered_by,
        triggeredByName: e.triggered_by_name,
        entityType: e.entity_type,
        entityId: e.entity_id,
        status: e.status,
        startedAt: e.started_at,
        completedAt: e.completed_at,
        errorMessage: e.error_message,
        createdAt: e.created_at,
      })),
      total: total.count,
      limit,
      offset,
    });
  }),
);

// GET /api/workflows/events - Get available event types for triggers
router.get('/events/available', (_req, res) => {
  res.json([
    { name: 'user.created', label: 'New member joined', entity: 'user' },
    { name: 'user.updated', label: 'Member updated', entity: 'user' },
    { name: 'concert.created', label: 'Concert created', entity: 'concert' },
    { name: 'concert.upcoming', label: 'Concert upcoming (X days before)', entity: 'concert' },
    { name: 'rehearsal.created', label: 'Rehearsal created', entity: 'rehearsal' },
    { name: 'rehearsal.reminder', label: 'Rehearsal reminder', entity: 'rehearsal' },
    { name: 'task.created', label: 'Task created', entity: 'task' },
    { name: 'task.due_soon', label: 'Task due soon', entity: 'task' },
    { name: 'membership.expiring', label: 'Membership expiring', entity: 'user' },
  ]);
});

export default router;
