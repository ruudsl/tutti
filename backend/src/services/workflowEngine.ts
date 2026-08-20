import db from '../database/connection';
import { isModuleEnabled } from '../modules/service';
import { v4 as uuidv4 } from 'uuid';
import { sendEmail } from '../utils/email';
import sanitizeHtml from 'sanitize-html';

interface WorkflowAction {
  id: string;
  action_type: string;
  action_order: number;
  config: string;
  conditions: string | null;
  is_active: number;
}

interface ExecutionContext {
  workflowId: string;
  executionId: string;
  associationId: string;
  triggeredBy: string;
  entityType?: string;
  entityId?: string;
  entityData?: Record<string, any>;
  userId?: string;
  log: string[];
}

export async function executeWorkflow(
  workflowId: string,
  associationId: string,
  triggeredBy: 'manual' | 'schedule' | 'event' | 'date_field',
  userId?: string,
  entityType?: string,
  entityId?: string,
): Promise<{ executionId: string; success: boolean; error?: string }> {
  // Alle triggers - handmatig, gepland, op gebeurtenis - komen hier langs, dus
  // deze ene controle dekt ze allemaal. Een vereniging die de module
  // Workflow-automatisering uit heeft staan, moet ook geen mails of taken meer
  // krijgen uit regels die ooit zijn ingesteld. De regels zelf blijven staan en
  // doen het weer zodra de module aan gaat.
  if (!isModuleEnabled(associationId, 'workflows')) {
    return { executionId: '', success: false, error: 'Module workflows staat uit voor deze vereniging.' };
  }

  const executionId = uuidv4();
  const now = new Date().toISOString();

  // Create execution record
  db.prepare(
    `
    INSERT INTO workflow_executions (id, workflow_id, triggered_by, triggered_by_user_id, entity_type, entity_id, status, started_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?)
  `,
  ).run(executionId, workflowId, triggeredBy, userId || null, entityType || null, entityId || null, now, now);

  const context: ExecutionContext = {
    workflowId,
    executionId,
    associationId,
    triggeredBy,
    entityType,
    entityId,
    userId,
    log: [],
  };

  try {
    // Load entity data if available
    if (entityType && entityId) {
      context.entityData = await loadEntityData(entityType, entityId);
      context.log.push(`Loaded ${entityType} data for ID ${entityId}`);
    }

    // Get workflow actions
    const actions = db
      .prepare(
        `
      SELECT * FROM workflow_actions
      WHERE workflow_id = ? AND is_active = 1
      ORDER BY action_order
    `,
      )
      .all(workflowId) as WorkflowAction[];

    context.log.push(`Found ${actions.length} actions to execute`);

    // Execute each action
    for (const action of actions) {
      await executeAction(action, context);
    }

    // Mark as completed
    db.prepare(
      `
      UPDATE workflow_executions
      SET status = 'completed', completed_at = ?, execution_log = ?
      WHERE id = ?
    `,
    ).run(new Date().toISOString(), JSON.stringify(context.log), executionId);

    return { executionId, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    context.log.push(`ERROR: ${errorMessage}`);

    db.prepare(
      `
      UPDATE workflow_executions
      SET status = 'failed', completed_at = ?, error_message = ?, execution_log = ?
      WHERE id = ?
    `,
    ).run(new Date().toISOString(), errorMessage, JSON.stringify(context.log), executionId);

    return { executionId, success: false, error: errorMessage };
  }
}

async function executeAction(action: WorkflowAction, context: ExecutionContext): Promise<void> {
  const config = JSON.parse(action.config || '{}');
  context.log.push(`Executing action: ${action.action_type}`);

  // Check conditions if present
  if (action.conditions) {
    const conditions = JSON.parse(action.conditions);
    if (!evaluateConditions(conditions, context)) {
      context.log.push(`Skipped action (conditions not met)`);
      return;
    }
  }

  switch (action.action_type) {
    case 'send_email':
      await executeSendEmail(config, context);
      break;
    case 'send_notification':
      await executeSendNotification(config, context);
      break;
    case 'create_task':
      await executeCreateTask(config, context);
      break;
    case 'update_field':
      await executeUpdateField(config, context);
      break;
    case 'webhook':
      await executeWebhook(config, context);
      break;
    case 'delay':
      await executeDelay(config, context);
      break;
    default:
      context.log.push(`Unknown action type: ${action.action_type}`);
  }
}

async function executeSendEmail(config: Record<string, any>, context: ExecutionContext): Promise<void> {
  const { recipientType, recipientEmail, subject, body } = config;

  let recipients: string[] = [];

  if (recipientType === 'specific' && recipientEmail) {
    recipients = [recipientEmail];
  } else if (recipientType === 'entity_user' && context.entityData?.email) {
    recipients = [context.entityData.email];
  } else if (recipientType === 'all_members') {
    const members = db
      .prepare(
        `
      SELECT email FROM users
      WHERE association_id = ? AND status = 'active' AND deleted_at IS NULL
    `,
      )
      .all(context.associationId) as { email: string }[];
    recipients = members.map((m) => m.email);
  }

  if (recipients.length === 0) {
    context.log.push('No recipients found for email');
    return;
  }

  const processedSubject = replaceVariables(subject || '', context);
  const processedBody = replaceVariables(body || '', context);

  for (const email of recipients) {
    try {
      await sendEmail({
        to: email,
        subject: processedSubject,
        text: sanitizeHtml(processedBody, {
          allowedTags: [],
          allowedAttributes: {},
        }),
        html: processedBody,
      });
      context.log.push(`Email sent to ${email}`);
    } catch (error) {
      context.log.push(`Failed to send email to ${email}: ${error}`);
    }
  }
}

async function executeSendNotification(config: Record<string, any>, context: ExecutionContext): Promise<void> {
  const { title, message, recipientType, recipientUserId, priority } = config;

  let userIds: string[] = [];

  if (recipientType === 'specific' && recipientUserId) {
    userIds = [recipientUserId];
  } else if (recipientType === 'entity_user' && context.entityData?.userId) {
    userIds = [context.entityData.userId];
  } else if (recipientType === 'all_members') {
    const members = db
      .prepare(
        `
      SELECT id FROM users
      WHERE association_id = ? AND status = 'active' AND deleted_at IS NULL
    `,
      )
      .all(context.associationId) as { id: string }[];
    userIds = members.map((m) => m.id);
  }

  const now = new Date().toISOString();
  const processedTitle = replaceVariables(title || 'Notification', context);
  const processedMessage = replaceVariables(message || '', context);

  for (const userId of userIds) {
    // De tabel heeft geen priority-kolom; die hoort bij de extra gegevens.
    db.prepare(
      `
      INSERT INTO notifications (id, user_id, title, body, type, data, created_at)
      VALUES (?, ?, ?, ?, 'workflow', ?, ?)
    `,
    ).run(uuidv4(), userId, processedTitle, processedMessage, JSON.stringify({ priority: priority || 'medium' }), now);
  }

  context.log.push(`Created ${userIds.length} notifications`);
}

async function executeCreateTask(config: Record<string, any>, context: ExecutionContext): Promise<void> {
  const { title, description, assigneeType, assigneeUserId, dueDate, dueDaysFromNow, priority } = config;

  const taskId = uuidv4();
  const now = new Date().toISOString();

  let assignee: string | null = null;
  if (assigneeType === 'specific' && assigneeUserId) {
    assignee = assigneeUserId;
  } else if (assigneeType === 'entity_user' && context.entityData?.userId) {
    assignee = context.entityData.userId;
  }

  let taskDueDate: string | null = null;
  if (dueDate) {
    taskDueDate = dueDate;
  } else if (dueDaysFromNow) {
    const due = new Date();
    due.setDate(due.getDate() + dueDaysFromNow);
    taskDueDate = due.toISOString().split('T')[0];
  }

  const processedTitle = replaceVariables(title || 'New Task', context);
  const processedDescription = replaceVariables(description || '', context);

  db.prepare(
    `
    INSERT INTO tasks (id, association_id, title, description, assigned_to, due_date, priority, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
  `,
  ).run(
    taskId,
    context.associationId,
    processedTitle,
    processedDescription,
    assignee,
    taskDueDate,
    priority || 'medium',
    context.userId || null,
    now,
    now,
  );

  context.log.push(`Task created: ${processedTitle}`);
}

async function executeUpdateField(config: Record<string, any>, context: ExecutionContext): Promise<void> {
  const { entityType, fieldName, fieldValue } = config;

  if (!context.entityId || !entityType || !fieldName) {
    context.log.push('Missing entity or field information for update');
    return;
  }

  const tableName = getTableName(entityType);
  if (!tableName) {
    context.log.push(`Unknown entity type: ${entityType}`);
    return;
  }

  // fieldName komt uit de vrij invulbare config van de workflow en wordt in de
  // query geplakt. Zonder controle kan een beheerder daar een hele SET-clausule
  // in kwijt ("role = 'admin' WHERE 1=1 --") en zo rijen van andere
  // verenigingen aanpassen. Alleen een kolom die de tabel echt heeft mag erin.
  const kolommen = kolommenVan(tableName);
  if (!kolommen.has(fieldName)) {
    context.log.push(`Unknown field for ${entityType}: ${fieldName}`);
    return;
  }

  if (BESCHERMDE_KOLOMMEN.has(fieldName)) {
    context.log.push(`Field ${fieldName} cannot be changed by a workflow`);
    return;
  }

  const processedValue = replaceVariables(String(fieldValue), context);

  // Niet elke tabel houdt updated_at bij; die alleen meenemen waar hij bestaat.
  const zetUpdatedAt = kolommen.has('updated_at');
  const sql = zetUpdatedAt
    ? `UPDATE ${tableName} SET ${fieldName} = ?, updated_at = ? WHERE id = ?`
    : `UPDATE ${tableName} SET ${fieldName} = ? WHERE id = ?`;
  const params = zetUpdatedAt
    ? [processedValue, new Date().toISOString(), context.entityId]
    : [processedValue, context.entityId];

  try {
    db.prepare(sql).run(...params);
    context.log.push(`Updated ${entityType}.${fieldName} to ${processedValue}`);
  } catch (error) {
    context.log.push(`Failed to update field: ${error}`);
  }
}

/**
 * Kolommen die een workflow nooit mag overschrijven: ze bepalen bij wie een rij
 * hoort of waarmee er wordt ingelogd.
 */
const BESCHERMDE_KOLOMMEN = new Set([
  'id',
  'association_id',
  'password_hash',
  'mfa_secret',
  'microsoft_id',
  'created_at',
]);

/** Kolomnamen van een tabel, uit de database zelf. */
function kolommenVan(tabel: string): Set<string> {
  const rijen = db.prepare(`PRAGMA table_info(${tabel})`).all() as Array<{ name: string }>;
  return new Set(rijen.map((r) => r.name));
}

// De acties 'aan groep toevoegen' en 'uit groep verwijderen' zijn
// verwijderd: de tabel group_members is nooit aangemaakt, dus beide
// liepen bij uitvoering stuk.

async function executeWebhook(config: Record<string, any>, context: ExecutionContext): Promise<void> {
  const { url, method, headers, body } = config;

  if (!url) {
    context.log.push('No webhook URL specified');
    return;
  }

  const processedBody = body ? replaceVariables(JSON.stringify(body), context) : undefined;

  try {
    const response = await fetch(url, {
      method: method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: processedBody,
    });

    context.log.push(`Webhook ${method || 'POST'} to ${url}: ${response.status}`);
  } catch (error) {
    context.log.push(`Webhook failed: ${error}`);
  }
}

async function executeDelay(config: Record<string, any>, context: ExecutionContext): Promise<void> {
  const { minutes } = config;
  if (minutes && minutes > 0) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(minutes, 5) * 60 * 1000));
    context.log.push(`Delayed ${Math.min(minutes, 5)} minutes`);
  }
}

