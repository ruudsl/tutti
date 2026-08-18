import api from './client';

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  runOncePerEntity: boolean;
  triggerCount: number;
  actionCount: number;
  executionCount: number;
  failedCount: number;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowTrigger {
  id: string;
  triggerType: 'schedule' | 'event' | 'date_field' | 'manual';
  eventName?: string;
  scheduleCron?: string;
  dateFieldEntity?: string;
  dateFieldName?: string;
  daysBefore?: number;
  daysAfter?: number;
  timeOfDay?: string;
  conditions?: Record<string, unknown>;
  isActive: boolean;
}

export interface WorkflowAction {
  id: string;
  actionType:
    | 'send_email'
    | 'send_notification'
    | 'create_task'
    | 'update_field'
    | 'add_to_group'
    | 'remove_from_group'
    | 'webhook'
    | 'delay';
  actionOrder: number;
  config: Record<string, unknown>;
  conditions?: Record<string, unknown>;
  isActive: boolean;
}

export interface WorkflowDetail extends Workflow {
  createdBy: string;
  triggers: WorkflowTrigger[];
  actions: WorkflowAction[];
}

export interface WorkflowExecution {
  id: string;
  triggeredBy: string;
  triggeredByName?: string;
  entityType?: string;
  entityId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface CreateWorkflowData {
  name: string;
  description?: string;
  isActive?: boolean;
  runOncePerEntity?: boolean;
  triggers: Omit<WorkflowTrigger, 'id' | 'isActive'>[];
  actions: Omit<WorkflowAction, 'id' | 'isActive'>[];
}

export interface UpdateWorkflowData {
  name?: string;
  description?: string;
  isActive?: boolean;
  runOncePerEntity?: boolean;
}

export interface WorkflowEvent {
  name: string;
  label: string;
  entity: string;
}

export const getWorkflows = async (): Promise<Workflow[]> => {
  const { data } = await api.get('/workflows');
  return data;
};

export const getWorkflow = async (id: string): Promise<WorkflowDetail> => {
  const { data } = await api.get(`/workflows/${id}`);
  return data;
};

export const createWorkflow = async (workflow: CreateWorkflowData): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/workflows', workflow);
  return data;
};

export const updateWorkflow = async (id: string, updates: UpdateWorkflowData): Promise<{ message: string }> => {
  const { data } = await api.patch(`/workflows/${id}`, updates);
  return data;
};

export const deleteWorkflow = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/workflows/${id}`);
  return data;
};

export const addWorkflowTrigger = async (
  workflowId: string,
  trigger: Omit<WorkflowTrigger, 'id' | 'isActive'>,
): Promise<{ id: string; message: string }> => {
  const { data } = await api.post(`/workflows/${workflowId}/triggers`, trigger);
  return data;
};

export const removeWorkflowTrigger = async (workflowId: string, triggerId: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/workflows/${workflowId}/triggers/${triggerId}`);
  return data;
};

export const addWorkflowAction = async (
  workflowId: string,
  action: Omit<WorkflowAction, 'id' | 'isActive'>,
): Promise<{ id: string; message: string }> => {
  const { data } = await api.post(`/workflows/${workflowId}/actions`, action);
  return data;
};

export const removeWorkflowAction = async (workflowId: string, actionId: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/workflows/${workflowId}/actions/${actionId}`);
  return data;
};

export const updateWorkflowTrigger = async (
  workflowId: string,
  triggerId: string,
  updates: Partial<Omit<WorkflowTrigger, 'id' | 'isActive'>>,
): Promise<{ message: string }> => {
  const { data } = await api.patch(`/workflows/${workflowId}/triggers/${triggerId}`, updates);
  return data;
};

export const updateWorkflowAction = async (
  workflowId: string,
  actionId: string,
  updates: Partial<Omit<WorkflowAction, 'id' | 'isActive'>>,
): Promise<{ message: string }> => {
  const { data } = await api.patch(`/workflows/${workflowId}/actions/${actionId}`, updates);
  return data;
};

export const runWorkflow = async (id: string): Promise<{ executionId: string; message: string }> => {
  const { data } = await api.post(`/workflows/${id}/run`);
  return data;
};

export const getWorkflowExecutions = async (
  id: string,
  params?: { limit?: number; offset?: number },
): Promise<{
  executions: WorkflowExecution[];
  total: number;
  limit: number;
  offset: number;
}> => {
  const { data } = await api.get(`/workflows/${id}/executions`, { params });
  return data;
};

export const getAvailableEvents = async (): Promise<WorkflowEvent[]> => {
  const { data } = await api.get('/workflows/events/available');
  return data;
};
