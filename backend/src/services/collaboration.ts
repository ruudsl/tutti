import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import logger from '../utils/logger';

// Types
export interface SharedLibrary {
    id: string;
    ownerAssociationId: string;
    ownerAssociationName?: string;
    name: string;
    description: string | null;
    isPublic: boolean;
    titleCount?: number;
    createdAt: string;
    updatedAt: string;
}

export interface SharedLibraryTitle {
    id: string;
    libraryId: string;
    titleId: string;
    title: string;
    arranger: string | null;
    composer: string | null;
    sharedAt: string;
    sharedBy: string;
    sharedByName?: string;
}

export interface LibraryAccess {
    id: string;
    libraryId: string;
    associationId: string;
    associationName?: string;
    accessLevel: 'view' | 'download' | 'contribute';
    grantedAt: string;
    grantedBy: string;
    grantedByName?: string;
}

export interface CollaborationRequest {
    id: string;
    fromAssociationId: string;
    fromAssociationName?: string;
    toAssociationId: string;
    toAssociationName?: string;
    libraryId: string | null;
    libraryName?: string;
    status: 'pending' | 'accepted' | 'rejected';
    message: string | null;
    responseMessage: string | null;
    respondedBy: string | null;
    respondedAt: string | null;
    createdAt: string;
}

export interface ImportedTitle {
    id: string;
    titleId: string;
    sourceTitleId: string;
    sourceLibraryId: string;
    sourceLibraryName?: string;
    sourceAssociationId: string;
    sourceAssociationName?: string;
    importedAt: string;
    importedBy: string;
}

// ============================================
// SHARED LIBRARIES
// ============================================

/**
 * Create a new shared library
 */
export function createSharedLibrary(
    ownerAssociationId: string,
    name: string,
    description: string | null,
    isPublic: boolean
): SharedLibrary {
    const id = uuidv4();

    db.prepare(`
        INSERT INTO shared_libraries (id, owner_association_id, name, description, is_public)
        VALUES (?, ?, ?, ?, ?)
    `).run(id, ownerAssociationId, name, description, isPublic ? 1 : 0);

    logger.info(`Created shared library: ${name}`, { libraryId: id, ownerAssociationId });

    return getSharedLibrary(id)!;
}

/**
 * Get a shared library by ID
 */
export function getSharedLibrary(id: string): SharedLibrary | null {
    const library = db.prepare(`
        SELECT
            sl.id,
            sl.owner_association_id,
            a.name as owner_association_name,
            sl.name,
            sl.description,
            sl.is_public,
            sl.created_at,
            sl.updated_at,
            (SELECT COUNT(*) FROM shared_library_titles WHERE library_id = sl.id) as title_count
        FROM shared_libraries sl
        JOIN associations a ON sl.owner_association_id = a.id
        WHERE sl.id = ?
    `).get(id) as any;

    if (!library) return null;

    return {
        id: library.id,
        ownerAssociationId: library.owner_association_id,
        ownerAssociationName: library.owner_association_name,
        name: library.name,
        description: library.description,
        isPublic: !!library.is_public,
        titleCount: library.title_count,
        createdAt: library.created_at,
        updatedAt: library.updated_at,
    };
}

/**
 * Get all shared libraries owned by an association
 */
export function getOwnedSharedLibraries(associationId: string): SharedLibrary[] {
    const libraries = db.prepare(`
        SELECT
            sl.id,
            sl.owner_association_id,
            a.name as owner_association_name,
            sl.name,
            sl.description,
            sl.is_public,
            sl.created_at,
            sl.updated_at,
            (SELECT COUNT(*) FROM shared_library_titles WHERE library_id = sl.id) as title_count
        FROM shared_libraries sl
        JOIN associations a ON sl.owner_association_id = a.id
        WHERE sl.owner_association_id = ?
        ORDER BY sl.name
    `).all(associationId) as any[];

    return libraries.map(library => ({
        id: library.id,
        ownerAssociationId: library.owner_association_id,
        ownerAssociationName: library.owner_association_name,
        name: library.name,
        description: library.description,
        isPublic: !!library.is_public,
        titleCount: library.title_count,
        createdAt: library.created_at,
        updatedAt: library.updated_at,
    }));
}

/**
 * Get all libraries shared with an association (via access grants)
 */
