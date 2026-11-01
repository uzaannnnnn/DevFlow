import React, { useState } from 'react';
import { useTask, useUpdateTaskMutation } from '../useTasks';
import { useProjectMembers } from '../../projects/useProjects';
import {
  Task,
  TaskStatus,
  TASK_STATUS_CONFIG,
  TASK_PRIORITY_CONFIG,
} from '../types';
import { LoadingSpinner } from '../../../shared/ui/LoadingSpinner';
import { CommentSection } from '../../comments/components/CommentSection';
import {
  X,
  Calendar,
  User,
  Clock,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

export interface TaskDetailModalProps {
  isOpen: boolean;
  projectId: string;
  taskId: string | null;
  onClose: () => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  isOpen,
  projectId,
  taskId,
  onClose,
  onEdit,
  onDelete,
}) => {
  const { data, isLoading, error } = useTask(taskId || undefined);
  const { data: membersData } = useProjectMembers(projectId);
  const updateMutation = useUpdateTaskMutation(projectId);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!isOpen || !taskId) return null;

  const task = data?.task;

  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (!task || task.status === newStatus) return;
    setActionError(null);
    try {
      await updateMutation.mutateAsync({
        taskId: task.id,
        input: { status: newStatus },
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handleAssigneeChange = async (newAssigneeId: string) => {
    if (!task) return;
    const finalAssigneeId = newAssigneeId === '' ? null : newAssigneeId;
    if (task.assignee_id === finalAssigneeId) return;
    setActionError(null);
    try {
      await updateMutation.mutateAsync({
        taskId: task.id,
        input: { assignee_id: finalAssigneeId },
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update assignee');
    }
  };

  const isOverdue = (dueDateStr?: string | null, status?: TaskStatus) => {
    if (!dueDateStr || status === 'done') return false;
    return new Date(dueDateStr).getTime() < Date.now();
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'None';
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return 'None';
    return new Date(dateStr).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-detail-title"
    >
      <div className="relative w-full max-w-2xl rounded-lg bg-surface border border-line shadow-modal overflow-hidden text-ink max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            {task && (
              <span className="font-mono text-2xs px-2 py-0.5 rounded bg-subtle text-accent border border-accent/25 font-semibold">
                {task.identifier}
              </span>
            )}
            <h2
              id="task-detail-title"
              data-testid="detail-task-title"
              className="text-sm font-semibold text-ink truncate max-w-md"
            >
              {isLoading ? 'Loading task details...' : task?.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-muted hover:text-ink transition-colors"
            aria-label="Close dialog"
            data-testid="close-task-detail-modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {isLoading && (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-muted">
              <LoadingSpinner size="md" />
              <span className="text-xs">Fetching task details...</span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-md bg-danger-soft border border-danger/25 text-danger text-xs flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>Failed to load task: {error.message}</span>
            </div>
          )}

          {actionError && (
            <div
              role="alert"
              className="p-3 rounded-md bg-danger-soft border border-danger/25 text-danger text-xs"
            >
              {actionError}
            </div>
          )}

          {task && (
            <>
              {/* Status and Priority Quick Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-subtle/50 p-3.5 rounded-md border border-line">
                {/* Status selector */}
                <div className="space-y-1">
                  <span className="text-2xs text-muted font-medium uppercase tracking-wider">Status</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={task.status}
                      onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
                      disabled={updateMutation.isPending}
                      className="w-full px-2.5 py-1.5 rounded-md bg-surface border border-line text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      data-testid="detail-task-status-select"
                    >
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="review">Review</option>
                      <option value="done">Done</option>
                    </select>
                    <span
                      className={`text-2xs px-2 py-0.5 rounded border whitespace-nowrap font-medium ${
                        TASK_STATUS_CONFIG[task.status].bg
                      } ${TASK_STATUS_CONFIG[task.status].text} ${
                        TASK_STATUS_CONFIG[task.status].border
                      }`}
                    >
                      {TASK_STATUS_CONFIG[task.status].label}
                    </span>
                  </div>
                </div>

                {/* Priority display */}
                <div className="space-y-1">
                  <span className="text-2xs text-muted font-medium uppercase tracking-wider">Priority</span>
                  <div className="flex items-center gap-2 pt-1">
                    <span
                      className={`text-2xs px-2.5 py-1 rounded border flex items-center gap-1.5 font-medium ${
                        TASK_PRIORITY_CONFIG[task.priority].bg
                      } ${TASK_PRIORITY_CONFIG[task.priority].text} ${
                        TASK_PRIORITY_CONFIG[task.priority].border
                      }`}
                      data-testid="detail-task-priority-badge"
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${TASK_PRIORITY_CONFIG[task.priority].dot}`}
                      />
                      {TASK_PRIORITY_CONFIG[task.priority].label}
                    </span>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <h3 className="text-2xs font-semibold text-muted uppercase tracking-wider">
                  Description
                </h3>
                <div
                  className="p-3.5 rounded-md bg-surface border border-line text-xs text-ink whitespace-pre-wrap min-h-[5rem]"
                  data-testid="detail-task-description"
                >
                  {task.description ? task.description : (
                    <span className="text-muted italic">No description provided.</span>
                  )}
                </div>
              </div>

              {/* Properties Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                {/* Assignee */}
                <div className="space-y-1 p-3 rounded-md bg-surface border border-line">
                  <span className="text-muted font-medium flex items-center gap-1.5 text-2xs uppercase tracking-wider">
                    <User className="w-3.5 h-3.5 text-accent" />
                    <span>Assignee</span>
                  </span>
                  <select
                    value={task.assignee_id || ''}
                    onChange={(e) => handleAssigneeChange(e.target.value)}
                    disabled={updateMutation.isPending}
                    className="w-full mt-1 px-2.5 py-1.5 rounded-md bg-surface border border-line text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    data-testid="detail-task-assignee-select"
                  >
                    <option value="">Unassigned</option>
                    {membersData?.members.map((member) => (
                      <option key={member.user_id} value={member.user_id}>
                        {member.name || member.email}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Due Date */}
                <div className="space-y-1 p-3 rounded-md bg-surface border border-line">
                  <span className="text-muted font-medium flex items-center gap-1.5 text-2xs uppercase tracking-wider">
                    <Calendar className="w-3.5 h-3.5 text-accent" />
                    <span>Due Date</span>
                  </span>
                  <div className="pt-1 flex items-center gap-2">
                    <span
                      className={`text-xs font-mono font-medium ${
                        isOverdue(task.due_date, task.status)
                          ? 'text-danger font-semibold'
                          : 'text-ink'
                      }`}
                      data-testid="detail-task-due-date"
                    >
                      {formatDate(task.due_date)}
                    </span>
                    {isOverdue(task.due_date, task.status) && (
                      <span className="px-1.5 py-0.2 rounded text-2xs bg-danger-soft text-danger border border-danger/25 font-semibold">
                        Overdue
                      </span>
                    )}
                  </div>
                </div>

                {/* Creator */}
                <div className="space-y-1 p-3 rounded-md bg-surface border border-line">
                  <span className="text-muted font-medium flex items-center gap-1.5 text-2xs uppercase tracking-wider">
                    <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                    <span>Created By</span>
                  </span>
                  <p className="pt-1 text-xs text-ink" data-testid="detail-task-creator">
                    {task.creator?.name || task.creator?.email || 'Unknown'}
                  </p>
                </div>

                {/* Timestamps */}
                <div className="space-y-1 p-3 rounded-md bg-surface border border-line">
                  <span className="text-muted font-medium flex items-center gap-1.5 text-2xs uppercase tracking-wider">
                    <Clock className="w-3.5 h-3.5 text-accent" />
                    <span>Updated</span>
                  </span>
                  <p className="pt-1 text-muted text-2xs font-mono" data-testid="detail-task-updated-at">
                    {formatDateTime(task.updated_at)}
                  </p>
                </div>
              </div>

              {/* Comments Section */}
              <CommentSection taskId={task.id} />
            </>
          )}
        </div>

        {/* Footer Actions */}
        {task && (
          <div className="flex items-center justify-between border-t border-line px-6 py-3.5 bg-subtle/30">
            <button
              type="button"
              onClick={() => onDelete(task)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-danger hover:bg-danger-soft transition-colors"
              data-testid="delete-task-from-detail-button"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Task</span>
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-md text-xs font-medium text-muted hover:text-ink transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => onEdit(task)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium bg-ink text-surface hover:bg-ink/90 active:bg-ink transition-colors shadow-sm"
                data-testid="edit-task-from-detail-button"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Task</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
