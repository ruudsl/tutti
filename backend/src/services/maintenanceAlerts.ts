/**
 * Maintenance Alerts Service
 *
 * Provides functionality for checking equipment maintenance schedules,
 * identifying overdue and upcoming maintenance, and sending notifications.
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import logger from '../utils/logger';
import { sendNotification, notifyAssociation } from './notifications';

// Types
export interface MaintenanceItem {
    id: string;
    equipmentId: string;
    instrumentType: string;
    brandModel: string | null;
    serialNumber: string | null;
    lastMaintenanceDate: string | null;
    nextMaintenanceDate: string | null;
    maintenanceIntervalMonths: number;
    maintenanceNotes: string | null;
    isOverdue: boolean;
    daysUntilDue: number;
    currentUser: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
    } | null;
}

export interface MaintenanceLog {
    id: string;
    equipmentId: string;
    maintenanceDate: string;
    performedBy: string | null;
    description: string;
    cost: number | null;
    notes: string | null;
    createdAt: string;
    createdBy: string | null;
}

export interface MaintenanceScheduleItem {
    equipmentId: string;
    instrumentType: string;
    brandModel: string | null;
    serialNumber: string | null;
    nextMaintenanceDate: string;
    maintenanceIntervalMonths: number;
    status: 'overdue' | 'due_soon' | 'scheduled';
    daysUntilDue: number;
}

/**
 * Get equipment items that need maintenance soon (within specified days)
 */
export function getUpcomingMaintenance(associationId: string, daysAhead: number = 30): MaintenanceItem[] {
    const today = new Date().toISOString().split('T')[0];
    const futureDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const items = db.prepare(`
        SELECT
            e.id,
            e.instrument_type,
            e.brand_model,
            e.serial_number,
            e.last_maintenance_date,
            e.next_maintenance_date,
            e.maintenance_interval_months,
            e.maintenance_notes,
            e.current_user_id,
            u.first_name,
            u.last_name,
            u.email
        FROM equipment e
        LEFT JOIN users u ON e.current_user_id = u.id
        WHERE e.association_id = ?
        AND e.status NOT IN ('written_off')
        AND e.next_maintenance_date IS NOT NULL
        AND e.next_maintenance_date > ?
        AND e.next_maintenance_date <= ?
        ORDER BY e.next_maintenance_date ASC
    `).all(associationId, today, futureDate) as any[];

    return items.map(item => {
        const nextDate = new Date(item.next_maintenance_date);
        const todayDate = new Date(today);
        const daysUntilDue = Math.ceil((nextDate.getTime() - todayDate.getTime()) / (24 * 60 * 60 * 1000));

        return {
            id: item.id,
            equipmentId: item.id,
            instrumentType: item.instrument_type,
            brandModel: item.brand_model,
            serialNumber: item.serial_number,
            lastMaintenanceDate: item.last_maintenance_date,
            nextMaintenanceDate: item.next_maintenance_date,
            maintenanceIntervalMonths: item.maintenance_interval_months,
            maintenanceNotes: item.maintenance_notes,
            isOverdue: false,
            daysUntilDue,
            currentUser: item.current_user_id ? {
                id: item.current_user_id,
                firstName: item.first_name,
                lastName: item.last_name,
                email: item.email,
            } : null,
        };
    });
}

/**
 * Get equipment items with overdue maintenance
 */