export function getAccessibleLibraries(associationId: string): (SharedLibrary & { accessLevel: string })[] {
    const libraries = db.prepare(`
        SELECT
            sl.id,
            sl.owner_association_id,
            a.name as owner_association_name,
            sl.name,
            sl.description,
            sl.is_public,
            sl.created_at,
            sl.updated_at,
            la.access_level,
            (SELECT COUNT(*) FROM shared_library_titles WHERE library_id = sl.id) as title_count
        FROM shared_libraries sl
        JOIN associations a ON sl.owner_association_id = a.id
        JOIN library_access la ON sl.id = la.library_id
        WHERE la.association_id = ?
        ORDER BY sl.name
    `).all(associationId) as any[];

    return libraries.map(library => ({
        id: library.id,
        ownerAssociationId: library.owner_association_id,
        ownerAssociationName: library.owner_association_name,
        name: library.name,
        description: library.description,
        isPublic: !!library.is_public,
        titleCount: library.title_count,
        createdAt: library.created_at,
        updatedAt: library.updated_at,
        accessLevel: library.access_level,
    }));
}

/**
 * Get public libraries (for discovery)
 */
export function getPublicLibraries(excludeAssociationId: string): SharedLibrary[] {
    const libraries = db.prepare(`
        SELECT
            sl.id,
            sl.owner_association_id,
            a.name as owner_association_name,
            sl.name,
            sl.description,
            sl.is_public,
            sl.created_at,
            sl.updated_at,
            (SELECT COUNT(*) FROM shared_library_titles WHERE library_id = sl.id) as title_count
        FROM shared_libraries sl
        JOIN associations a ON sl.owner_association_id = a.id
        WHERE sl.is_public = 1 AND sl.owner_association_id != ?
        ORDER BY sl.name
    `).all(excludeAssociationId) as any[];

    return libraries.map(library => ({
        id: library.id,
        ownerAssociationId: library.owner_association_id,
        ownerAssociationName: library.owner_association_name,
        name: library.name,
        description: library.description,
        isPublic: !!library.is_public,
        titleCount: library.title_count,
        createdAt: library.created_at,
        updatedAt: library.updated_at,
    }));
}

/**
 * Update a shared library
 */
