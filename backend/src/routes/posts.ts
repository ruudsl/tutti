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

const CACHE_PATH = '/api/posts';
const CATEGORIES_CACHE_PATH = '/api/posts/categories';

// Validation schemas
const createCategorySchema = z.object({
    name: z.string().min(1, 'Naam is verplicht.'),
    slug: z.string().min(1, 'Slug is verplicht.').regex(/^[a-z0-9-]+$/, 'Slug mag alleen kleine letters, cijfers en streepjes bevatten.'),
    description: z.string().optional(),
    color: z.string().optional(),
    icon: z.string().optional(),
});

const updateCategorySchema = createCategorySchema.partial();

const createPostSchema = z.object({
    title: z.string().min(1, 'Titel is verplicht.'),
    slug: z.string().optional(),
    excerpt: z.string().optional(),
    content: z.string().min(1, 'Inhoud is verplicht.'),
    contentFormat: z.enum(['markdown', 'html']).default('markdown'),
    featuredImage: z.string().optional(),
    status: z.enum(['draft', 'published', 'archived']).default('draft'),
    isPinned: z.boolean().default(false),
    isFeatured: z.boolean().default(false),
    allowComments: z.boolean().default(true),
    categoryIds: z.array(z.string().uuid()).optional(),
    targetOrchestras: z.array(z.string().uuid()).optional(),
    targetRoles: z.array(z.string()).optional(),
    publishedAt: z.string().datetime().optional(),
});

const updatePostSchema = createPostSchema.partial();

const commentSchema = z.object({
    content: z.string().min(1, 'Reactie mag niet leeg zijn.'),
    parentId: z.string().uuid().optional(),
});

function generateSlug(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 100);
}

function canUserSeePost(post: any, user: any): boolean {
    if (!post.target_orchestras && !post.target_roles) {
        return true;
    }

    const targetOrchestras = post.target_orchestras ? JSON.parse(post.target_orchestras) : null;
    const targetRoles = post.target_roles ? JSON.parse(post.target_roles) : null;

    if (targetRoles && targetRoles.length > 0) {
        if (!targetRoles.includes(user.role)) {
            return false;
        }
    }

    if (targetOrchestras && targetOrchestras.length > 0) {
        const userOrchestras = db.prepare(
            'SELECT orchestra_id FROM user_orchestras WHERE user_id = ?'
        ).all(user.id).map((r: any) => r.orchestra_id);

        const hasMatch = targetOrchestras.some((o: string) => userOrchestras.includes(o));
        if (!hasMatch) {
            return false;
        }
    }

    return true;
}

// =====================================================
// CATEGORY ROUTES
// =====================================================

router.get('/categories', authenticateToken, cacheMiddleware({ ttlSeconds: 300 }), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const categories = db.prepare(`
        SELECT pc.*,
            (SELECT COUNT(*) FROM post_category_mapping pcm
             JOIN posts p ON pcm.post_id = p.id
             WHERE pcm.category_id = pc.id AND p.status = 'published') AS post_count
        FROM post_categories pc
        WHERE pc.association_id = ?
        ORDER BY pc.sort_order, pc.name
    `).all(associationId);

    res.json(categories.map((c: any) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        color: c.color,
        icon: c.icon,
        sortOrder: c.sort_order,
        postCount: c.post_count,
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
        'SELECT id FROM post_categories WHERE association_id = ? AND slug = ?'
    ).get(associationId, data.slug);

    if (existing) {
        throw new ApiError(409, `Categorie met slug "${data.slug}" bestaat al.`);
    }

    const id = uuidv4();
    db.prepare(`
        INSERT INTO post_categories (id, association_id, name, slug, description, color, icon)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, associationId, data.name, data.slug, data.description || null, data.color || null, data.icon || null);

    res.status(201).json({
        id,
        name: data.name,
        slug: data.slug,
        message: 'Categorie aangemaakt.',
    });
}));

router.put('/categories/:id', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(CATEGORIES_CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateCategorySchema.parse(req.body);
    const associationId = req.user!.associationId;

    const category = db.prepare(
        'SELECT id FROM post_categories WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId);

    if (!category) {
        throw new ApiError(404, 'Categorie niet gevonden.');
    }

    if (data.slug) {
        const existing = db.prepare(
            'SELECT id FROM post_categories WHERE association_id = ? AND slug = ? AND id != ?'
        ).get(associationId, data.slug, req.params.id);

        if (existing) {
            throw new ApiError(409, `Categorie met slug "${data.slug}" bestaat al.`);
        }
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) {
        updates.push('name = ?');
        params.push(data.name);
    }
    if (data.slug !== undefined) {
        updates.push('slug = ?');
        params.push(data.slug);
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
        params.push(req.params.id);
        db.prepare(`UPDATE post_categories SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    res.json({ message: 'Categorie bijgewerkt.' });
}));

