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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-workspace-title"
    >
      <div className="w-full max-w-md bg-surface border border-line rounded-lg shadow-modal p-6 text-ink">
        <div className="flex items-center justify-between pb-3.5 border-b border-line">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-accent" />
            <h2 id="create-workspace-title" className="text-sm font-semibold text-ink">
              Create New Workspace
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-muted hover:text-ink transition-colors p-1 rounded-md"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {serverError && (
          <div
            role="alert"
            className="mt-3.5 p-3 text-xs text-danger bg-danger-soft border border-danger/25 rounded-md"
          >
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4" noValidate>
          <div>
            <label htmlFor="ws-name" className="block text-xs font-medium text-ink-2">
              Workspace Name <span className="text-danger">*</span>
            </label>
            <input
              id="ws-name"
              type="text"
              placeholder="e.g. Acme Corp"
              {...register('name')}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'ws-name-error' : undefined}
              className="mt-1 block w-full px-3 py-2 bg-surface border border-line rounded-md text-xs text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            {errors.name && (
              <p id="ws-name-error" className="mt-1 text-2xs text-danger">
                {errors.name.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="ws-slug" className="block text-xs font-medium text-ink-2">
              Slug <span className="text-2xs text-muted">(Optional, auto-generated if blank)</span>
            </label>
            <input
              id="ws-slug"
              type="text"
              placeholder="e.g. acme-corp"
              {...register('slug')}
              aria-invalid={!!errors.slug}
              aria-describedby={errors.slug ? 'ws-slug-error' : undefined}
              className="mt-1 block w-full px-3 py-2 bg-surface border border-line rounded-md text-xs text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent font-mono"
            />
            {errors.slug && (
              <p id="ws-slug-error" className="mt-1 text-2xs text-danger">
                {errors.slug.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="ws-desc" className="block text-xs font-medium text-ink-2">
              Description <span className="text-2xs text-muted">(Optional)</span>
            </label>
            <textarea
              id="ws-desc"
              rows={3}
              placeholder="Brief summary of this workspace"
              {...register('description')}
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? 'ws-desc-error' : undefined}
              className="mt-1 block w-full px-3 py-2 bg-surface border border-line rounded-md text-xs text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent resize-none"
            />
            {errors.description && (
              <p id="ws-desc-error" className="mt-1 text-2xs text-danger">
                {errors.description.message}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3.5 border-t border-line">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 text-xs font-medium text-muted hover:text-ink transition-colors rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center justify-center px-3.5 py-1.5 text-xs font-medium text-surface bg-ink hover:bg-ink/90 active:bg-ink disabled:opacity-50 disabled:cursor-not-allowed rounded-md shadow-sm transition-colors"
            >
              {isSubmitting ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2 text-surface" />
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

