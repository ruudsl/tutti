import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';

const uploadsDir = path.join(process.cwd(), 'uploads', 'wiki');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

router.use(authenticateToken);

// Validation schemas
const createPageSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  content: z.string(),
  parentId: z.string().uuid().optional(),
  visibility: z.enum(['public', 'members', 'committee', 'admin']).optional(),
  allowComments: z.boolean().optional(),
  isPinned: z.boolean().optional(),
});

const updatePageSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  parentId: z.string().uuid().nullable().optional(),
  visibility: z.enum(['public', 'members', 'committee', 'admin']).optional(),
  allowComments: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  changeSummary: z.string().max(500).optional(),
});

// Check if user can view page based on visibility
function canViewPage(userRole: string, visibility: string): boolean {
  if (visibility === 'public' || visibility === 'members') return true;
  if (visibility === 'committee' && ['admin', 'music_committee', 'conductor', 'board'].includes(userRole)) return true;
  if (visibility === 'admin' && userRole === 'admin') return true;
  return false;
}

// GET /api/wiki - List wiki pages (tree structure)
router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const associationId = req.user!.associationId;
  const userRole = req.user!.role;

  const pages = db.prepare(`
    SELECT id, slug, title, parent_id, visibility, is_pinned, is_published, sort_order, view_count, updated_at
    FROM wiki_pages
    WHERE association_id = ? AND deleted_at IS NULL
    ORDER BY is_pinned DESC, sort_order, title
  `).all(associationId) as any[];

  // Filter by visibility
  const visiblePages = pages.filter(p => canViewPage(userRole, p.visibility));

  // Build tree structure
  const pageMap = new Map(visiblePages.map(p => [p.id, { ...p, children: [] }]));
  const rootPages: any[] = [];

  for (const page of visiblePages) {
    const pageNode = pageMap.get(page.id);
    if (page.parent_id && pageMap.has(page.parent_id)) {
      pageMap.get(page.parent_id)!.children.push(pageNode);
    } else {
      rootPages.push(pageNode);
    }
  }

  res.json(rootPages.map(formatPageListItem));
}));

function formatPageListItem(page: any): any {
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    parentId: page.parent_id,
    visibility: page.visibility,
    isPinned: !!page.is_pinned,
    isPublished: !!page.is_published,
    sortOrder: page.sort_order,
    viewCount: page.view_count,
    updatedAt: page.updated_at,
    children: page.children?.map(formatPageListItem) || [],
  };
}

// GET /api/wiki/search - Search wiki pages
router.get('/search', asyncHandler(async (req: AuthRequest, res: Response) => {
  const associationId = req.user!.associationId;
  const userRole = req.user!.role;
  const rawQuery = req.query.q;
  const query = typeof rawQuery === 'string' ? rawQuery : '';

  if (query.length < 2) {
    res.json([]);
    return;
  }

  const pages = db.prepare(`
    SELECT id, slug, title, visibility, updated_at,
           substr(content, 1, 200) as excerpt
    FROM wiki_pages
    WHERE association_id = ? AND deleted_at IS NULL
      AND (title LIKE ? OR content LIKE ?)
    ORDER BY title
    LIMIT 20
  `).all(associationId, `%${query}%`, `%${query}%`) as any[];

  const visiblePages = pages.filter(p => canViewPage(userRole, p.visibility));

  res.json(visiblePages.map(p => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    updatedAt: p.updated_at,
  })));
}));