router.delete('/categories/:id', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(CATEGORIES_CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const category = db.prepare(
        'SELECT id FROM post_categories WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId);

    if (!category) {
        throw new ApiError(404, 'Categorie niet gevonden.');
    }

    db.prepare('DELETE FROM post_category_mapping WHERE category_id = ?').run(req.params.id);
    db.prepare('DELETE FROM post_categories WHERE id = ?').run(req.params.id);

    res.json({ message: 'Categorie verwijderd.' });
}));

// =====================================================
// POST ROUTES
// =====================================================

router.get('/', authenticateToken, cacheMiddleware({ ttlSeconds: 60 }), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const { status, category, search, featured, pinned } = req.query;
    const isAdmin = ['admin', 'music_committee'].includes(req.user!.role);

    let query = `
        SELECT p.*,
            u.first_name || ' ' || u.last_name AS author_name,
            (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id AND pc.deleted_at IS NULL) AS comment_count
        FROM posts p
        LEFT JOIN users u ON p.created_by = u.id
        WHERE p.association_id = ?
    `;
    const params: any[] = [associationId];

    if (!isAdmin) {
        query += " AND p.status = 'published'";
    } else if (status) {
        query += ' AND p.status = ?';
        params.push(status);
    }

    if (category) {
        query += ' AND EXISTS (SELECT 1 FROM post_category_mapping pcm WHERE pcm.post_id = p.id AND pcm.category_id = ?)';
        params.push(category);
    }

    if (search) {
        query += ' AND (p.title LIKE ? OR p.excerpt LIKE ? OR p.content LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (featured === 'true') {
        query += ' AND p.is_featured = 1';
    }

    if (pinned === 'true') {
        query += ' AND p.is_pinned = 1';
    }

    query += ' ORDER BY p.is_pinned DESC, p.published_at DESC NULLS LAST, p.created_at DESC';

    const posts = db.prepare(query).all(...params);

    const result = posts
        .filter((p: any) => isAdmin || canUserSeePost(p, req.user!))
        .map((p: any) => {
            const categories = db.prepare(`
                SELECT pc.id, pc.name, pc.slug, pc.color
                FROM post_categories pc
                JOIN post_category_mapping pcm ON pc.id = pcm.category_id
                WHERE pcm.post_id = ?
            `).all(p.id);

            const isRead = db.prepare(
                'SELECT 1 FROM post_reads WHERE post_id = ? AND user_id = ?'
            ).get(p.id, req.user!.id);

            return {
                id: p.id,
                title: p.title,
                slug: p.slug,
                excerpt: p.excerpt,
                featuredImage: p.featured_image,
                status: p.status,
                isPinned: !!p.is_pinned,
                isFeatured: !!p.is_featured,
                allowComments: !!p.allow_comments,
                viewCount: p.view_count,
                authorId: p.created_by,
                authorName: p.author_name,
                publishedAt: p.published_at,
                createdAt: p.created_at,
                categories,
                commentCount: p.comment_count,
                isRead: !!isRead,
            };
        });

    res.json(result);
}));

