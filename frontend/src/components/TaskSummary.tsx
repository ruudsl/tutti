import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon, IconName } from './Icon';
import { getTaskSummary, TaskStatus, TaskPriority } from '../api/tasks';
import { SkeletonText } from './Skeleton';

interface TaskSummaryProps {
  onTaskClick?: (taskId: string) => void;
  compact?: boolean;
}

const STATUS_ICONS: Record<TaskStatus, IconName> = {
  todo: 'circle',
  in_progress: 'clock',
  review: 'eye',
  done: 'checkCircle',
  cancelled: 'close',
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'bg-base-300',
  in_progress: 'bg-info/20 text-info',
  review: 'bg-warning/20 text-warning',
  done: 'bg-success/20 text-success',
  cancelled: 'bg-error/20 text-error',
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'text-base-content/50',
  medium: 'text-info',
  high: 'text-warning',
  urgent: 'text-error',
};

export function TaskSummary({ onTaskClick, compact = false }: TaskSummaryProps) {
  const { t } = useTranslation();

  const { data: summary, isLoading } = useQuery({
    queryKey: ['task-summary'],
    queryFn: getTaskSummary,
    staleTime: 30000, // 30 seconds
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonText lines={3} />
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  return (
    <div className={compact ? 'space-y-3' : 'space-y-6'}>
      {/* Status Summary */}
      <div className="card bg-base-200">
        <div className="card-body p-4">
          <h3 className="font-semibold text-sm uppercase tracking-wider text-base-content/60 mb-3">
            {t('tasks.statusSummary')}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(['todo', 'in_progress', 'review', 'done'] as TaskStatus[]).map((status) => (
              <div key={status} className={`rounded-lg p-3 ${STATUS_COLORS[status]}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon name={STATUS_ICONS[status]} size={14} aria-hidden={true} />
                  <span className="text-xs font-medium">{t(`tasks.status.${status}`)}</span>
                </div>
                <div className="text-2xl font-bold">{summary.statusSummary[status] || 0}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-base-300 flex items-center justify-between">
            <span className="text-sm text-base-content/60">{t('tasks.totalOpen')}</span>
            <span className="text-lg font-semibold">{summary.totalOpen}</span>
          </div>
        </div>
      </div>

      {/* My Tasks */}
      {summary.myTasks.length > 0 && (
        <div className="card bg-base-200">
          <div className="card-body p-4">
            <h3 className="font-semibold text-sm uppercase tracking-wider text-base-content/60 mb-3">
              {t('tasks.myTasks')}
            </h3>
            <div className="space-y-2">
              {summary.myTasks.slice(0, compact ? 3 : 5).map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-base-300 cursor-pointer transition-colors w-full text-left"
                  onClick={() => onTaskClick?.(task.id)}
                >
                  <Icon
                    name={STATUS_ICONS[task.status]}
                    size={14}
                    className={PRIORITY_COLORS[task.priority]}
                    aria-hidden={true}
                  />
                  <span className="flex-1 truncate text-sm">{task.title}</span>
                  {task.listName && (
                    <span className="badge badge-xs" style={{ backgroundColor: task.listColor || undefined }}>
                      {task.listName}
                    </span>
                  )}
                  {task.dueDate && (
                    <span className={`text-xs ${isOverdue(task.dueDate) ? 'text-error' : 'text-base-content/50'}`}>
                      {new Date(task.dueDate).toLocaleDateString()}
                    </span>
                  )}
                </button>
              ))}
              {summary.myTasks.length > (compact ? 3 : 5) && (
                <div className="text-center pt-2">
                  <span className="text-xs text-base-content/50">
                    +{summary.myTasks.length - (compact ? 3 : 5)} {t('common.more')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Overdue Tasks */}
      {summary.overdueTasks.length > 0 && (
        <div className="card bg-error/10 border border-error/30">
          <div className="card-body p-4">
            <h3 className="font-semibold text-sm uppercase tracking-wider text-error mb-3 flex items-center gap-2">
              <Icon name="warning" size={14} aria-hidden={true} />
              {t('tasks.overdueTasks')}
            </h3>
            <div className="space-y-2">
              {summary.overdueTasks.slice(0, compact ? 3 : 5).map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-error/20 cursor-pointer transition-colors w-full text-left"
                  onClick={() => onTaskClick?.(task.id)}
                >
                  <Icon name={STATUS_ICONS[task.status]} size={14} className="text-error" aria-hidden={true} />
                  <span className="flex-1 truncate text-sm">{task.title}</span>
                  {task.assignedToName && <span className="text-xs text-base-content/50">{task.assignedToName}</span>}
                  {task.dueDate && (
                    <span className="text-xs text-error font-medium">
                      {new Date(task.dueDate).toLocaleDateString()}
                    </span>
                  )}
                </button>
              ))}
              {summary.overdueTasks.length > (compact ? 3 : 5) && (
                <div className="text-center pt-2">
                  <span className="text-xs text-error/70">
                    +{summary.overdueTasks.length - (compact ? 3 : 5)} {t('common.more')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recently Completed */}
      {!compact && summary.recentCompleted.length > 0 && (
        <div className="card bg-base-200">
          <div className="card-body p-4">
            <h3 className="font-semibold text-sm uppercase tracking-wider text-base-content/60 mb-3 flex items-center gap-2">
              <Icon name="checkCircle" size={14} className="text-success" aria-hidden={true} />
              {t('tasks.recentlyCompleted')}
            </h3>
            <div className="space-y-2">
              {summary.recentCompleted.slice(0, 5).map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-base-300 cursor-pointer transition-colors opacity-70 w-full text-left"
                  onClick={() => onTaskClick?.(task.id)}
                >
                  <Icon name="checkCircle" size={14} className="text-success" aria-hidden={true} />
                  <span className="flex-1 truncate text-sm line-through">{task.title}</span>
                  {task.listName && (
                    <span className="badge badge-xs" style={{ backgroundColor: task.listColor || undefined }}>
                      {task.listName}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TaskSummary;