function evaluateConditions(conditions: any, context: ExecutionContext): boolean {
  if (!conditions || Object.keys(conditions).length === 0) {
    return true;
  }

  // Simple condition evaluation
  if (conditions.field && conditions.operator && context.entityData) {
    const fieldValue = context.entityData[conditions.field];
    const compareValue = conditions.value;

    switch (conditions.operator) {
      case 'equals':
        return fieldValue === compareValue;
      case 'not_equals':
        return fieldValue !== compareValue;
      case 'contains':
        return String(fieldValue).includes(String(compareValue));
      case 'greater_than':
        return Number(fieldValue) > Number(compareValue);
      case 'less_than':
        return Number(fieldValue) < Number(compareValue);
      case 'is_empty':
        return !fieldValue || fieldValue === '';
      case 'is_not_empty':
        return !!fieldValue && fieldValue !== '';
      default:
        return true;
    }
  }

  return true;
}

function replaceVariables(text: string, context: ExecutionContext): string {
  let result = text;

  // Replace entity variables
  if (context.entityData) {
    for (const [key, value] of Object.entries(context.entityData)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value ?? ''));
    }
  }

  // Replace common variables
  result = result.replace(/{{date}}/g, new Date().toLocaleDateString());
  result = result.replace(/{{time}}/g, new Date().toLocaleTimeString());
  result = result.replace(/{{datetime}}/g, new Date().toLocaleString());

  return result;
}