router.get('/:idOrSlug', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    let post = db.prepare(`
        SELECT p.*, u.first_name || ' ' || u.last_name AS author_name
        FROM posts p
        LEFT JOIN users u ON p.created_by = u.id
        WHERE (p.id = ? OR p.slug = ?) AND p.association_id = ?
    `).get(req.params.idOrSlug, req.params.idOrSlug, associationId) as any;

    if (!post) {
        throw new ApiError(404, 'Bericht niet gevonden.');
    }

    const isAdmin = ['admin', 'music_committee'].includes(req.user!.role);
    const isAuthor = post.created_by === req.user!.id;

    if (!isAdmin && !isAuthor && post.status !== 'published') {
        throw new ApiError(404, 'Bericht niet gevonden.');
    }

    if (!isAdmin && !isAuthor && !canUserSeePost(post, req.user!)) {
        throw new ApiError(403, 'Je hebt geen toegang tot dit bericht.');
    }

    // Get categories
    const categories = db.prepare(`
        SELECT pc.id, pc.name, pc.slug, pc.color
        FROM post_categories pc
        JOIN post_category_mapping pcm ON pc.id = pcm.category_id
        WHERE pcm.post_id = ?
    `).all(post.id);

    // Get comments
    let comments: any[] = [];
    if (post.allow_comments) {
        comments = db.prepare(`
            SELECT pc.*, u.first_name || ' ' || u.last_name AS author_name
            FROM post_comments pc
            JOIN users u ON pc.user_id = u.id
            WHERE pc.post_id = ? AND pc.deleted_at IS NULL
            ORDER BY pc.created_at ASC
        `).all(post.id);
    }

    // Mark as read and increment view count
    if (post.status === 'published') {
        db.prepare(`
            INSERT OR IGNORE INTO post_reads (post_id, user_id, read_at)
            VALUES (?, ?, ?)
        `).run(post.id, req.user!.id, new Date().toISOString());

        db.prepare('UPDATE posts SET view_count = view_count + 1 WHERE id = ?').run(post.id);
    }

    res.json({
        id: post.id,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        content: post.content,
        contentFormat: post.content_format,
        featuredImage: post.featured_image,
        status: post.status,
        isPinned: !!post.is_pinned,
        isFeatured: !!post.is_featured,
        allowComments: !!post.allow_comments,
        viewCount: post.view_count + 1,
        targetOrchestras: post.target_orchestras ? JSON.parse(post.target_orchestras) : null,
        targetRoles: post.target_roles ? JSON.parse(post.target_roles) : null,
        authorId: post.created_by,
        authorName: post.author_name,
        publishedAt: post.published_at,
        createdAt: post.created_at,
        updatedAt: post.updated_at,
        categories,
        comments: comments.map((c: any) => ({
            id: c.id,
            content: c.content,
            authorId: c.user_id,
            authorName: c.author_name,
            parentId: c.parent_id,
            isApproved: !!c.is_approved,
            createdAt: c.created_at,
            updatedAt: c.updated_at,
        })),
    });
}));

router.post('/', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createPostSchema.parse(req.body);
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const slug = data.slug || generateSlug(data.title);

    // Check slug uniqueness
    const existingSlug = db.prepare(
        'SELECT id FROM posts WHERE association_id = ? AND slug = ?'
    ).get(associationId, slug);

    const finalSlug = existingSlug ? `${slug}-${Date.now()}` : slug;

    const postId = uuidv4();
    const now = new Date().toISOString();
    const publishedAt = data.status === 'published' ? (data.publishedAt || now) : null;

    db.prepare(`
        INSERT INTO posts (
            id, association_id, title, slug, excerpt, content, content_format,
            featured_image, status, is_pinned, is_featured, allow_comments,
            target_orchestras, target_roles, published_at, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        postId,
        associationId,
        data.title,
        finalSlug,
        data.excerpt || null,
        data.content,
        data.contentFormat,
        data.featuredImage || null,
        data.status,
        data.isPinned ? 1 : 0,
        data.isFeatured ? 1 : 0,
        data.allowComments ? 1 : 0,
        data.targetOrchestras ? JSON.stringify(data.targetOrchestras) : null,
        data.targetRoles ? JSON.stringify(data.targetRoles) : null,
        publishedAt,
        req.user!.id,
        now,
        now
    );

    // Add categories
    if (data.categoryIds && data.categoryIds.length > 0) {
        const insertCategory = db.prepare(
            'INSERT INTO post_category_mapping (post_id, category_id) VALUES (?, ?)'
        );
        data.categoryIds.forEach((catId) => {
            insertCategory.run(postId, catId);
        });
    }

    logAuditEvent(
        req.user!.id,
        'post_created',
        'post',
        postId,
        data.title
    );

    logger.info(`Post created: ${data.title}`, { postId, createdBy: req.user!.id });

    res.status(201).json({
        id: postId,
        slug: finalSlug,
        message: 'Bericht aangemaakt.',
    });
}));

router.put('/:id', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updatePostSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const post = db.prepare(
        'SELECT * FROM posts WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!post) {
        throw new ApiError(404, 'Bericht niet gevonden.');
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.title !== undefined) {
        updates.push('title = ?');
        params.push(data.title);
    }
    if (data.slug !== undefined) {
        const existingSlug = db.prepare(
            'SELECT id FROM posts WHERE association_id = ? AND slug = ? AND id != ?'
        ).get(associationId, data.slug, req.params.id);

        if (existingSlug) {
            throw new ApiError(409, `Slug "${data.slug}" is al in gebruik.`);
        }
        updates.push('slug = ?');
        params.push(data.slug);
    }
    if (data.excerpt !== undefined) {
        updates.push('excerpt = ?');
        params.push(data.excerpt);
    }
    if (data.content !== undefined) {
        updates.push('content = ?');
        params.push(data.content);
    }
    if (data.contentFormat !== undefined) {
        updates.push('content_format = ?');
        params.push(data.contentFormat);
    }
    if (data.featuredImage !== undefined) {
        updates.push('featured_image = ?');
        params.push(data.featuredImage);
    }
    if (data.status !== undefined) {
        updates.push('status = ?');
        params.push(data.status);

        if (data.status === 'published' && post.status !== 'published') {
            updates.push('published_at = ?');
            params.push(new Date().toISOString());
        }
    }
    if (data.isPinned !== undefined) {
        updates.push('is_pinned = ?');
        params.push(data.isPinned ? 1 : 0);
    }
    if (data.isFeatured !== undefined) {
        updates.push('is_featured = ?');
        params.push(data.isFeatured ? 1 : 0);
    }
    if (data.allowComments !== undefined) {
        updates.push('allow_comments = ?');
        params.push(data.allowComments ? 1 : 0);
    }
    if (data.targetOrchestras !== undefined) {
        updates.push('target_orchestras = ?');
        params.push(data.targetOrchestras ? JSON.stringify(data.targetOrchestras) : null);
    }
    if (data.targetRoles !== undefined) {
        updates.push('target_roles = ?');
        params.push(data.targetRoles ? JSON.stringify(data.targetRoles) : null);
    }

    if (updates.length > 0) {
        updates.push('updated_at = ?');
        params.push(new Date().toISOString());
        params.push(req.params.id);

        db.prepare(`UPDATE posts SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    // Update categories if provided
    if (data.categoryIds !== undefined) {
        db.prepare('DELETE FROM post_category_mapping WHERE post_id = ?').run(req.params.id);

        if (data.categoryIds.length > 0) {
            const insertCategory = db.prepare(
                'INSERT INTO post_category_mapping (post_id, category_id) VALUES (?, ?)'
            );
            data.categoryIds.forEach((catId) => {
                insertCategory.run(req.params.id, catId);
            });
        }
    }

    res.json({ message: 'Bericht bijgewerkt.' });
}));

