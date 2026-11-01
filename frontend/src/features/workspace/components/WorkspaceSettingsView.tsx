import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { updateWorkspaceSchema, UpdateWorkspaceFormValues } from '../schemas';
import { useWorkspace } from '../WorkspaceContext';
import { canUpdateWorkspace, canDeleteWorkspace } from '../types';
import { ApiClientError } from '../../../shared/lib/api-client';
import { LoadingSpinner } from '../../../shared/ui/LoadingSpinner';
import { Settings, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';

export const WorkspaceSettingsView: React.FC = () => {
  const { activeWorkspace, activeRole, updateWorkspace, deleteWorkspace } = useWorkspace();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  const canEdit = canUpdateWorkspace(activeRole);
  const canDelete = canDeleteWorkspace(activeRole);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UpdateWorkspaceFormValues>({
    resolver: zodResolver(updateWorkspaceSchema),
    defaultValues: {
      name: activeWorkspace?.name || '',
      description: activeWorkspace?.description || '',
    },
  });

  useEffect(() => {
    if (activeWorkspace) {
      reset({
        name: activeWorkspace.name,
        description: activeWorkspace.description || '',
      });
    }
  }, [activeWorkspace, reset]);

  if (!activeWorkspace) {
    return (
      <div className="p-8 text-center text-slate-400">
        No workspace selected. Please select or create a workspace.
      </div>
    );
  }

  const onSubmit = async (values: UpdateWorkspaceFormValues) => {
    setServerError(null);
    setSuccessMessage(null);
    try {
      await updateWorkspace({
        name: values.name,
        description: values.description ? values.description.trim() : undefined,
      });
      setSuccessMessage('Workspace settings updated successfully.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.message || 'Failed to update workspace');
      } else {
        setServerError('An unexpected error occurred. Please try again.');
      }
    }
  };

  const handleDelete = async () => {
    if (confirmName !== activeWorkspace.name) return;
    setIsDeleting(true);
    setServerError(null);
    try {
      await deleteWorkspace();
      setShowDeleteModal(false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.message || 'Failed to delete workspace');
      } else {
        setServerError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 text-ink max-w-3xl">
      {/* General Settings */}
      <div className="bg-surface border border-line rounded-lg shadow-sm p-6">
        <div className="flex items-center gap-2 pb-4 border-b border-line">
          <Settings className="w-4 h-4 text-accent" />
          <h2 className="text-base font-semibold tracking-tight text-ink">Workspace Settings</h2>
        </div>

        {successMessage && (
          <div className="mt-4 p-3 text-xs text-success bg-success-soft border border-success/25 rounded-md flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-success" />
            <span>{successMessage}</span>
          </div>
        )}

        {serverError && (
          <div className="mt-4 p-3 text-xs text-danger bg-danger-soft border border-danger/25 rounded-md">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4" noValidate>
          <div>
            <label htmlFor="ws-name-setting" className="block text-xs font-medium text-ink-2">
              Workspace Name
            </label>
            <input
              id="ws-name-setting"
              type="text"
              disabled={!canEdit}
              {...register('name')}
              className="mt-1 block w-full px-3 py-2 bg-surface border border-line rounded-md text-xs text-ink disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-subtle/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            {errors.name && (
              <p className="mt-1 text-2xs text-danger">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="ws-slug-readonly" className="block text-xs font-medium text-ink-2">
              Workspace Slug <span className="text-2xs text-muted">(Permanent Identifier)</span>
            </label>
            <input
              id="ws-slug-readonly"
              type="text"
              value={activeWorkspace.slug}
              readOnly
              className="mt-1 block w-full px-3 py-2 bg-subtle/60 border border-line rounded-md text-xs font-mono text-muted cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="ws-desc-setting" className="block text-xs font-medium text-ink-2">
              Description
            </label>
            <textarea
              id="ws-desc-setting"
              rows={3}
              disabled={!canEdit}
              {...register('description')}
              className="mt-1 block w-full px-3 py-2 bg-surface border border-line rounded-md text-xs text-ink disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-subtle/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent resize-none"
            />
            {errors.description && (
              <p className="mt-1 text-2xs text-danger">{errors.description.message}</p>
            )}
          </div>

          {canEdit && (
            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting || !isDirty}
                className="flex items-center justify-center px-3.5 py-1.5 text-xs font-medium text-surface bg-ink hover:bg-ink/90 active:bg-ink disabled:opacity-50 disabled:cursor-not-allowed rounded-md shadow-sm transition-colors"
                data-testid="save-settings-button"
              >
                {isSubmitting ? <LoadingSpinner size="sm" className="mr-2 text-surface" /> : null}
                Save Changes
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Danger Zone: Soft Delete Workspace (Owner Only) */}
      {canDelete && (
        <div className="bg-danger-soft/20 border border-danger/25 rounded-lg p-6">
          <div className="flex items-center gap-2 pb-3 border-b border-danger/20 text-danger">
            <AlertTriangle className="w-4 h-4" />
            <h3 className="text-sm font-semibold text-danger">Danger Zone</h3>
          </div>
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-xs font-semibold text-ink">Delete this workspace</h4>
              <p className="text-2xs text-muted mt-0.5">
                Once deleted, this workspace and all associated projects and tasks will be soft-deleted. Only the workspace Owner can perform this action.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="px-3.5 py-1.5 text-xs font-medium text-surface bg-danger hover:bg-danger/90 active:bg-danger rounded-md shadow-sm transition-colors shrink-0"
              data-testid="delete-workspace-button"
            >
              Delete Workspace
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay/50 backdrop-blur-xs" role="dialog" aria-modal="true">
          <div className="w-full max-w-md bg-surface border border-line rounded-lg shadow-modal p-6 text-ink">
            <div className="flex items-center gap-2 pb-3 border-b border-line text-danger">
              <Trash2 className="w-4 h-4" />
              <h3 className="text-sm font-semibold text-ink">Delete Workspace</h3>
            </div>
            <div className="mt-3.5 text-xs text-ink-2 space-y-3">
              <p>
                Are you sure you want to delete <strong className="text-ink">{activeWorkspace.name}</strong>?
              </p>
              <p className="text-2xs text-muted">
                To confirm deletion, please type the workspace name (<strong className="text-ink">{activeWorkspace.name}</strong>) below:
              </p>
              <input
                type="text"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={activeWorkspace.name}
                className="w-full px-3 py-2 bg-surface border border-line rounded-md text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
                data-testid="confirm-delete-input"
              />
            </div>
            <div className="flex items-center justify-end gap-2.5 mt-5 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setConfirmName('');
                }}
                disabled={isDeleting}
                className="px-3 py-1.5 text-xs font-medium text-muted hover:text-ink transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting || confirmName !== activeWorkspace.name}
                className="flex items-center justify-center px-3.5 py-1.5 text-xs font-medium text-surface bg-danger hover:bg-danger/90 active:bg-danger disabled:opacity-40 disabled:cursor-not-allowed rounded-md shadow-sm transition-colors"
                data-testid="confirm-delete-button"
              >
                {isDeleting ? <LoadingSpinner size="sm" className="mr-2 text-surface" /> : null}
                I understand, delete workspace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

