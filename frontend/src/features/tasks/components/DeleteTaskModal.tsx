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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-task-title"
    >
      <div className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 id="delete-task-title" className="text-base font-semibold text-white">
                Delete Task
              </h2>
              <p className="text-xs text-slate-400">
                Confirm task soft-deletion.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            aria-label="Close dialog"
            data-testid="close-delete-task-modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {serverError && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs"
              data-testid="delete-task-error"
            >
              {serverError}
            </div>
          )}

          <div className="text-sm text-slate-300 space-y-2">
            <p>
              Are you sure you want to delete task{' '}
              <strong className="font-mono text-indigo-400 font-semibold">{task.identifier}</strong> (
              <span className="text-white font-medium">{task.title}</span>)?
            </p>
            <p className="text-xs text-slate-400 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
              This task will be soft-deleted and removed from active views. Activity history and audit logs will be permanently retained.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-50 disabled:pointer-events-none transition-colors flex items-center gap-2 shadow-lg shadow-rose-600/20"
              data-testid="confirm-delete-task-button"
            >
              {deleteMutation.isPending ? (
                <>
                  <LoadingSpinner size="sm" />
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