// GET /api/wiki/:slug - Get single page by slug
router.get('/:slug', asyncHandler(async (req: AuthRequest, res: Response) => {
  const associationId = req.user!.associationId;
  const userRole = req.user!.role;

  const page = db.prepare(`
    SELECT wp.*,
           u1.first_name || ' ' || u1.last_name as created_by_name,
           u2.first_name || ' ' || u2.last_name as updated_by_name,
           parent.title as parent_title, parent.slug as parent_slug
    FROM wiki_pages wp
    LEFT JOIN users u1 ON wp.created_by = u1.id
    LEFT JOIN users u2 ON wp.updated_by = u2.id
    LEFT JOIN wiki_pages parent ON wp.parent_id = parent.id
    WHERE wp.association_id = ? AND wp.slug = ? AND wp.deleted_at IS NULL
  `).get(associationId, req.params.slug) as any;

  if (!page) {
    throw new ApiError(404, 'Page not found');
  }

  if (!canViewPage(userRole, page.visibility)) {
    throw new ApiError(403, 'No access to this page');
  }

  // Increment view count
  db.prepare(`UPDATE wiki_pages SET view_count = view_count + 1 WHERE id = ?`).run(page.id);

  // Get children
  const children = db.prepare(`
    SELECT id, slug, title, sort_order FROM wiki_pages
    WHERE parent_id = ? AND deleted_at IS NULL
    ORDER BY sort_order, title
  `).all(page.id);

  // Get breadcrumb path
  const breadcrumbs: any[] = [];
  let currentPage = page;
  while (currentPage.parent_id) {
    const parent = db.prepare(`SELECT id, slug, title, parent_id FROM wiki_pages WHERE id = ?`).get(currentPage.parent_id) as any;
    if (parent) {
      breadcrumbs.unshift({ slug: parent.slug, title: parent.title });
      currentPage = parent;
    } else {
      break;
    }
  }

  res.json({
    id: page.id,
    slug: page.slug,
    title: page.title,
    content: page.content,
    contentFormat: page.content_format,
    parentId: page.parent_id,
    parentTitle: page.parent_title,
    parentSlug: page.parent_slug,
    visibility: page.visibility,
    allowComments: !!page.allow_comments,
    isPinned: !!page.is_pinned,
    isPublished: !!page.is_published,
    viewCount: page.view_count + 1,
    createdBy: page.created_by,
    createdByName: page.created_by_name,
    updatedBy: page.updated_by,
    updatedByName: page.updated_by_name,
    createdAt: page.created_at,
    updatedAt: page.updated_at,
    children,
    breadcrumbs,
  });
}));

// POST /api/wiki - Create page
router.post('/', requireRole('admin', 'music_committee', 'board'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const associationId = req.user!.associationId;
  const data = createPageSchema.parse(req.body);

  // Check slug uniqueness
  const existing = db.prepare(`SELECT id FROM wiki_pages WHERE association_id = ? AND slug = ? AND deleted_at IS NULL`).get(associationId, data.slug);
  if (existing) {
    throw new ApiError(409, 'A page with this slug already exists');
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO wiki_pages (id, association_id, slug, title, content, parent_id, visibility, allow_comments, is_pinned, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    associationId,
    data.slug,
    data.title,
    data.content,
    data.parentId || null,
    data.visibility || 'members',
    data.allowComments ? 1 : 0,
    data.isPinned ? 1 : 0,
    req.user!.id,
    now,
    now
  );

  // Create initial version
  db.prepare(`
    INSERT INTO wiki_page_versions (id, page_id, version_number, title, content, change_summary, created_by)
    VALUES (?, ?, 1, ?, ?, 'Initial version', ?)
  `).run(uuidv4(), id, data.title, data.content, req.user!.id);

  res.status(201).json({ id, slug: data.slug, message: 'Page created' });
}));

