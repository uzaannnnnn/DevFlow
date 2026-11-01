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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-project-title"
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 text-slate-100">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-indigo-400" />
            <h2 id="create-project-title" className="text-lg font-semibold">
              Create New Project
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

        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4">
          {/* Project Name */}
          <div>
            <label htmlFor="project-name" className="block text-sm font-medium text-slate-300 mb-1">
              Project Name <span className="text-red-400">*</span>
            </label>
            <input
              id="project-name"
              type="text"
              placeholder="e.g. Core Platform Engine"
              disabled={createMutation.isPending}
              {...register('name')}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-md text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-slate-500 disabled:opacity-50"
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>
            )}
          </div>

          {/* Project Key */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="project-key" className="block text-sm font-medium text-slate-300">
                Project Key
              </label>
              <button
                type="button"
                onClick={handleAutoSuggestKey}
                disabled={!currentName || createMutation.isPending}
                className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-40 disabled:hover:text-indigo-400 transition-colors"
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
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-md text-slate-100 font-mono text-sm uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-slate-500 disabled:opacity-50"
            />
            {errors.key && (
              <p className="mt-1 text-xs text-red-400">{errors.key.message}</p>
            )}
            <p className="mt-1 text-xs text-slate-400">
              Unique prefix for task identifiers (e.g. CORE-101). Immutable once created.
            </p>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="project-description" className="block text-sm font-medium text-slate-300 mb-1">
              Description <span className="text-xs text-slate-400">(Optional)</span>
            </label>
            <textarea
              id="project-description"
              rows={3}
              placeholder="Brief summary of what this project encompasses..."
              disabled={createMutation.isPending}
              {...register('description')}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-md text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-slate-500 resize-none disabled:opacity-50"
            />
            {errors.description && (
              <p className="mt-1 text-xs text-red-400">{errors.description.message}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={handleClose}
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm text-slate-300 hover:text-slate-100 hover:bg-slate-800 rounded-md transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-md transition-colors disabled:opacity-50"
            >
              {createMutation.isPending ? (
                <>
                  <LoadingSpinner size="sm" />
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