export function updateSharedLibrary(
    id: string,
    name: string,
    description: string | null,
    isPublic: boolean
): void {
    db.prepare(`
        UPDATE shared_libraries
        SET name = ?, description = ?, is_public = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(name, description, isPublic ? 1 : 0, id);

    logger.info(`Updated shared library: ${id}`);
}

/**
 * Delete a shared library
 */
export function deleteSharedLibrary(id: string): void {
    db.prepare('DELETE FROM shared_libraries WHERE id = ?').run(id);
    logger.info(`Deleted shared library: ${id}`);
}

// ============================================
// SHARED LIBRARY TITLES
// ============================================

/**
 * Add a title to a shared library
 */
export function addTitleToLibrary(libraryId: string, titleId: string, userId: string): void {
    const id = uuidv4();

    db.prepare(`
        INSERT INTO shared_library_titles (id, library_id, title_id, shared_by)
        VALUES (?, ?, ?, ?)
    `).run(id, libraryId, titleId, userId);

    logger.info(`Added title ${titleId} to library ${libraryId}`);
}

/**
 * Remove a title from a shared library
 */
export function removeTitleFromLibrary(libraryId: string, titleId: string): void {
    db.prepare('DELETE FROM shared_library_titles WHERE library_id = ? AND title_id = ?')
        .run(libraryId, titleId);

    logger.info(`Removed title ${titleId} from library ${libraryId}`);
}

/**
 * Get all titles in a shared library
 */
export function getLibraryTitles(libraryId: string): SharedLibraryTitle[] {
    const titles = db.prepare(`
        SELECT
            slt.id,
            slt.library_id,
            slt.title_id,
            mt.title,
            mt.arranger,
            mt.composer,
            slt.shared_at,
            slt.shared_by,
            u.first_name || ' ' || u.last_name as shared_by_name
        FROM shared_library_titles slt
        JOIN music_titles mt ON slt.title_id = mt.id
        LEFT JOIN users u ON slt.shared_by = u.id
        WHERE slt.library_id = ?
        ORDER BY mt.title
    `).all(libraryId) as any[];

    return titles.map(t => ({
        id: t.id,
        libraryId: t.library_id,
        titleId: t.title_id,
        title: t.title,
        arranger: t.arranger,
        composer: t.composer,
        sharedAt: t.shared_at,
        sharedBy: t.shared_by,
        sharedByName: t.shared_by_name,
    }));
}

// ============================================
// LIBRARY ACCESS CONTROL
// ============================================

/**
 * Grant access to a library
 */
export function grantLibraryAccess(
    libraryId: string,
    associationId: string,
    accessLevel: 'view' | 'download' | 'contribute',
    grantedBy: string
): void {
    const id = uuidv4();

    // Delete existing access if any, then insert new
    db.prepare('DELETE FROM library_access WHERE library_id = ? AND association_id = ?')
        .run(libraryId, associationId);

    db.prepare(`
        INSERT INTO library_access (id, library_id, association_id, access_level, granted_by)
        VALUES (?, ?, ?, ?, ?)
    `).run(id, libraryId, associationId, accessLevel, grantedBy);

    logger.info(`Granted ${accessLevel} access to library ${libraryId} for association ${associationId}`);
}

/**
 * Revoke access from a library
 */
export function revokeLibraryAccess(libraryId: string, associationId: string): void {
    db.prepare('DELETE FROM library_access WHERE library_id = ? AND association_id = ?')
        .run(libraryId, associationId);

    logger.info(`Revoked access to library ${libraryId} for association ${associationId}`);
}

/**
 * Get all associations with access to a library
 */
export function getLibraryAccessList(libraryId: string): LibraryAccess[] {
    const accessList = db.prepare(`
        SELECT
            la.id,
            la.library_id,
            la.association_id,
            a.name as association_name,
            la.access_level,
            la.granted_at,
            la.granted_by,
            u.first_name || ' ' || u.last_name as granted_by_name
        FROM library_access la
        JOIN associations a ON la.association_id = a.id
        LEFT JOIN users u ON la.granted_by = u.id
        WHERE la.library_id = ?
        ORDER BY a.name
    `).all(libraryId) as any[];

    return accessList.map(a => ({
        id: a.id,
        libraryId: a.library_id,
        associationId: a.association_id,
        associationName: a.association_name,
        accessLevel: a.access_level,
        grantedAt: a.granted_at,
        grantedBy: a.granted_by,
        grantedByName: a.granted_by_name,
    }));
}

/**
 * Check if an association has access to a library
 */
export function checkLibraryAccess(
    libraryId: string,
    associationId: string
): { hasAccess: boolean; accessLevel: string | null; isOwner: boolean } {
    // Check if owner
    const library = db.prepare(
        'SELECT owner_association_id FROM shared_libraries WHERE id = ?'
    ).get(libraryId) as { owner_association_id: string } | undefined;

    if (!library) {
        return { hasAccess: false, accessLevel: null, isOwner: false };
    }

    if (library.owner_association_id === associationId) {
        return { hasAccess: true, accessLevel: 'owner', isOwner: true };
    }

    // Check access grant
    const access = db.prepare(
        'SELECT access_level FROM library_access WHERE library_id = ? AND association_id = ?'
    ).get(libraryId, associationId) as { access_level: string } | undefined;

    return {
        hasAccess: !!access,
        accessLevel: access?.access_level || null,
        isOwner: false,
    };
}

// ============================================
// COLLABORATION REQUESTS
// ============================================

/**
 * Create a collaboration request
 */
export function createCollaborationRequest(
    fromAssociationId: string,
    toAssociationId: string,
    libraryId: string | null,
    message: string | null
): CollaborationRequest {
    const id = uuidv4();

    db.prepare(`
        INSERT INTO collaboration_requests (id, from_association_id, to_association_id, library_id, message)
        VALUES (?, ?, ?, ?, ?)
    `).run(id, fromAssociationId, toAssociationId, libraryId, message);

    logger.info(`Created collaboration request from ${fromAssociationId} to ${toAssociationId}`);

    return getCollaborationRequest(id)!;
}

/**
 * Get a collaboration request by ID
 */
export function getCollaborationRequest(id: string): CollaborationRequest | null {
    const request = db.prepare(`
        SELECT
            cr.id,
            cr.from_association_id,
            fa.name as from_association_name,
            cr.to_association_id,
            ta.name as to_association_name,
            cr.library_id,
            sl.name as library_name,
            cr.status,
            cr.message,
            cr.response_message,
            cr.responded_by,
            cr.responded_at,
            cr.created_at
        FROM collaboration_requests cr
        JOIN associations fa ON cr.from_association_id = fa.id
        JOIN associations ta ON cr.to_association_id = ta.id
        LEFT JOIN shared_libraries sl ON cr.library_id = sl.id
        WHERE cr.id = ?
    `).get(id) as any;

    if (!request) return null;

    return {
        id: request.id,
        fromAssociationId: request.from_association_id,
        fromAssociationName: request.from_association_name,
        toAssociationId: request.to_association_id,
        toAssociationName: request.to_association_name,
        libraryId: request.library_id,
        libraryName: request.library_name,
        status: request.status,
        message: request.message,
        responseMessage: request.response_message,
        respondedBy: request.responded_by,
        respondedAt: request.responded_at,
        createdAt: request.created_at,
    };
}

/**
 * Get pending requests for an association (incoming)
 */
export function getIncomingRequests(associationId: string): CollaborationRequest[] {
    const requests = db.prepare(`
        SELECT
            cr.id,
            cr.from_association_id,
            fa.name as from_association_name,
            cr.to_association_id,
            ta.name as to_association_name,
            cr.library_id,
            sl.name as library_name,
            cr.status,
            cr.message,
            cr.response_message,
            cr.responded_by,
            cr.responded_at,
            cr.created_at
        FROM collaboration_requests cr
        JOIN associations fa ON cr.from_association_id = fa.id
        JOIN associations ta ON cr.to_association_id = ta.id
        LEFT JOIN shared_libraries sl ON cr.library_id = sl.id
        WHERE cr.to_association_id = ?
        ORDER BY cr.created_at DESC
    `).all(associationId) as any[];

    return requests.map(r => ({
        id: r.id,
        fromAssociationId: r.from_association_id,
        fromAssociationName: r.from_association_name,
        toAssociationId: r.to_association_id,
        toAssociationName: r.to_association_name,
        libraryId: r.library_id,
        libraryName: r.library_name,
        status: r.status,
        message: r.message,
        responseMessage: r.response_message,
        respondedBy: r.responded_by,
        respondedAt: r.responded_at,
        createdAt: r.created_at,
    }));
}

/**
 * Get outgoing requests from an association
 */
export function getOutgoingRequests(associationId: string): CollaborationRequest[] {
    const requests = db.prepare(`
        SELECT
            cr.id,
            cr.from_association_id,
            fa.name as from_association_name,
            cr.to_association_id,
            ta.name as to_association_name,
            cr.library_id,
            sl.name as library_name,
            cr.status,
            cr.message,
            cr.response_message,
            cr.responded_by,
            cr.responded_at,
            cr.created_at
        FROM collaboration_requests cr
        JOIN associations fa ON cr.from_association_id = fa.id
        JOIN associations ta ON cr.to_association_id = ta.id
        LEFT JOIN shared_libraries sl ON cr.library_id = sl.id
        WHERE cr.from_association_id = ?
        ORDER BY cr.created_at DESC
    `).all(associationId) as any[];

    return requests.map(r => ({
        id: r.id,
        fromAssociationId: r.from_association_id,
        fromAssociationName: r.from_association_name,
        toAssociationId: r.to_association_id,
        toAssociationName: r.to_association_name,
        libraryId: r.library_id,
        libraryName: r.library_name,
        status: r.status,
        message: r.message,
        responseMessage: r.response_message,
        respondedBy: r.responded_by,
        respondedAt: r.responded_at,
        createdAt: r.created_at,
    }));
}

/**
 * Respond to a collaboration request
 */
export function respondToRequest(
    requestId: string,
    status: 'accepted' | 'rejected',
    responseMessage: string | null,
    respondedBy: string,
    accessLevel?: 'view' | 'download' | 'contribute'
): void {
    const request = getCollaborationRequest(requestId);
    if (!request) {
        throw new Error('Request not found');
    }

    db.prepare(`
        UPDATE collaboration_requests
        SET status = ?, response_message = ?, responded_by = ?, responded_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(status, responseMessage, respondedBy, requestId);

    // If accepted and there's a library, grant access
    if (status === 'accepted' && request.libraryId) {
        grantLibraryAccess(
            request.libraryId,
            request.fromAssociationId,
            accessLevel || 'view',
            respondedBy
        );
    }

    logger.info(`Responded to collaboration request ${requestId}: ${status}`);
}

// ============================================
// TITLE IMPORT
// ============================================

/**
 * Import a title from a shared library to own library
 */
export function importTitle(
    sourceTitleId: string,
    sourceLibraryId: string,
    targetAssociationId: string,
    importedBy: string
): { newTitleId: string } {
    // Get source title
    const sourceTitle = db.prepare(`
        SELECT mt.*, sl.owner_association_id as source_association_id
        FROM music_titles mt
        JOIN shared_library_titles slt ON mt.id = slt.title_id
        JOIN shared_libraries sl ON slt.library_id = sl.id
        WHERE mt.id = ? AND slt.library_id = ?
    `).get(sourceTitleId, sourceLibraryId) as any;

    if (!sourceTitle) {
        throw new Error('Source title not found in library');
    }

    // Create new title in target association
    const newTitleId = uuidv4();

    db.prepare(`
        INSERT INTO music_titles (
            id, title, composer, arranger, youtube_url, description,
            duration_seconds, grade, is_shared, streaming_links,
            imslp_work_id, imslp_permalink, association_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
    `).run(
        newTitleId,
        sourceTitle.title,
        sourceTitle.composer,
        sourceTitle.arranger,
        sourceTitle.youtube_url,
        sourceTitle.description,
        sourceTitle.duration_seconds,
        sourceTitle.grade,
        sourceTitle.streaming_links,
        sourceTitle.imslp_work_id,
        sourceTitle.imslp_permalink,
        targetAssociationId
    );

    // Record the import for attribution
    const importId = uuidv4();
    db.prepare(`
        INSERT INTO imported_titles (
            id, title_id, source_title_id, source_library_id,
            source_association_id, imported_by
        )
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        importId,
        newTitleId,
        sourceTitleId,
        sourceLibraryId,
        sourceTitle.source_association_id,
        importedBy
    );

    // Copy genres
    const genres = db.prepare(`
        SELECT genre_id FROM music_title_genres WHERE music_title_id = ?
    `).all(sourceTitleId) as { genre_id: string }[];

    for (const genre of genres) {
        db.prepare(`
            INSERT OR IGNORE INTO music_title_genres (music_title_id, genre_id)
            VALUES (?, ?)
        `).run(newTitleId, genre.genre_id);
    }

    logger.info(`Imported title ${sourceTitleId} as ${newTitleId} to association ${targetAssociationId}`);

    return { newTitleId };
}

/**
 * Get import attribution for a title
 */
export function getImportAttribution(titleId: string): ImportedTitle | null {
    const imported = db.prepare(`
        SELECT
            it.id,
            it.title_id,
            it.source_title_id,
            it.source_library_id,
            sl.name as source_library_name,
            it.source_association_id,
            a.name as source_association_name,
            it.imported_at,
            it.imported_by
        FROM imported_titles it
        LEFT JOIN shared_libraries sl ON it.source_library_id = sl.id
        LEFT JOIN associations a ON it.source_association_id = a.id
        WHERE it.title_id = ?
    `).get(titleId) as any;

    if (!imported) return null;

    return {
        id: imported.id,
        titleId: imported.title_id,
        sourceTitleId: imported.source_title_id,
        sourceLibraryId: imported.source_library_id,
        sourceLibraryName: imported.source_library_name,
        sourceAssociationId: imported.source_association_id,
        sourceAssociationName: imported.source_association_name,
        importedAt: imported.imported_at,
        importedBy: imported.imported_by,
    };
}

export default {
    // Shared Libraries
    createSharedLibrary,
    getSharedLibrary,
    getOwnedSharedLibraries,
    getAccessibleLibraries,
    getPublicLibraries,
    updateSharedLibrary,
    deleteSharedLibrary,

    // Library Titles
    addTitleToLibrary,
    removeTitleFromLibrary,
    getLibraryTitles,

    // Access Control
    grantLibraryAccess,
    revokeLibraryAccess,
    getLibraryAccessList,
    checkLibraryAccess,

    // Collaboration Requests
    createCollaborationRequest,
    getCollaborationRequest,
    getIncomingRequests,
    getOutgoingRequests,
    respondToRequest,

    // Import
    importTitle,
    getImportAttribution,
};
