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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-detail-title"
    >
      <div className="relative w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            {task && (
              <span className="font-mono text-xs px-2.5 py-1 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold">
                {task.identifier}
              </span>
            )}
            <h2
              id="task-detail-title"
              data-testid="detail-task-title"
              className="text-base font-semibold text-white truncate max-w-md"
            >
              {isLoading ? 'Loading task details...' : task?.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            aria-label="Close dialog"
            data-testid="close-task-detail-modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {isLoading && (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <LoadingSpinner size="md" />
              <span className="text-sm">Fetching task details...</span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>Failed to load task: {error.message}</span>
            </div>
          )}

          {actionError && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs"
            >
              {actionError}
            </div>
          )}

          {task && (
            <>
              {/* Status and Priority Quick Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/50 p-4 rounded-xl border border-slate-800/80">
                {/* Status selector */}
                <div className="space-y-1.5">
                  <span className="text-xs text-slate-400 font-medium">Status</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={task.status}
                      onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
                      disabled={updateMutation.isPending}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      data-testid="detail-task-status-select"
                    >
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="review">Review</option>
                      <option value="done">Done</option>
                    </select>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full border whitespace-nowrap font-medium ${
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
                <div className="space-y-1.5">
                  <span className="text-xs text-slate-400 font-medium">Priority</span>
                  <div className="flex items-center gap-2 pt-1">
                    <span
                      className={`text-xs px-3 py-1 rounded-full border flex items-center gap-1.5 font-medium ${
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
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Description
                </h3>
                <div
                  className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 text-sm text-slate-200 whitespace-pre-wrap min-h-[5rem]"
                  data-testid="detail-task-description"
                >
                  {task.description ? task.description : (
                    <span className="text-slate-500 italic">No description provided.</span>
                  )}
                </div>
              </div>

              {/* Properties Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {/* Assignee */}
                <div className="space-y-1.5 p-3 rounded-xl bg-slate-950/30 border border-slate-800/60">
                  <span className="text-slate-400 font-medium flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Assignee</span>
                  </span>
                  <select
                    value={task.assignee_id || ''}
                    onChange={(e) => handleAssigneeChange(e.target.value)}
                    disabled={updateMutation.isPending}
                    className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                <div className="space-y-1.5 p-3 rounded-xl bg-slate-950/30 border border-slate-800/60">
                  <span className="text-slate-400 font-medium flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Due Date</span>
                  </span>
                  <div className="pt-1 flex items-center gap-2">
                    <span
                      className={`text-xs font-medium ${
                        isOverdue(task.due_date, task.status)
                          ? 'text-rose-400 font-semibold'
                          : 'text-slate-200'
                      }`}
                      data-testid="detail-task-due-date"
                    >
                      {formatDate(task.due_date)}
                    </span>
                    {isOverdue(task.due_date, task.status) && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold">
                        Overdue
                      </span>
                    )}
                  </div>
                </div>

                {/* Creator */}
                <div className="space-y-1.5 p-3 rounded-xl bg-slate-950/30 border border-slate-800/60">
                  <span className="text-slate-400 font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Created By</span>
                  </span>
                  <p className="pt-1 text-slate-200" data-testid="detail-task-creator">
                    {task.creator?.name || task.creator?.email || 'Unknown'}
                  </p>
                </div>

                {/* Timestamps */}
                <div className="space-y-1.5 p-3 rounded-xl bg-slate-950/30 border border-slate-800/60">
                  <span className="text-slate-400 font-medium flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Updated</span>
                  </span>
                  <p className="pt-1 text-slate-400 text-[11px]" data-testid="detail-task-updated-at">
                    {formatDateTime(task.updated_at)}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        {task && (
          <div className="flex items-center justify-between border-t border-slate-800 px-6 py-4 bg-slate-950/40">
            <button
              type="button"
              onClick={() => onDelete(task)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors border border-transparent hover:border-rose-500/20"
              data-testid="delete-task-from-detail-button"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Task</span>
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => onEdit(task)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20"
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
