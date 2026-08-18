import api from './client';

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface TaskList {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  sortOrder: number;
  openCount: number;
  totalCount: number;
  createdAt: string;
}

export interface ChecklistItem {
  id: string;
  content: string;
  isCompleted: boolean;
  sortOrder: number;
  completedBy?: string;
  completedByName?: string;
  completedAt?: string;
}

export interface TaskComment {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskAssignment {
  userId: string;
  userName: string;
  assignedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  taskListId?: string;
  listName?: string;
  listColor?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  reminderAt?: string;
  estimatedHours?: number;
  actualHours?: number;
  createdBy: string;
  createdByName: string;
  assignedTo?: string;
  assignedToName?: string;
  checklistTotal: number;
  checklistDone: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface TaskDetail extends Task {
  relatedEntityType?: string;
  relatedEntityId?: string;
  checklist: ChecklistItem[];
  comments: TaskComment[];
  assignments: TaskAssignment[];
}

export interface CreateTaskData {
  title: string;
  description?: string;
  taskListId?: string;
  priority?: TaskPriority;
  dueDate?: string;
  reminderAt?: string;
  estimatedHours?: number;
  assignedTo?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export interface UpdateTaskData {
  title?: string;
  description?: string | null;
  taskListId?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  reminderAt?: string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  assignedTo?: string | null;
}

export interface TaskFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  listId?: string;
  assignedTo?: string;
  search?: string;
  showCompleted?: boolean;
}

export interface CreateTaskListData {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
}

// Task Lists
export async function getTaskLists(): Promise<TaskList[]> {
  const response = await api.get('/tasks/lists');
  return response.data;
}

export async function createTaskList(data: CreateTaskListData): Promise<{ id: string; message: string }> {
  const response = await api.post('/tasks/lists', data);
  return response.data;
}

export async function updateTaskList(id: string, data: Partial<CreateTaskListData>): Promise<{ message: string }> {
  const response = await api.put(`/tasks/lists/${id}`, data);
  return response.data;
}

export async function deleteTaskList(id: string): Promise<{ message: string }> {
  const response = await api.delete(`/tasks/lists/${id}`);
  return response.data;
}

// Tasks
export async function getTasks(filters?: TaskFilters): Promise<Task[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.priority) params.set('priority', filters.priority);
  if (filters?.listId) params.set('listId', filters.listId);
  if (filters?.assignedTo) params.set('assignedTo', filters.assignedTo);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.showCompleted) params.set('showCompleted', 'true');

  const query = params.toString();
  const response = await api.get(`/tasks${query ? `?${query}` : ''}`);
  return response.data;
}

export async function getTask(id: string): Promise<TaskDetail> {
  const response = await api.get(`/tasks/${id}`);
  return response.data;
}

export async function createTask(data: CreateTaskData): Promise<{ id: string; message: string }> {
  const response = await api.post('/tasks', data);
  return response.data;
}

export async function updateTask(id: string, data: UpdateTaskData): Promise<{ message: string }> {
  const response = await api.put(`/tasks/${id}`, data);
  return response.data;
}

export async function deleteTask(id: string): Promise<{ message: string }> {
  const response = await api.delete(`/tasks/${id}`);
  return response.data;
}

// Checklist
export async function addChecklistItem(
  taskId: string,
  content: string,
): Promise<{ id: string; content: string; isCompleted: boolean; message: string }> {
  const response = await api.post(`/tasks/${taskId}/checklist`, { content });
  return response.data;
}

export async function updateChecklistItem(
  taskId: string,
  itemId: string,
  data: { content?: string; isCompleted?: boolean },
): Promise<{ message: string }> {
  const response = await api.put(`/tasks/${taskId}/checklist/${itemId}`, data);
  return response.data;
}

export async function deleteChecklistItem(taskId: string, itemId: string): Promise<{ message: string }> {
  const response = await api.delete(`/tasks/${taskId}/checklist/${itemId}`);
  return response.data;
}

// Comments
export async function addTaskComment(taskId: string, content: string): Promise<TaskComment & { message: string }> {
  const response = await api.post(`/tasks/${taskId}/comments`, { content });
  return response.data;
}

export async function deleteTaskComment(taskId: string, commentId: string): Promise<{ message: string }> {
  const response = await api.delete(`/tasks/${taskId}/comments/${commentId}`);
  return response.data;
}

// Templates
export interface TaskTemplate {
  id: string;
  name: string;
  description?: string;
  taskListId?: string;
  listName?: string;
  listColor?: string;
  priority: TaskPriority;
  estimatedHours?: number;
  checklistItems: string[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface CreateTaskTemplateData {
  name: string;
  description?: string;
  taskListId?: string;
  priority?: TaskPriority;
  estimatedHours?: number;
  checklistItems?: string[];
}

export async function getTaskTemplates(): Promise<TaskTemplate[]> {
  const response = await api.get('/tasks/templates');
  return response.data;
}

export async function createTaskTemplate(data: CreateTaskTemplateData): Promise<{ id: string; message: string }> {
  const response = await api.post('/tasks/templates', data);
  return response.data;
}

export async function updateTaskTemplate(
  id: string,
  data: Partial<CreateTaskTemplateData>,
): Promise<{ message: string }> {
  const response = await api.put(`/tasks/templates/${id}`, data);
  return response.data;
}

export async function deleteTaskTemplate(id: string): Promise<{ message: string }> {
  const response = await api.delete(`/tasks/templates/${id}`);
  return response.data;
}

export async function createTaskFromTemplate(
  templateId: string,
  data?: { title?: string; assignedTo?: string; dueDate?: string },
): Promise<{ id: string; title: string; message: string }> {
  const response = await api.post(`/tasks/templates/${templateId}/create-task`, data || {});
  return response.data;
}

export async function applyTaskTemplate(
  templateId: string,
  data?: { listId?: string },
): Promise<{ tasks: { id: string; title: string }[]; message: string }> {
  const response = await api.post(`/tasks/templates/${templateId}/apply`, data || {});
  return response.data;
}

// Summary (for dashboard)
export interface TaskSummary {
  statusSummary: Record<TaskStatus, number>;
  totalOpen: number;
  myTasks: {
    id: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate?: string;
    listName?: string;
    listColor?: string;
  }[];
  overdueTasks: {
    id: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate?: string;
    listName?: string;
    listColor?: string;
    assignedToName?: string;
  }[];
  recentCompleted: {
    id: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate?: string;
    listName?: string;
    listColor?: string;
    assignedToName?: string;
  }[];
}

export async function getTaskSummary(): Promise<TaskSummary> {
  const response = await api.get('/tasks/summary');
  return response.data;
}