router.delete('/:id', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const post = db.prepare(
        'SELECT * FROM posts WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!post) {
        throw new ApiError(404, 'Bericht niet gevonden.');
    }

    db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);

    logAuditEvent(
        req.user!.id,
        'post_deleted',
        'post',
        req.params.id,
        post.title
    );

    res.json({ message: 'Bericht verwijderd.' });
}));

// =====================================================
// COMMENT ROUTES
// =====================================================

router.post('/:id/comments', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = commentSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const post = db.prepare(
        'SELECT * FROM posts WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!post) {
        throw new ApiError(404, 'Bericht niet gevonden.');
    }

    if (!post.allow_comments) {
        throw new ApiError(400, 'Reacties zijn niet toegestaan op dit bericht.');
    }

    if (!canUserSeePost(post, req.user!)) {
        throw new ApiError(403, 'Je hebt geen toegang tot dit bericht.');
    }

    if (data.parentId) {
        const parent = db.prepare(
            'SELECT id FROM post_comments WHERE id = ? AND post_id = ? AND deleted_at IS NULL'
        ).get(data.parentId, req.params.id);

        if (!parent) {
            throw new ApiError(404, 'Parent reactie niet gevonden.');
        }
    }

    const commentId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
        INSERT INTO post_comments (id, post_id, user_id, content, parent_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(commentId, req.params.id, req.user!.id, data.content, data.parentId || null, now, now);

    const user = db.prepare(
        'SELECT first_name, last_name FROM users WHERE id = ?'
    ).get(req.user!.id) as any;

    res.status(201).json({
        id: commentId,
        content: data.content,
        authorId: req.user!.id,
        authorName: user ? `${user.first_name} ${user.last_name}` : 'Onbekend',
        parentId: data.parentId,
        createdAt: now,
        message: 'Reactie geplaatst.',
    });
}));

router.delete('/:postId/comments/:commentId', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const comment = db.prepare(
        'SELECT * FROM post_comments WHERE id = ? AND post_id = ? AND deleted_at IS NULL'
    ).get(req.params.commentId, req.params.postId) as any;

    if (!comment) {
        throw new ApiError(404, 'Reactie niet gevonden.');
    }

    const isAdmin = ['admin', 'music_committee'].includes(req.user!.role);
    if (comment.user_id !== req.user!.id && !isAdmin) {
        throw new ApiError(403, 'Je kunt alleen je eigen reacties verwijderen.');
    }

    db.prepare(`
        UPDATE post_comments SET deleted_at = ? WHERE id = ?
    `).run(new Date().toISOString(), req.params.commentId);

    res.json({ message: 'Reactie verwijderd.' });
}));

export default router;
