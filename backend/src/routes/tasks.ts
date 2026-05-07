import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { cacheMiddleware, cacheInvalidator } from '../middleware/cache';
import logger from '../utils/logger';
import { logAuditEvent } from './audit-logs';
import { z } from 'zod';

const router = Router();

const CACHE_PATH = '/api/tasks';
const LISTS_CACHE_PATH = '/api/tasks/lists';

// Validation schemas
const createTaskListSchema = z.object({
    name: z.string().min(1, 'Naam is verplicht.'),
    description: z.string().optional(),
    color: z.string().optional(),
    icon: z.string().optional(),
});

const updateTaskListSchema = createTaskListSchema.partial();

const createTaskSchema = z.object({
    title: z.string().min(1, 'Titel is verplicht.'),
    description: z.string().optional(),
    taskListId: z.string().uuid().optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
    dueDate: z.string().datetime().optional(),
    reminderAt: z.string().datetime().optional(),
    estimatedHours: z.number().positive().optional(),
    assignedTo: z.string().uuid().optional(),
    relatedEntityType: z.string().optional(),
    relatedEntityId: z.string().uuid().optional(),
});

const updateTaskSchema = z.object({
    title: z.string().min(1).optional(),
    description: z.string().optional().nullable(),
    taskListId: z.string().uuid().optional().nullable(),
    status: z.enum(['todo', 'in_progress', 'review', 'done', 'cancelled']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    dueDate: z.string().datetime().optional().nullable(),
    reminderAt: z.string().datetime().optional().nullable(),
    estimatedHours: z.number().positive().optional().nullable(),
    actualHours: z.number().positive().optional().nullable(),
    assignedTo: z.string().uuid().optional().nullable(),
});

const checklistItemSchema = z.object({
    content: z.string().min(1, 'Inhoud is verplicht.'),
});

const commentSchema = z.object({
    content: z.string().min(1, 'Reactie mag niet leeg zijn.'),
});

// =====================================================
// TASK LIST ROUTES
// =====================================================

router.get('/lists', authenticateToken, cacheMiddleware({ ttlSeconds: 300 }), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const lists = db.prepare(`
        SELECT tl.*,
            (SELECT COUNT(*) FROM tasks t WHERE t.task_list_id = tl.id AND t.status != 'done' AND t.status != 'cancelled') AS open_count,
            (SELECT COUNT(*) FROM tasks t WHERE t.task_list_id = tl.id) AS total_count
        FROM task_lists tl
        WHERE tl.association_id = ? AND tl.is_archived = 0
        ORDER BY tl.sort_order, tl.name
    `).all(associationId);

    res.json(lists.map((l: any) => ({
        id: l.id,
        name: l.name,
        description: l.description,
        color: l.color,
        icon: l.icon,
        sortOrder: l.sort_order,
        openCount: l.open_count,
        totalCount: l.total_count,
        createdAt: l.created_at,
    })));
}));

router.post('/lists', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(LISTS_CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createTaskListSchema.parse(req.body);
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
        INSERT INTO task_lists (id, association_id, name, description, color, icon, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, associationId, data.name, data.description || null, data.color || null, data.icon || null, req.user!.id, now, now);

    res.status(201).json({
        id,
        name: data.name,
        message: 'Takenlijst aangemaakt.',
    });
}));

