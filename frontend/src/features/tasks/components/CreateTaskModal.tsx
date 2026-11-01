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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-task-title"
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 id="create-task-title" className="text-base font-semibold text-white">
                Create New Task
              </h2>
              <p className="text-xs text-slate-400">
                Add a work item to this project.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            aria-label="Close dialog"
            data-testid="close-create-task-modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          {serverError && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs"
              data-testid="create-task-error"
            >
              {serverError}
            </div>
          )}

          {/* Title Field */}
          <div className="space-y-1.5">
            <label htmlFor="task-title" className="block text-xs font-medium text-slate-300">
              Title <span className="text-rose-400">*</span>
            </label>
            <input
              id="task-title"
              type="text"
              placeholder="e.g. Implement user authentication"
              className={`w-full px-3.5 py-2 rounded-lg bg-slate-950 border text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-colors ${
                errors.title ? 'border-rose-500/50' : 'border-slate-800 focus:border-indigo-500'
              }`}
              data-testid="task-title-input"
              {...register('title')}
            />
            {errors.title && (
              <p className="text-xs text-rose-400">{errors.title.message}</p>
            )}
          </div>

          {/* Description Field */}
          <div className="space-y-1.5">
            <label htmlFor="task-description" className="block text-xs font-medium text-slate-300">
              Description
            </label>
            <textarea
              id="task-description"
              rows={3}
              placeholder="Add details, acceptance criteria, or technical notes..."
              className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors resize-none"
              data-testid="task-description-input"
              {...register('description')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Status Field */}
            <div className="space-y-1.5">
              <label htmlFor="task-status" className="block text-xs font-medium text-slate-300">
                Status
              </label>
              <select
                id="task-status"
                className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
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
            <div className="space-y-1.5">
              <label htmlFor="task-priority" className="block text-xs font-medium text-slate-300">
                Priority
              </label>
              <select
                id="task-priority"
                className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Assignee Field */}
            <div className="space-y-1.5">
              <label htmlFor="task-assignee" className="block text-xs font-medium text-slate-300">
                Assignee
              </label>
              <select
                id="task-assignee"
                className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
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
            <div className="space-y-1.5">
              <label htmlFor="task-due-date" className="block text-xs font-medium text-slate-300">
                Due Date
              </label>
              <input
                id="task-due-date"
                type="date"
                className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
                data-testid="task-due-date-input"
                {...register('due_date')}
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:pointer-events-none transition-colors flex items-center gap-2 shadow-lg shadow-indigo-600/20"
              data-testid="submit-create-task-button"
            >
              {createMutation.isPending ? (
                <>
                  <LoadingSpinner size="sm" />
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