export function getOverdueMaintenance(associationId: string): MaintenanceItem[] {
    const today = new Date().toISOString().split('T')[0];

    const items = db.prepare(`
        SELECT
            e.id,
            e.instrument_type,
            e.brand_model,
            e.serial_number,
            e.last_maintenance_date,
            e.next_maintenance_date,
            e.maintenance_interval_months,
            e.maintenance_notes,
            e.current_user_id,
            u.first_name,
            u.last_name,
            u.email
        FROM equipment e
        LEFT JOIN users u ON e.current_user_id = u.id
        WHERE e.association_id = ?
        AND e.status NOT IN ('written_off')
        AND e.next_maintenance_date IS NOT NULL
        AND e.next_maintenance_date < ?
        ORDER BY e.next_maintenance_date ASC
    `).all(associationId, today) as any[];

    return items.map(item => {
        const nextDate = new Date(item.next_maintenance_date);
        const todayDate = new Date(today);
        const daysUntilDue = Math.ceil((nextDate.getTime() - todayDate.getTime()) / (24 * 60 * 60 * 1000));

        return {
            id: item.id,
            equipmentId: item.id,
            instrumentType: item.instrument_type,
            brandModel: item.brand_model,
            serialNumber: item.serial_number,
            lastMaintenanceDate: item.last_maintenance_date,
            nextMaintenanceDate: item.next_maintenance_date,
            maintenanceIntervalMonths: item.maintenance_interval_months,
            maintenanceNotes: item.maintenance_notes,
            isOverdue: true,
            daysUntilDue, // Will be negative for overdue items
            currentUser: item.current_user_id ? {
                id: item.current_user_id,
                firstName: item.first_name,
                lastName: item.last_name,
                email: item.email,
            } : null,
        };
    });
}

/**
 * Get the full maintenance schedule for all equipment
 */
export function getMaintenanceSchedule(associationId: string): MaintenanceScheduleItem[] {
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const items = db.prepare(`
        SELECT
            e.id as equipment_id,
            e.instrument_type,
            e.brand_model,
            e.serial_number,
            e.next_maintenance_date,
            e.maintenance_interval_months
        FROM equipment e
        WHERE e.association_id = ?
        AND e.status NOT IN ('written_off')
        AND e.next_maintenance_date IS NOT NULL
        ORDER BY e.next_maintenance_date ASC
    `).all(associationId) as any[];

    return items.map(item => {
        const nextDate = new Date(item.next_maintenance_date);
        const todayDate = new Date(today);
        const daysUntilDue = Math.ceil((nextDate.getTime() - todayDate.getTime()) / (24 * 60 * 60 * 1000));

        let status: 'overdue' | 'due_soon' | 'scheduled';
        if (item.next_maintenance_date < today) {
            status = 'overdue';
        } else if (item.next_maintenance_date <= sevenDaysFromNow) {
            status = 'due_soon';
        } else {
            status = 'scheduled';
        }

        return {
            equipmentId: item.equipment_id,
            instrumentType: item.instrument_type,
            brandModel: item.brand_model,
            serialNumber: item.serial_number,
            nextMaintenanceDate: item.next_maintenance_date,
            maintenanceIntervalMonths: item.maintenance_interval_months,
            status,
            daysUntilDue,
        };
    });
}

/**
 * Log a completed maintenance entry
 */
export function logMaintenance(
    equipmentId: string,
    data: {
        maintenanceDate: string;
        performedBy?: string;
        description: string;
        cost?: number;
        notes?: string;
    },
    createdBy?: string
): string {
    const id = uuidv4();

    db.prepare(`
        INSERT INTO equipment_maintenance_log (
            id, equipment_id, maintenance_date, performed_by, description, cost, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        equipmentId,
        data.maintenanceDate,
        data.performedBy || null,
        data.description,
        data.cost || null,
        data.notes || null,
        createdBy || null
    );

    // Update the equipment's last maintenance date and calculate next date
    const equipment = db.prepare('SELECT maintenance_interval_months FROM equipment WHERE id = ?')
        .get(equipmentId) as { maintenance_interval_months: number } | undefined;

    if (equipment) {
        const maintenanceDate = new Date(data.maintenanceDate);
        maintenanceDate.setMonth(maintenanceDate.getMonth() + (equipment.maintenance_interval_months || 12));
        const nextMaintenanceDate = maintenanceDate.toISOString().split('T')[0];

        db.prepare(`
            UPDATE equipment
            SET last_maintenance_date = ?, next_maintenance_date = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(data.maintenanceDate, nextMaintenanceDate, equipmentId);
    }

    logger.info('Maintenance logged', { id, equipmentId, date: data.maintenanceDate });

    return id;
}

/**
 * Get maintenance log history for an equipment item
 */
