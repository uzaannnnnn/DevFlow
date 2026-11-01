import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createTaskSchema, CreateTaskFormValues } from '../schemas';
import { useCreateTaskMutation } from '../useTasks';
import { useProjectMembers } from '../../projects/useProjects';
import { Task, TaskStatus, TaskPriority } from '../types';
import { ApiClientError } from '../../../shared/lib/api-client';
import { LoadingSpinner } from '../../../shared/ui/LoadingSpinner';
import { X, CheckSquare } from 'lucide-react';

export interface CreateTaskModalProps {
  isOpen: boolean;
  projectId: string;
  initialStatus?: TaskStatus;
  onClose: () => void;
  onCreated?: (task: Task) => void;
  onSuccess?: () => void;
}

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  isOpen,
  projectId,
  initialStatus,
  onClose,
  onCreated,
  onSuccess,
}) => {
  const [serverError, setServerError] = useState<string | null>(null);
  const createMutation = useCreateTaskMutation(projectId);
  const { data: membersData } = useProjectMembers(projectId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateTaskFormValues>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: {
      title: '',
      description: '',
      status: initialStatus || 'todo',
      priority: 'medium',
      assignee_id: '',
      due_date: '',
    },
  });

  if (!isOpen) return null;

  const handleClose = () => {
    reset();
    setServerError(null);
    onClose();
  };

  const onSubmit = async (values: CreateTaskFormValues) => {
    setServerError(null);
    try {
      let isoDueDate: string | null = null;
      if (values.due_date && values.due_date.trim() !== '') {
        const d = new Date(values.due_date);
        if (!isNaN(d.getTime())) {
          isoDueDate = d.toISOString();
        }
      }

      const res = await createMutation.mutateAsync({
        title: values.title.trim(),
        description: values.description && values.description.trim() ? values.description.trim() : null,
        status: (values.status as TaskStatus) || 'todo',
        priority: (values.priority as TaskPriority) || 'medium',
        assignee_id: values.assignee_id && values.assignee_id.trim() ? values.assignee_id.trim() : null,
        due_date: isoDueDate,
      });

      reset();
      if (onCreated) {
        onCreated(res.task);
      }
      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.message || 'Failed to create task');
      } else if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError('An unexpected error occurred');
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-task-title"
    >
      <div className="relative w-full max-w-lg rounded-lg bg-surface border border-line shadow-modal overflow-hidden text-ink">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-subtle text-accent border border-line">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 id="create-task-title" className="text-sm font-semibold text-ink">
                Create New Task
              </h2>
              <p className="text-2xs text-muted">
                Add a work item to this project.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-md text-muted hover:text-ink transition-colors"
            aria-label="Close dialog"
            data-testid="close-create-task-modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          {serverError && (
            <div
              role="alert"
              className="p-3 rounded-md bg-danger-soft border border-danger/25 text-danger text-xs"
              data-testid="create-task-error"
            >
              {serverError}
            </div>
          )}

          {/* Title Field */}
          <div className="space-y-1">
            <label htmlFor="task-title" className="block text-xs font-medium text-ink-2">
              Title <span className="text-danger">*</span>
            </label>
            <input
              id="task-title"
              type="text"
              placeholder="e.g. Implement user authentication"
              className={`w-full px-3 py-2 rounded-md bg-surface border text-xs text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors ${
                errors.title ? 'border-danger/50' : 'border-line'
              }`}
              data-testid="task-title-input"
              {...register('title')}
            />
            {errors.title && (
              <p className="text-2xs text-danger">{errors.title.message}</p>
            )}
          </div>

          {/* Description Field */}
          <div className="space-y-1">
            <label htmlFor="task-description" className="block text-xs font-medium text-ink-2">
              Description
            </label>
            <textarea
              id="task-description"
              rows={3}
              placeholder="Add details, acceptance criteria, or technical notes..."
              className="w-full px-3 py-2 rounded-md bg-surface border border-line text-xs text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors resize-none"
              data-testid="task-description-input"
              {...register('description')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Status Field */}
            <div className="space-y-1">
              <label htmlFor="task-status" className="block text-xs font-medium text-ink-2">
                Status
              </label>
              <select
                id="task-status"
                className="w-full px-3 py-2 rounded-md bg-surface border border-line text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors"
                data-testid="task-status-select"
                {...register('status')}
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="review">Review</option>
                <option value="done">Done</option>
              </select>
            </div>

            {/* Priority Field */}
            <div className="space-y-1">
              <label htmlFor="task-priority" className="block text-xs font-medium text-ink-2">
                Priority
              </label>
              <select
                id="task-priority"
                className="w-full px-3 py-2 rounded-md bg-surface border border-line text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors"
                data-testid="task-priority-select"
                {...register('priority')}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Assignee Field */}
            <div className="space-y-1">
              <label htmlFor="task-assignee" className="block text-xs font-medium text-ink-2">
                Assignee
              </label>
              <select
                id="task-assignee"
                className="w-full px-3 py-2 rounded-md bg-surface border border-line text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors"
                data-testid="task-assignee-select"
                {...register('assignee_id')}
              >
                <option value="">Unassigned</option>
                {membersData?.members.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.name || member.email} ({member.role})
                  </option>
                ))}
              </select>
            </div>

            {/* Due Date Field */}
            <div className="space-y-1">
              <label htmlFor="task-due-date" className="block text-xs font-medium text-ink-2">
                Due Date
              </label>
              <input
                id="task-due-date"
                type="date"
                className="w-full px-3 py-2 rounded-md bg-surface border border-line text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors"
                data-testid="task-due-date-input"
                {...register('due_date')}
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3.5 border-t border-line">
            <button
              type="button"
              onClick={handleClose}
              className="px-3.5 py-1.5 rounded-md text-xs font-medium text-muted hover:text-ink transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-3.5 py-1.5 rounded-md text-xs font-medium bg-ink text-surface hover:bg-ink/90 active:bg-ink disabled:opacity-50 disabled:pointer-events-none transition-colors flex items-center gap-1.5 shadow-sm"
              data-testid="submit-create-task-button"
            >
              {createMutation.isPending ? (
                <>
                  <LoadingSpinner size="sm" className="text-surface" />
                  <span>Creating...</span>
                </>
              ) : (
                <span>Create Task</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