// PATCH /api/wiki/:slug - Update page
router.patch('/:slug', requireRole('admin', 'music_committee', 'board'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const associationId = req.user!.associationId;
  const data = updatePageSchema.parse(req.body);

  const page = db.prepare(`SELECT id, title, content FROM wiki_pages WHERE association_id = ? AND slug = ? AND deleted_at IS NULL`).get(associationId, req.params.slug) as any;
  if (!page) {
    throw new ApiError(404, 'Page not found');
  }

  const now = new Date().toISOString();

  // If content or title changed, create new version
  if (data.content !== undefined || data.title !== undefined) {
    const versionCount = db.prepare(`SELECT COUNT(*) as count FROM wiki_page_versions WHERE page_id = ?`).get(page.id) as any;
    const newVersionNumber = versionCount.count + 1;

    db.prepare(`
      INSERT INTO wiki_page_versions (id, page_id, version_number, title, content, change_summary, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      page.id,
      newVersionNumber,
      data.title || page.title,
      data.content || page.content,
      data.changeSummary || null,
      req.user!.id
    );
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (data.title !== undefined) { updates.push('title = ?'); values.push(data.title); }
  if (data.content !== undefined) { updates.push('content = ?'); values.push(data.content); }
  if (data.parentId !== undefined) { updates.push('parent_id = ?'); values.push(data.parentId); }
  if (data.visibility !== undefined) { updates.push('visibility = ?'); values.push(data.visibility); }
  if (data.allowComments !== undefined) { updates.push('allow_comments = ?'); values.push(data.allowComments ? 1 : 0); }
  if (data.isPinned !== undefined) { updates.push('is_pinned = ?'); values.push(data.isPinned ? 1 : 0); }
  if (data.isPublished !== undefined) { updates.push('is_published = ?'); values.push(data.isPublished ? 1 : 0); }

  updates.push('updated_by = ?');
  values.push(req.user!.id);
  updates.push('updated_at = ?');
  values.push(now);

  values.push(page.id);

  db.prepare(`UPDATE wiki_pages SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  res.json({ message: 'Page updated' });
}));

// DELETE /api/wiki/:slug - Soft delete page
router.delete('/:slug', requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const associationId = req.user!.associationId;

  const result = db.prepare(`
    UPDATE wiki_pages SET deleted_at = ? WHERE association_id = ? AND slug = ? AND deleted_at IS NULL
  `).run(new Date().toISOString(), associationId, req.params.slug);

  if (result.changes === 0) {
    throw new ApiError(404, 'Page not found');
  }

  res.json({ message: 'Page deleted' });
}));

// GET /api/wiki/:slug/versions - Get page version history
router.get('/:slug/versions', asyncHandler(async (req: AuthRequest, res: Response) => {
  const associationId = req.user!.associationId;

  const page = db.prepare(`SELECT id FROM wiki_pages WHERE association_id = ? AND slug = ? AND deleted_at IS NULL`).get(associationId, req.params.slug) as any;
  if (!page) {
    throw new ApiError(404, 'Page not found');
  }

  const versions = db.prepare(`
    SELECT v.*, u.first_name || ' ' || u.last_name as created_by_name
    FROM wiki_page_versions v
    LEFT JOIN users u ON v.created_by = u.id
    WHERE v.page_id = ?
    ORDER BY v.version_number DESC
  `).all(page.id);

  res.json(versions.map((v: any) => ({
    id: v.id,
    versionNumber: v.version_number,
    title: v.title,
    changeSummary: v.change_summary,
    createdBy: v.created_by,
    createdByName: v.created_by_name,
    createdAt: v.created_at,
  })));
}));

// GET /api/wiki/:slug/versions/:versionId - Get specific version content
router.get('/:slug/versions/:versionId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const associationId = req.user!.associationId;

  const page = db.prepare(`SELECT id FROM wiki_pages WHERE association_id = ? AND slug = ? AND deleted_at IS NULL`).get(associationId, req.params.slug) as any;
  if (!page) {
    throw new ApiError(404, 'Page not found');
  }

  const version = db.prepare(`
    SELECT v.*, u.first_name || ' ' || u.last_name as created_by_name
    FROM wiki_page_versions v
    LEFT JOIN users u ON v.created_by = u.id
    WHERE v.id = ? AND v.page_id = ?
  `).get(req.params.versionId, page.id) as any;

  if (!version) {
    throw new ApiError(404, 'Version not found');
  }

  res.json({
    id: version.id,
    versionNumber: version.version_number,
    title: version.title,
    content: version.content,
    changeSummary: version.change_summary,
    createdBy: version.created_by,
    createdByName: version.created_by_name,
    createdAt: version.created_at,
  });
}));