export function getMaintenanceLog(equipmentId: string): MaintenanceLog[] {
    const logs = db.prepare(`
        SELECT
            id,
            equipment_id,
            maintenance_date,
            performed_by,
            description,
            cost,
            notes,
            created_at,
            created_by
        FROM equipment_maintenance_log
        WHERE equipment_id = ?
        ORDER BY maintenance_date DESC
    `).all(equipmentId) as any[];

    return logs.map(log => ({
        id: log.id,
        equipmentId: log.equipment_id,
        maintenanceDate: log.maintenance_date,
        performedBy: log.performed_by,
        description: log.description,
        cost: log.cost,
        notes: log.notes,
        createdAt: log.created_at,
        createdBy: log.created_by,
    }));
}

/**
 * Update equipment maintenance settings
 */
export function updateMaintenanceSettings(
    equipmentId: string,
    settings: {
        maintenanceIntervalMonths?: number;
        lastMaintenanceDate?: string;
        maintenanceNotes?: string;
    }
): void {
    const updates: string[] = [];
    const params: any[] = [];

    if (settings.maintenanceIntervalMonths !== undefined) {
        updates.push('maintenance_interval_months = ?');
        params.push(settings.maintenanceIntervalMonths);
    }

    if (settings.lastMaintenanceDate !== undefined) {
        updates.push('last_maintenance_date = ?');
        params.push(settings.lastMaintenanceDate);

        // Calculate next maintenance date
        const equipment = db.prepare('SELECT maintenance_interval_months FROM equipment WHERE id = ?')
            .get(equipmentId) as { maintenance_interval_months: number } | undefined;

        const interval = settings.maintenanceIntervalMonths || equipment?.maintenance_interval_months || 12;
        const lastDate = new Date(settings.lastMaintenanceDate);
        lastDate.setMonth(lastDate.getMonth() + interval);

        updates.push('next_maintenance_date = ?');
        params.push(lastDate.toISOString().split('T')[0]);
    }

    if (settings.maintenanceNotes !== undefined) {
        updates.push('maintenance_notes = ?');
        params.push(settings.maintenanceNotes);
    }

    if (updates.length > 0) {
        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(equipmentId);

        db.prepare(`
            UPDATE equipment SET ${updates.join(', ')} WHERE id = ?
        `).run(...params);
    }
}

/**
 * Calculate total maintenance costs for an equipment item
 */
export function getMaintenanceCosts(equipmentId: string): { total: number; count: number } {
    const result = db.prepare(`
        SELECT COALESCE(SUM(cost), 0) as total, COUNT(*) as count
        FROM equipment_maintenance_log
        WHERE equipment_id = ?
    `).get(equipmentId) as { total: number; count: number };

    return result;
}

/**
 * Get total maintenance costs for all equipment in an association
 */
export function getAssociationMaintenanceCosts(
    associationId: string,
    startDate?: string,
    endDate?: string
): { total: number; count: number; byEquipment: { equipmentId: string; instrumentType: string; total: number; count: number }[] } {
    let query = `
        SELECT
            COALESCE(SUM(ml.cost), 0) as total,
            COUNT(*) as count
        FROM equipment_maintenance_log ml
        JOIN equipment e ON ml.equipment_id = e.id
        WHERE e.association_id = ?
    `;
    const params: any[] = [associationId];

    if (startDate) {
        query += ' AND ml.maintenance_date >= ?';
        params.push(startDate);
    }
    if (endDate) {
        query += ' AND ml.maintenance_date <= ?';
        params.push(endDate);
    }

    const totals = db.prepare(query).get(...params) as { total: number; count: number };

    // Get breakdown by equipment
    let byEquipmentQuery = `
        SELECT
            e.id as equipment_id,
            e.instrument_type,
            COALESCE(SUM(ml.cost), 0) as total,
            COUNT(*) as count
        FROM equipment_maintenance_log ml
        JOIN equipment e ON ml.equipment_id = e.id
        WHERE e.association_id = ?
    `;
    const byEquipmentParams: any[] = [associationId];

    if (startDate) {
        byEquipmentQuery += ' AND ml.maintenance_date >= ?';
        byEquipmentParams.push(startDate);
    }
    if (endDate) {
        byEquipmentQuery += ' AND ml.maintenance_date <= ?';
        byEquipmentParams.push(endDate);
    }

    byEquipmentQuery += ' GROUP BY e.id ORDER BY total DESC';

    const byEquipment = db.prepare(byEquipmentQuery).all(...byEquipmentParams) as any[];

    return {
        total: totals.total,
        count: totals.count,
        byEquipment: byEquipment.map(item => ({
            equipmentId: item.equipment_id,
            instrumentType: item.instrument_type,
            total: item.total,
            count: item.count,
        })),
    };
}

