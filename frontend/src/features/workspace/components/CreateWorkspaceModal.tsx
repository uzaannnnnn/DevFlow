import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createWorkspaceSchema, CreateWorkspaceFormValues } from '../schemas';
import { useWorkspace } from '../WorkspaceContext';
import { ApiClientError } from '../../../shared/lib/api-client';
import { LoadingSpinner } from '../../../shared/ui/LoadingSpinner';
import { X, Building2 } from 'lucide-react';
import { Workspace } from '../types';

export interface CreateWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (workspace: Workspace) => void;
}

export const CreateWorkspaceModal: React.FC<CreateWorkspaceModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const { createWorkspace } = useWorkspace();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateWorkspaceFormValues>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: {
      name: '',
      slug: '',
      description: '',
    },
  });

  if (!isOpen) return null;

  const handleClose = () => {
    reset();
    setServerError(null);
    onClose();
  };

  const onSubmit = async (values: CreateWorkspaceFormValues) => {
    setServerError(null);
    try {
      const created = await createWorkspace({
        name: values.name,
        slug: values.slug ? values.slug.trim() : undefined,
        description: values.description ? values.description.trim() : undefined,
      });
      reset();
      if (onCreated) {
        onCreated(created);
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.message || 'Failed to create workspace');
      } else {
        setServerError('An unexpected error occurred. Please try again.');
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-workspace-title"
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 text-slate-100">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-400" />
            <h2 id="create-workspace-title" className="text-lg font-semibold">
              Create New Workspace
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded-md"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {serverError && (
          <div
            role="alert"
            className="mt-4 p-3 text-sm text-red-300 bg-red-950/40 border border-red-900/60 rounded-md"
          >
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4" noValidate>
          <div>
            <label htmlFor="ws-name" className="block text-sm font-medium text-slate-300">
              Workspace Name <span className="text-red-400">*</span>
            </label>
            <input
              id="ws-name"
              type="text"
              placeholder="e.g. Acme Corp"
              {...register('name')}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'ws-name-error' : undefined}
              className="mt-1 block w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {errors.name && (
              <p id="ws-name-error" className="mt-1 text-xs text-red-400">
                {errors.name.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="ws-slug" className="block text-sm font-medium text-slate-300">
              Slug <span className="text-xs text-slate-500">(Optional, auto-generated if blank)</span>
            </label>
            <input
              id="ws-slug"
              type="text"
              placeholder="e.g. acme-corp"
              {...register('slug')}
              aria-invalid={!!errors.slug}
              aria-describedby={errors.slug ? 'ws-slug-error' : undefined}
              className="mt-1 block w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {errors.slug && (
              <p id="ws-slug-error" className="mt-1 text-xs text-red-400">
                {errors.slug.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="ws-desc" className="block text-sm font-medium text-slate-300">
              Description <span className="text-xs text-slate-500">(Optional)</span>
            </label>
            <textarea
              id="ws-desc"
              rows={3}
              placeholder="Brief summary of this workspace"
              {...register('description')}
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? 'ws-desc-error' : undefined}
              className="mt-1 block w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
            {errors.description && (
              <p id="ws-desc-error" className="mt-1 text-xs text-red-400">
                {errors.description.message}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md shadow-sm transition-colors"
            >
              {isSubmitting ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2 text-white" />
                  Creating...
                </>
              ) : (
                'Create Workspace'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