async function loadEntityData(entityType: string, entityId: string): Promise<Record<string, any> | undefined> {
  const tableName = getTableName(entityType);
  if (!tableName) return undefined;

  try {
    const data = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(entityId) as Record<string, any> | undefined;
    return data;
  } catch {
    return undefined;
  }
}

function getTableName(entityType: string): string | null {
  const mapping: Record<string, string> = {
    user: 'users',
    member: 'users',
    concert: 'concerts',
    rehearsal: 'rehearsals',
    task: 'tasks',
    project: 'projects',
    tour: 'tours',
    equipment: 'equipment',
  };
  return mapping[entityType] || null;
}

/**
 * Draai de workflows waarvan het geplande tijdstip nu is.
 *
 * Zonder associationId gaat dit over alle verenigingen; zo roept de planner in
 * scheduler/workflow-runner.ts het aan, en daar hoort dat ook. De route die
 * hetzelfde handmatig aftrapt geeft de vereniging van de aanvrager mee: die
 * hoort alleen zijn eigen automatisering te kunnen laten afgaan, niet de mails
 * en meldingen van elke andere vereniging op de installatie.
 */
export function processScheduledWorkflows(associationId?: string): void {
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5);

  // Find workflows with schedule triggers that match current time
  const triggers = db
    .prepare(
      `
    SELECT t.*, w.id as workflow_id, w.association_id
    FROM workflow_triggers t
    JOIN workflows w ON t.workflow_id = w.id
    WHERE t.trigger_type = 'schedule'
      AND t.is_active = 1
      AND w.is_active = 1
      AND w.deleted_at IS NULL
      AND t.time_of_day = ?
      AND (? IS NULL OR w.association_id = ?)
  `,
    )
    .all(currentTime, associationId ?? null, associationId ?? null) as any[];

  for (const trigger of triggers) {
    // Check if cron matches (simplified - just check time)
    executeWorkflow(trigger.workflow_id, trigger.association_id, 'schedule').catch((err) =>
      console.error(`Scheduled workflow ${trigger.workflow_id} failed:`, err),
    );
  }
}

