import React, { useState } from 'react';
import { useDeleteTaskMutation } from '../useTasks';
import { Task } from '../types';
import { ApiClientError } from '../../../shared/lib/api-client';
import { LoadingSpinner } from '../../../shared/ui/LoadingSpinner';
import { AlertTriangle, X } from 'lucide-react';

export interface DeleteTaskModalProps {
  isOpen: boolean;
  projectId: string;
  task: Task;
  onClose: () => void;
  onDeleted?: () => void;
}

export const DeleteTaskModal: React.FC<DeleteTaskModalProps> = ({
  isOpen,
  projectId,
  task,
  onClose,
  onDeleted,
}) => {
  const [serverError, setServerError] = useState<string | null>(null);
  const deleteMutation = useDeleteTaskMutation(projectId);

  if (!isOpen) return null;

  const handleDelete = async () => {
    setServerError(null);
    try {
      await deleteMutation.mutateAsync(task.id);
      if (onDeleted) {
        onDeleted();
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.message || 'Failed to delete task');
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
      aria-labelledby="delete-task-title"
    >
      <div className="relative w-full max-w-md rounded-lg bg-surface border border-line shadow-modal overflow-hidden text-ink">
        <div className="flex items-center justify-between border-b border-line px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-danger-soft text-danger border border-danger/25">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h2 id="delete-task-title" className="text-sm font-semibold text-ink">
                Delete Task
              </h2>
              <p className="text-2xs text-muted">
                Confirm task soft-deletion.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-muted hover:text-ink transition-colors"
            aria-label="Close dialog"
            data-testid="close-delete-task-modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {serverError && (
            <div
              role="alert"
              className="p-3 rounded-md bg-danger-soft border border-danger/25 text-danger text-xs"
              data-testid="delete-task-error"
            >
              {serverError}
            </div>
          )}

          <div className="text-xs text-ink-2 space-y-2">
            <p>
              Are you sure you want to delete task{' '}
              <strong className="font-mono text-accent font-semibold">{task.identifier}</strong> (
              <span className="text-ink font-medium">{task.title}</span>)?
            </p>
            <p className="text-2xs text-muted bg-subtle/50 p-3 rounded-md border border-line leading-relaxed">
              This task will be soft-deleted and removed from active views. Activity history and audit logs will be permanently retained.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3.5 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              disabled={deleteMutation.isPending}
              className="px-3.5 py-1.5 rounded-md text-xs font-medium text-muted hover:text-ink transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="px-3.5 py-1.5 rounded-md text-xs font-medium bg-danger text-surface hover:bg-danger/90 disabled:opacity-50 disabled:pointer-events-none transition-colors flex items-center gap-1.5 shadow-sm"
              data-testid="confirm-delete-task-button"
            >
              {deleteMutation.isPending ? (
                <>
                  <LoadingSpinner size="sm" className="text-surface" />
                  <span>Deleting...</span>
                </>
              ) : (
                <span>Delete Task</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
