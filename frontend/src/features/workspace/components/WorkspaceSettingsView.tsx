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
    <div className="space-y-6 text-slate-100 max-w-3xl">
      {/* General Settings */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-2 pb-4 border-b border-slate-800">
          <Settings className="w-5 h-5 text-indigo-400" />
          <h2 className="text-xl font-bold tracking-tight">Workspace Settings</h2>
        </div>

        {successMessage && (
          <div className="mt-4 p-3 text-sm text-emerald-300 bg-emerald-950/40 border border-emerald-900/60 rounded-md flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {serverError && (
          <div className="mt-4 p-3 text-sm text-red-300 bg-red-950/40 border border-red-900/60 rounded-md">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
          <div>
            <label htmlFor="ws-name-setting" className="block text-sm font-medium text-slate-300">
              Workspace Name
            </label>
            <input
              id="ws-name-setting"
              type="text"
              disabled={!canEdit}
              {...register('name')}
              className="mt-1 block w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="ws-slug-readonly" className="block text-sm font-medium text-slate-300">
              Workspace Slug <span className="text-xs text-slate-500">(Permanent Identifier)</span>
            </label>
            <input
              id="ws-slug-readonly"
              type="text"
              value={activeWorkspace.slug}
              readOnly
              className="mt-1 block w-full px-3 py-2 bg-slate-950/60 border border-slate-800/80 rounded-md text-sm text-slate-400 cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="ws-desc-setting" className="block text-sm font-medium text-slate-300">
              Description
            </label>
            <textarea
              id="ws-desc-setting"
              rows={3}
              disabled={!canEdit}
              {...register('description')}
              className="mt-1 block w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            {errors.description && (
              <p className="mt-1 text-xs text-red-400">{errors.description.message}</p>
            )}
          </div>

          {canEdit && (
            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting || !isDirty}
                className="flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md shadow-sm transition-colors"
                data-testid="save-settings-button"
              >
                {isSubmitting ? <LoadingSpinner size="sm" className="mr-2 text-white" /> : null}
                Save Changes
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Danger Zone: Soft Delete Workspace (Owner Only) */}
      {canDelete && (
        <div className="bg-red-950/20 border border-red-900/40 rounded-xl p-6">
          <div className="flex items-center gap-2 pb-3 border-b border-red-900/40 text-red-400">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="text-lg font-bold">Danger Zone</h3>
          </div>
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-semibold text-slate-200">Delete this workspace</h4>
              <p className="text-xs text-slate-400 mt-1">
                Once deleted, this workspace and all associated projects and tasks will be soft-deleted. Only the workspace Owner can perform this action.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 active:bg-red-700 rounded-lg shadow-sm transition-colors shrink-0"
              data-testid="delete-workspace-button"
            >
              Delete Workspace
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 text-slate-100">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800 text-red-400">
              <Trash2 className="w-5 h-5" />
              <h3 className="text-lg font-semibold text-slate-100">Delete Workspace</h3>
            </div>
            <div className="mt-4 text-sm text-slate-300 space-y-3">
              <p>
                Are you sure you want to delete <strong className="text-white">{activeWorkspace.name}</strong>?
              </p>
              <p className="text-xs text-slate-400">
                To confirm deletion, please type the workspace name (<strong className="text-white">{activeWorkspace.name}</strong>) below:
              </p>
              <input
                type="text"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={activeWorkspace.name}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                data-testid="confirm-delete-input"
              />
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setConfirmName('');
                }}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting || confirmName !== activeWorkspace.name}
                className="flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 active:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-md shadow-sm transition-colors"
                data-testid="confirm-delete-button"
              >
                {isDeleting ? <LoadingSpinner size="sm" className="mr-2 text-white" /> : null}
                I understand, delete workspace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

