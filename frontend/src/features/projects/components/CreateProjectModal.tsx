import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createProjectSchema,
  CreateProjectFormValues,
  generateSuggestedKey,
} from '../schemas';
import { useCreateProjectMutation } from '../useProjects';
import { Project } from '../types';
import { ApiClientError } from '../../../shared/lib/api-client';
import { LoadingSpinner } from '../../../shared/ui/LoadingSpinner';
import { X, FolderKanban, Sparkles } from 'lucide-react';

export interface CreateProjectModalProps {
  isOpen: boolean;
  workspaceId: string;
  onClose: () => void;
  onCreated?: (project: Project) => void;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  workspaceId,
  onClose,
  onCreated,
}) => {
  const [serverError, setServerError] = useState<string | null>(null);
  const createMutation = useCreateProjectMutation(workspaceId);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateProjectFormValues>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: '',
      key: '',
      description: '',
    },
  });

  const currentName = watch('name');

  if (!isOpen) return null;

  const handleClose = () => {
    reset();
    setServerError(null);
    onClose();
  };

  const handleAutoSuggestKey = () => {
    const suggested = generateSuggestedKey(currentName || '');
    if (suggested) {
      setValue('key', suggested, { shouldValidate: true });
    }
  };

  const onSubmit = async (values: CreateProjectFormValues) => {
    setServerError(null);
    try {
      const res = await createMutation.mutateAsync({
        name: values.name.trim(),
        key: values.key && values.key.trim() ? values.key.trim().toUpperCase() : undefined,
        description: values.description && values.description.trim() ? values.description.trim() : undefined,
      });

      reset();
      if (onCreated) {
        onCreated(res.project);
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.message || 'Failed to create project');
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
      aria-labelledby="create-project-title"
    >
      <div className="w-full max-w-md bg-surface border border-line rounded-lg shadow-modal p-6 text-ink">
        <div className="flex items-center justify-between pb-3.5 border-b border-line">
          <div className="flex items-center gap-2">
            <FolderKanban className="w-4 h-4 text-accent" />
            <h2 id="create-project-title" className="text-sm font-semibold text-ink">
              Create New Project
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

        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4">
          {/* Project Name */}
          <div>
            <label htmlFor="project-name" className="block text-xs font-medium text-ink-2 mb-1">
              Project Name <span className="text-danger">*</span>
            </label>
            <input
              id="project-name"
              type="text"
              placeholder="e.g. Core Platform Engine"
              disabled={createMutation.isPending}
              {...register('name')}
              className="w-full px-3 py-2 bg-surface border border-line rounded-md text-ink text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent placeholder:text-muted disabled:opacity-50"
            />
            {errors.name && (
              <p className="mt-1 text-2xs text-danger">{errors.name.message}</p>
            )}
          </div>

          {/* Project Key */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="project-key" className="block text-xs font-medium text-ink-2">
                Project Key
              </label>
              <button
                type="button"
                onClick={handleAutoSuggestKey}
                disabled={!currentName || createMutation.isPending}
                className="inline-flex items-center gap-1 text-2xs font-medium text-accent hover:text-accent/80 disabled:opacity-40 disabled:hover:text-accent transition-colors"
                title="Generate key from project name"
              >
                <Sparkles className="w-3 h-3" />
                <span>Auto-suggest</span>
              </button>
            </div>
            <input
              id="project-key"
              type="text"
              placeholder="e.g. CORE (2-10 uppercase alphanumeric)"
              disabled={createMutation.isPending}
              {...register('key')}
              className="w-full px-3 py-2 bg-surface border border-line rounded-md text-ink font-mono text-xs uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent placeholder:text-muted disabled:opacity-50"
            />
            {errors.key && (
              <p className="mt-1 text-2xs text-danger">{errors.key.message}</p>
            )}
            <p className="mt-1 text-2xs text-muted">
              Unique prefix for task identifiers (e.g. CORE-101). Immutable once created.
            </p>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="project-description" className="block text-xs font-medium text-ink-2 mb-1">
              Description <span className="text-2xs text-muted">(Optional)</span>
            </label>
            <textarea
              id="project-description"
              rows={3}
              placeholder="Brief summary of what this project encompasses..."
              disabled={createMutation.isPending}
              {...register('description')}
              className="w-full px-3 py-2 bg-surface border border-line rounded-md text-ink text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent placeholder:text-muted resize-none disabled:opacity-50"
            />
            {errors.description && (
              <p className="mt-1 text-2xs text-danger">{errors.description.message}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2.5 pt-3.5 border-t border-line">
            <button
              type="button"
              onClick={handleClose}
              disabled={createMutation.isPending}
              className="px-3 py-1.5 text-xs font-medium text-muted hover:text-ink rounded-md transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-surface bg-ink hover:bg-ink/90 active:bg-ink rounded-md shadow-sm transition-colors disabled:opacity-50"
            >
              {createMutation.isPending ? (
                <>
                  <LoadingSpinner size="sm" className="text-surface" />
                  <span>Creating...</span>
                </>
              ) : (
                <span>Create Project</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