// POST /api/wiki/:slug/versions/:versionId/restore - Restore a previous version
router.post('/:slug/versions/:versionId/restore', requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const associationId = req.user!.associationId;

  const page = db.prepare(`SELECT id, title, content FROM wiki_pages WHERE association_id = ? AND slug = ? AND deleted_at IS NULL`).get(associationId, req.params.slug) as any;
  if (!page) {
    throw new ApiError(404, 'Page not found');
  }

  const version = db.prepare(`SELECT * FROM wiki_page_versions WHERE id = ? AND page_id = ?`).get(req.params.versionId, page.id) as any;
  if (!version) {
    throw new ApiError(404, 'Version not found');
  }

  const now = new Date().toISOString();

  // Create new version for the restore
  const versionCount = db.prepare(`SELECT COUNT(*) as count FROM wiki_page_versions WHERE page_id = ?`).get(page.id) as any;
  const newVersionNumber = versionCount.count + 1;

  db.prepare(`
    INSERT INTO wiki_page_versions (id, page_id, version_number, title, content, change_summary, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuidv4(),
    page.id,
    newVersionNumber,
    version.title,
    version.content,
    `Restored from version ${version.version_number}`,
    req.user!.id
  );

  // Update page
  db.prepare(`
    UPDATE wiki_pages SET title = ?, content = ?, updated_by = ?, updated_at = ? WHERE id = ?
  `).run(version.title, version.content, req.user!.id, now, page.id);

  res.json({ message: 'Version restored' });
}));

// GET /api/wiki/:slug/attachments - List attachments for a page
router.get('/:slug/attachments', asyncHandler(async (req: AuthRequest, res: Response) => {
  const associationId = req.user!.associationId;

  const page = db.prepare(`SELECT id FROM wiki_pages WHERE association_id = ? AND slug = ? AND deleted_at IS NULL`).get(associationId, req.params.slug) as any;
  if (!page) {
    throw new ApiError(404, 'Page not found');
  }

  const attachments = db.prepare(`
    SELECT a.*, u.first_name || ' ' || u.last_name as uploaded_by_name
    FROM wiki_attachments a
    LEFT JOIN users u ON a.uploaded_by = u.id
    WHERE a.page_id = ?
    ORDER BY a.uploaded_at DESC
  `).all(page.id);

  res.json(attachments.map((a: any) => ({
    id: a.id,
    filename: a.filename,
    originalFilename: a.original_filename,
    mimeType: a.mime_type,
    fileSize: a.file_size,
    url: `/uploads/wiki/${a.filename}`,
    uploadedBy: a.uploaded_by,
    uploadedByName: a.uploaded_by_name,
    uploadedAt: a.uploaded_at,
  })));
}));

// POST /api/wiki/:slug/attachments - Upload attachment
router.post('/:slug/attachments', requireRole('admin', 'music_committee', 'board'), upload.single('file'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const associationId = req.user!.associationId;

  const page = db.prepare(`SELECT id FROM wiki_pages WHERE association_id = ? AND slug = ? AND deleted_at IS NULL`).get(associationId, req.params.slug) as any;
  if (!page) {
    throw new ApiError(404, 'Page not found');
  }

  if (!req.file) {
    throw new ApiError(400, 'No file uploaded');
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO wiki_attachments (id, page_id, filename, original_filename, mime_type, file_size, uploaded_by, uploaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    page.id,
    req.file.filename,
    req.file.originalname,
    req.file.mimetype,
    req.file.size,
    req.user!.id,
    now
  );

  res.status(201).json({
    id,
    url: `/uploads/wiki/${req.file.filename}`,
    message: 'Attachment uploaded',
  });
}));

// DELETE /api/wiki/:slug/attachments/:attachmentId - Delete attachment
router.delete('/:slug/attachments/:attachmentId', requireRole('admin', 'music_committee', 'board'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const associationId = req.user!.associationId;

  const page = db.prepare(`SELECT id FROM wiki_pages WHERE association_id = ? AND slug = ? AND deleted_at IS NULL`).get(associationId, req.params.slug) as any;
  if (!page) {
    throw new ApiError(404, 'Page not found');
  }

  const attachment = db.prepare(`SELECT filename FROM wiki_attachments WHERE id = ? AND page_id = ?`).get(req.params.attachmentId, page.id) as any;
  if (!attachment) {
    throw new ApiError(404, 'Attachment not found');
  }

  // Delete file from disk
  const filePath = path.join(uploadsDir, attachment.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  // Delete from database
  db.prepare(`DELETE FROM wiki_attachments WHERE id = ?`).run(req.params.attachmentId);

  res.json({ message: 'Attachment deleted' });
}));

export default router;