/**
 * Send maintenance notifications to admins and equipment committee members
 */
export async function sendMaintenanceNotifications(associationId: string): Promise<{ sent: number; errors: number }> {
    const overdue = getOverdueMaintenance(associationId);
    const upcoming = getUpcomingMaintenance(associationId, 7); // Items due in next 7 days

    let sent = 0;
    let errors = 0;

    // Get admin and equipment committee users
    const notifyUsers = db.prepare(`
        SELECT id, email, first_name
        FROM users
        WHERE association_id = ?
        AND status = 'active'
        AND role IN ('admin', 'equipment_committee')
    `).all(associationId) as { id: string; email: string; first_name: string }[];

    if (notifyUsers.length === 0) {
        logger.info('No users to notify for maintenance alerts', { associationId });
        return { sent: 0, errors: 0 };
    }

    // Send overdue notifications
    if (overdue.length > 0) {
        const overdueList = overdue.slice(0, 5).map(item =>
            `- ${item.instrumentType}${item.brandModel ? ` (${item.brandModel})` : ''}: ${Math.abs(item.daysUntilDue)} dagen te laat`
        ).join('\n');

        const overdueBody = `Er zijn ${overdue.length} instrumenten met achterstallig onderhoud:\n\n${overdueList}${overdue.length > 5 ? `\n... en ${overdue.length - 5} meer` : ''}`;

        for (const user of notifyUsers) {
            try {
                await sendNotification({
                    userId: user.id,
                    type: 'announcement',
                    title: 'Achterstallig onderhoud',
                    body: overdueBody,
                    data: { url: '/equipment' },
                    associationId,
                });
                sent++;
            } catch (error) {
                logger.error('Failed to send overdue maintenance notification', { userId: user.id, error });
                errors++;
            }
        }
    }

    // Send upcoming notifications
    if (upcoming.length > 0) {
        const upcomingList = upcoming.slice(0, 5).map(item =>
            `- ${item.instrumentType}${item.brandModel ? ` (${item.brandModel})` : ''}: over ${item.daysUntilDue} dagen`
        ).join('\n');

        const upcomingBody = `Er zijn ${upcoming.length} instrumenten die binnenkort onderhoud nodig hebben:\n\n${upcomingList}${upcoming.length > 5 ? `\n... en ${upcoming.length - 5} meer` : ''}`;

        for (const user of notifyUsers) {
            try {
                await sendNotification({
                    userId: user.id,
                    type: 'announcement',
                    title: 'Gepland onderhoud',
                    body: upcomingBody,
                    data: { url: '/maintenance-schedule' },
                    associationId,
                });
                sent++;
            } catch (error) {
                logger.error('Failed to send upcoming maintenance notification', { userId: user.id, error });
                errors++;
            }
        }
    }

    logger.info('Maintenance notifications sent', { associationId, overdue: overdue.length, upcoming: upcoming.length, sent, errors });

    return { sent, errors };
}

/**
 * Run maintenance check for all associations (called by scheduler)
 */
export async function runMaintenanceCheck(): Promise<void> {
    logger.info('Running maintenance check');

    // Get all active associations
    const associations = db.prepare(`
        SELECT id, name FROM associations WHERE status = 'active'
    `).all() as { id: string; name: string }[];

    for (const association of associations) {
        try {
            await sendMaintenanceNotifications(association.id);
        } catch (error) {
            logger.error('Failed to run maintenance check for association', { associationId: association.id, error });
        }
    }

    logger.info('Maintenance check completed', { associations: associations.length });
}

export default {
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
};