/** Zie processScheduledWorkflows voor de rol van associationId. */
export function processDateFieldWorkflows(associationId?: string): void {
  // Find workflows with date_field triggers
  const triggers = db
    .prepare(
      `
    SELECT t.*, w.id as workflow_id, w.association_id
    FROM workflow_triggers t
    JOIN workflows w ON t.workflow_id = w.id
    WHERE t.trigger_type = 'date_field'
      AND t.is_active = 1
      AND w.is_active = 1
      AND w.deleted_at IS NULL
      AND t.date_field_entity IS NOT NULL
      AND t.date_field_name IS NOT NULL
      AND (? IS NULL OR w.association_id = ?)
  `,
    )
    .all(associationId ?? null, associationId ?? null) as any[];

  for (const trigger of triggers) {
    const tableName = getTableName(trigger.date_field_entity);
    if (!tableName) continue;

    const daysBefore = trigger.days_before || 0;
    const daysAfter = trigger.days_after || 0;

    // Calculate target date
    const targetDate = new Date();
    if (daysBefore > 0) {
      targetDate.setDate(targetDate.getDate() + daysBefore);
    } else if (daysAfter > 0) {
      targetDate.setDate(targetDate.getDate() - daysAfter);
    }
    const targetDateStr = targetDate.toISOString().split('T')[0];

    try {
      const entities = db
        .prepare(
          `
        SELECT id FROM ${tableName}
        WHERE DATE(${trigger.date_field_name}) = ?
      `,
        )
        .all(targetDateStr) as { id: string }[];

      for (const entity of entities) {
        executeWorkflow(
          trigger.workflow_id,
          trigger.association_id,
          'date_field',
          undefined,
          trigger.date_field_entity,
          entity.id,
        ).catch((err) => console.error(`Date field workflow failed:`, err));
      }
    } catch (err) {
      console.error(`Error processing date field trigger:`, err);
    }
  }
}
