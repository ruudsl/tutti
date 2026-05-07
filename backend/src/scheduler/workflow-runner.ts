import { processScheduledWorkflows, processDateFieldWorkflows } from '../services/workflowEngine';

export function runWorkflowScheduler(): void {
  console.log('[Workflow Scheduler] Starting scheduled workflow check...');
  processScheduledWorkflows();
}

export function runDateFieldWorkflows(): void {
  console.log('[Workflow Scheduler] Starting date field workflow check...');
  processDateFieldWorkflows();
}