router.put('/lists/:id', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(LISTS_CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateTaskListSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const list = db.prepare(
        'SELECT id FROM task_lists WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId);

    if (!list) {
        throw new ApiError(404, 'Takenlijst niet gevonden.');
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) {
        updates.push('name = ?');
        params.push(data.name);
    }
    if (data.description !== undefined) {
        updates.push('description = ?');
        params.push(data.description);
    }
    if (data.color !== undefined) {
        updates.push('color = ?');
        params.push(data.color);
    }
    if (data.icon !== undefined) {
        updates.push('icon = ?');
        params.push(data.icon);
    }

    if (updates.length > 0) {
        updates.push('updated_at = ?');
        params.push(new Date().toISOString());
        params.push(req.params.id);

        db.prepare(`UPDATE task_lists SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    res.json({ message: 'Takenlijst bijgewerkt.' });
}));

router.delete('/lists/:id', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(LISTS_CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const list = db.prepare(
        'SELECT id FROM task_lists WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId);

    if (!list) {
        throw new ApiError(404, 'Takenlijst niet gevonden.');
    }

    db.prepare('UPDATE tasks SET task_list_id = NULL WHERE task_list_id = ?').run(req.params.id);
    db.prepare('DELETE FROM task_lists WHERE id = ?').run(req.params.id);

    res.json({ message: 'Takenlijst verwijderd.' });
}));

// =====================================================
// TASK ROUTES
// =====================================================

router.get('/', authenticateToken, cacheMiddleware({ ttlSeconds: 60 }), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const { status, priority, listId, assignedTo, search, showCompleted } = req.query;

    let query = `
        SELECT t.*,
            tl.name AS list_name,
            tl.color AS list_color,
            u1.first_name || ' ' || u1.last_name AS created_by_name,
            u2.first_name || ' ' || u2.last_name AS assigned_to_name,
            (SELECT COUNT(*) FROM task_checklist_items tci WHERE tci.task_id = t.id) AS checklist_total,
            (SELECT COUNT(*) FROM task_checklist_items tci WHERE tci.task_id = t.id AND tci.is_completed = 1) AS checklist_done
        FROM tasks t
        LEFT JOIN task_lists tl ON t.task_list_id = tl.id
        LEFT JOIN users u1 ON t.created_by = u1.id
        LEFT JOIN users u2 ON t.assigned_to = u2.id
        WHERE t.association_id = ?
    `;
    const params: any[] = [associationId];

    if (!showCompleted || showCompleted === 'false') {
        query += ' AND t.status NOT IN (?, ?)';
        params.push('done', 'cancelled');
    }

    if (status) {
        query += ' AND t.status = ?';
        params.push(status);
    }

    if (priority) {
        query += ' AND t.priority = ?';
        params.push(priority);
    }

    if (listId) {
        if (listId === 'none') {
            query += ' AND t.task_list_id IS NULL';
        } else {
            query += ' AND t.task_list_id = ?';
            params.push(listId);
        }
    }

    if (assignedTo) {
        if (assignedTo === 'me') {
            query += ' AND t.assigned_to = ?';
            params.push(req.user!.id);
        } else if (assignedTo === 'unassigned') {
            query += ' AND t.assigned_to IS NULL';
        } else {
            query += ' AND t.assigned_to = ?';
            params.push(assignedTo);
        }
    }

    if (search) {
        query += ' AND (t.title LIKE ? OR t.description LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY t.priority DESC, t.due_date ASC NULLS LAST, t.created_at DESC';

    const tasks = db.prepare(query).all(...params);

    res.json(tasks.map((t: any) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        taskListId: t.task_list_id,
        listName: t.list_name,
        listColor: t.list_color,
        status: t.status,
        priority: t.priority,
        dueDate: t.due_date,
        reminderAt: t.reminder_at,
        estimatedHours: t.estimated_hours,
        actualHours: t.actual_hours,
        createdBy: t.created_by,
        createdByName: t.created_by_name,
        assignedTo: t.assigned_to,
        assignedToName: t.assigned_to_name,
        checklistTotal: t.checklist_total,
        checklistDone: t.checklist_done,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        completedAt: t.completed_at,
    })));
}));

router.get('/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const task = db.prepare(`
        SELECT t.*,
            tl.name AS list_name,
            tl.color AS list_color,
            u1.first_name || ' ' || u1.last_name AS created_by_name,
            u2.first_name || ' ' || u2.last_name AS assigned_to_name
        FROM tasks t
        LEFT JOIN task_lists tl ON t.task_list_id = tl.id
        LEFT JOIN users u1 ON t.created_by = u1.id
        LEFT JOIN users u2 ON t.assigned_to = u2.id
        WHERE t.id = ? AND t.association_id = ?
    `).get(req.params.id, associationId) as any;

    if (!task) {
        throw new ApiError(404, 'Taak niet gevonden.');
    }

    const checklist = db.prepare(`
        SELECT tci.*, u.first_name || ' ' || u.last_name AS completed_by_name
        FROM task_checklist_items tci
        LEFT JOIN users u ON tci.completed_by = u.id
        WHERE tci.task_id = ?
        ORDER BY tci.sort_order, tci.created_at
    `).all(req.params.id);

    const comments = db.prepare(`
        SELECT tc.*, u.first_name || ' ' || u.last_name AS author_name
        FROM task_comments tc
        JOIN users u ON tc.user_id = u.id
        WHERE tc.task_id = ?
        ORDER BY tc.created_at ASC
    `).all(req.params.id);

    const assignments = db.prepare(`
        SELECT ta.*, u.first_name || ' ' || u.last_name AS user_name
        FROM task_assignments ta
        JOIN users u ON ta.user_id = u.id
        WHERE ta.task_id = ?
    `).all(req.params.id);

    res.json({
        id: task.id,
        title: task.title,
        description: task.description,
        taskListId: task.task_list_id,
        listName: task.list_name,
        listColor: task.list_color,
        status: task.status,
        priority: task.priority,
        dueDate: task.due_date,
        reminderAt: task.reminder_at,
        estimatedHours: task.estimated_hours,
        actualHours: task.actual_hours,
        relatedEntityType: task.related_entity_type,
        relatedEntityId: task.related_entity_id,
        createdBy: task.created_by,
        createdByName: task.created_by_name,
        assignedTo: task.assigned_to,
        assignedToName: task.assigned_to_name,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        completedAt: task.completed_at,
        checklist: checklist.map((c: any) => ({
            id: c.id,
            content: c.content,
            isCompleted: !!c.is_completed,
            sortOrder: c.sort_order,
            completedBy: c.completed_by,
            completedByName: c.completed_by_name,
            completedAt: c.completed_at,
        })),
        comments: comments.map((c: any) => ({
            id: c.id,
            content: c.content,
            authorId: c.user_id,
            authorName: c.author_name,
            createdAt: c.created_at,
            updatedAt: c.updated_at,
        })),
        assignments: assignments.map((a: any) => ({
            userId: a.user_id,
            userName: a.user_name,
            assignedAt: a.assigned_at,
        })),
    });
}));

router.post('/', authenticateToken, cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createTaskSchema.parse(req.body);
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    if (data.taskListId) {
        const list = db.prepare(
            'SELECT id FROM task_lists WHERE id = ? AND association_id = ?'
        ).get(data.taskListId, associationId);
        if (!list) {
            throw new ApiError(404, 'Takenlijst niet gevonden.');
        }
    }

    const taskId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
        INSERT INTO tasks (
            id, association_id, task_list_id, title, description, status, priority,
            due_date, reminder_at, estimated_hours, related_entity_type, related_entity_id,
            created_by, assigned_to, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        taskId,
        associationId,
        data.taskListId || null,
        data.title,
        data.description || null,
        data.priority,
        data.dueDate || null,
        data.reminderAt || null,
        data.estimatedHours || null,
        data.relatedEntityType || null,
        data.relatedEntityId || null,
        req.user!.id,
        data.assignedTo || null,
        now,
        now
    );

    logAuditEvent(
        req.user!.id,
        'task_created',
        'task',
        taskId,
        data.title
    );

    logger.info(`Task created: ${data.title}`, { taskId, createdBy: req.user!.id });

    res.status(201).json({
        id: taskId,
        message: 'Taak aangemaakt.',
    });
}));

router.put('/:id', authenticateToken, cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateTaskSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const task = db.prepare(
        'SELECT * FROM tasks WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!task) {
        throw new ApiError(404, 'Taak niet gevonden.');
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.title !== undefined) {
        updates.push('title = ?');
        params.push(data.title);
    }
    if (data.description !== undefined) {
        updates.push('description = ?');
        params.push(data.description);
    }
    if (data.taskListId !== undefined) {
        updates.push('task_list_id = ?');
        params.push(data.taskListId);
    }
    if (data.status !== undefined) {
        updates.push('status = ?');
        params.push(data.status);

        if (data.status === 'done' && task.status !== 'done') {
            updates.push('completed_at = ?');
            params.push(new Date().toISOString());
        } else if (data.status !== 'done' && task.status === 'done') {
            updates.push('completed_at = ?');
            params.push(null);
        }
    }
    if (data.priority !== undefined) {
        updates.push('priority = ?');
        params.push(data.priority);
    }
    if (data.dueDate !== undefined) {
        updates.push('due_date = ?');
        params.push(data.dueDate);
    }
    if (data.reminderAt !== undefined) {
        updates.push('reminder_at = ?');
        params.push(data.reminderAt);
    }
    if (data.estimatedHours !== undefined) {
        updates.push('estimated_hours = ?');
        params.push(data.estimatedHours);
    }
    if (data.actualHours !== undefined) {
        updates.push('actual_hours = ?');
        params.push(data.actualHours);
    }
    if (data.assignedTo !== undefined) {
        updates.push('assigned_to = ?');
        params.push(data.assignedTo);
    }

    if (updates.length > 0) {
        updates.push('updated_at = ?');
        params.push(new Date().toISOString());
        params.push(req.params.id);

        db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    res.json({ message: 'Taak bijgewerkt.' });
}));

router.delete('/:id', authenticateToken, cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const task = db.prepare(
        'SELECT * FROM tasks WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!task) {
        throw new ApiError(404, 'Taak niet gevonden.');
    }

    db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);

    logAuditEvent(
        req.user!.id,
        'task_deleted',
        'task',
        req.params.id,
        task.title
    );

    res.json({ message: 'Taak verwijderd.' });
}));

// =====================================================
// CHECKLIST ROUTES
// =====================================================

router.post('/:id/checklist', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = checklistItemSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const task = db.prepare(
        'SELECT id FROM tasks WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId);

    if (!task) {
        throw new ApiError(404, 'Taak niet gevonden.');
    }

    const maxOrder = db.prepare(
        'SELECT MAX(sort_order) as max FROM task_checklist_items WHERE task_id = ?'
    ).get(req.params.id) as any;

    const itemId = uuidv4();
    db.prepare(`
        INSERT INTO task_checklist_items (id, task_id, content, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(itemId, req.params.id, data.content, (maxOrder.max || 0) + 1, new Date().toISOString());

    res.status(201).json({
        id: itemId,
        content: data.content,
        isCompleted: false,
        message: 'Checklist item toegevoegd.',
    });
}));

router.put('/:taskId/checklist/:itemId', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { content, isCompleted } = req.body;
    const associationId = req.user!.associationId;

    const task = db.prepare(
        'SELECT id FROM tasks WHERE id = ? AND association_id = ?'
    ).get(req.params.taskId, associationId);

    if (!task) {
        throw new ApiError(404, 'Taak niet gevonden.');
    }

    const item = db.prepare(
        'SELECT * FROM task_checklist_items WHERE id = ? AND task_id = ?'
    ).get(req.params.itemId, req.params.taskId) as any;

    if (!item) {
        throw new ApiError(404, 'Checklist item niet gevonden.');
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (content !== undefined) {
        updates.push('content = ?');
        params.push(content);
    }

    if (isCompleted !== undefined) {
        updates.push('is_completed = ?');
        params.push(isCompleted ? 1 : 0);

        if (isCompleted && !item.is_completed) {
            updates.push('completed_by = ?');
            updates.push('completed_at = ?');
            params.push(req.user!.id);
            params.push(new Date().toISOString());
        } else if (!isCompleted && item.is_completed) {
            updates.push('completed_by = ?');
            updates.push('completed_at = ?');
            params.push(null);
            params.push(null);
        }
    }

    if (updates.length > 0) {
        params.push(req.params.itemId);
        db.prepare(`UPDATE task_checklist_items SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    res.json({ message: 'Checklist item bijgewerkt.' });
}));

router.delete('/:taskId/checklist/:itemId', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const task = db.prepare(
        'SELECT id FROM tasks WHERE id = ? AND association_id = ?'
    ).get(req.params.taskId, associationId);

    if (!task) {
        throw new ApiError(404, 'Taak niet gevonden.');
    }

    db.prepare('DELETE FROM task_checklist_items WHERE id = ? AND task_id = ?')
        .run(req.params.itemId, req.params.taskId);

    res.json({ message: 'Checklist item verwijderd.' });
}));

// =====================================================
// COMMENT ROUTES
// =====================================================

router.post('/:id/comments', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = commentSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const task = db.prepare(
        'SELECT id FROM tasks WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId);

    if (!task) {
        throw new ApiError(404, 'Taak niet gevonden.');
    }

    const commentId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
        INSERT INTO task_comments (id, task_id, user_id, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(commentId, req.params.id, req.user!.id, data.content, now, now);

    const user = db.prepare(
        'SELECT first_name, last_name FROM users WHERE id = ?'
    ).get(req.user!.id) as any;

    res.status(201).json({
        id: commentId,
        content: data.content,
        authorId: req.user!.id,
        authorName: user ? `${user.first_name} ${user.last_name}` : 'Onbekend',
        createdAt: now,
        message: 'Reactie geplaatst.',
    });
}));

router.delete('/:taskId/comments/:commentId', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const isAdmin = ['admin', 'music_committee'].includes(req.user!.role);

    const task = db.prepare(
        'SELECT id FROM tasks WHERE id = ? AND association_id = ?'
    ).get(req.params.taskId, associationId);

    if (!task) {
        throw new ApiError(404, 'Taak niet gevonden.');
    }

    const comment = db.prepare(
        'SELECT * FROM task_comments WHERE id = ? AND task_id = ?'
    ).get(req.params.commentId, req.params.taskId) as any;

    if (!comment) {
        throw new ApiError(404, 'Reactie niet gevonden.');
    }

    if (comment.user_id !== req.user!.id && !isAdmin) {
        throw new ApiError(403, 'Je kunt alleen je eigen reacties verwijderen.');
    }

    db.prepare('DELETE FROM task_comments WHERE id = ?').run(req.params.commentId);

    res.json({ message: 'Reactie verwijderd.' });
}));

export default router;
