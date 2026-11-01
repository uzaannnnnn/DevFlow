import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { updateProjectSchema, UpdateProjectFormValues } from '../schemas';
import { useUpdateProjectMutation, useArchiveProjectMutation } from '../useProjects';
import { Project, canUpdateProject, canArchiveProject } from '../types';
import { ApiClientError } from '../../../shared/lib/api-client';
import { LoadingSpinner } from '../../../shared/ui/LoadingSpinner';
import { Settings, Lock, AlertTriangle, CheckCircle2 } from 'lucide-react';

export interface ProjectSettingsViewProps {
  project: Project;
  onProjectUpdated: (updated: Project) => void;
  onProjectArchived: () => void;
}

export const ProjectSettingsView: React.FC<ProjectSettingsViewProps> = ({
  project,
  onProjectUpdated,
  onProjectArchived,
}) => {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);

  const canEdit = canUpdateProject(project.role);
  const canArchive = canArchiveProject(project.role);

  const updateMutation = useUpdateProjectMutation(project.id, project.workspace_id);
  const archiveMutation = useArchiveProjectMutation(project.id, project.workspace_id);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<UpdateProjectFormValues>({
    resolver: zodResolver(updateProjectSchema),
    defaultValues: {
      name: project.name,
      description: project.description || '',
    },
  });

  const onSubmit = async (values: UpdateProjectFormValues) => {
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const res = await updateMutation.mutateAsync({
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
      });
      setSuccessMessage('Project details updated successfully');
      onProjectUpdated(res.project);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message || 'Failed to update project');
      } else {
        setErrorMessage('An unexpected error occurred while saving.');
      }
    }
  };

  const handleArchive = async () => {
    setErrorMessage(null);
    try {
      await archiveMutation.mutateAsync();
      setIsArchiveModalOpen(false);
      onProjectArchived();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message || 'Failed to archive project');
      } else {
        setErrorMessage('An unexpected error occurred while archiving.');
      }
    }
  };

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Title */}
      <div>
        <h3 className="text-lg font-semibold text-slate-100">Project Settings</h3>
        <p className="text-sm text-slate-400">
          Manage general settings and lifecycle for <span className="font-semibold text-indigo-400">[{project.key}] {project.name}</span>.
        </p>
      </div>

      {successMessage && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-900/60 rounded-xl text-sm text-emerald-300 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-red-950/40 border border-red-900/60 rounded-xl text-sm text-red-300 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* General Settings Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="bg-slate-950/40 border border-slate-800 rounded-xl p-6 space-y-6">
        <div className="flex items-center gap-2 pb-4 border-b border-slate-800 text-sm font-semibold text-slate-200">
          <Settings className="w-4 h-4 text-indigo-400" />
          <span>General Information</span>
        </div>

        {/* Project Key (Permanently Immutable - Decision 6) */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1 flex items-center justify-between">
            <span>Project Key</span>
            <span className="text-xs text-amber-400/90 flex items-center gap-1 font-normal">
              <Lock className="w-3 h-3" /> Immutable (Decision 6)
            </span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={project.key}
              readOnly
              disabled
              className="w-full px-3 py-2 bg-slate-900/80 border border-slate-800 rounded-md text-slate-400 font-mono text-sm cursor-not-allowed select-none"
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Project keys are permanently immutable once created to ensure stable task identifiers across Git branches and integrations.
          </p>
        </div>

        {/* Project Name */}
        <div>
          <label htmlFor="settings-project-name" className="block text-sm font-medium text-slate-300 mb-1">
            Project Name <span className="text-red-400">*</span>
          </label>
          <input
            id="settings-project-name"
            type="text"
            disabled={!canEdit || updateMutation.isPending}
            {...register('name')}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-md text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label htmlFor="settings-project-description" className="block text-sm font-medium text-slate-300 mb-1">
            Description
          </label>
          <textarea
            id="settings-project-description"
            rows={4}
            disabled={!canEdit || updateMutation.isPending}
            {...register('description')}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-md text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-slate-500 resize-none disabled:opacity-50"
          />
          {errors.description && (
            <p className="mt-1 text-xs text-red-400">{errors.description.message}</p>
          )}
        </div>

        {canEdit && (
          <div className="flex justify-end pt-4 border-t border-slate-800">
            <button
              type="submit"
              disabled={!isDirty || updateMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-md transition-colors disabled:opacity-50"
            >
              {updateMutation.isPending ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        )}
      </form>

      {/* Danger Zone: Archive Project */}
      {canArchive && (
        <div className="bg-red-950/20 border border-red-900/40 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-400">
            <AlertTriangle className="w-4 h-4" />
            <span>Danger Zone</span>
          </div>
          <p className="text-sm text-slate-300">
            Archiving a project soft-deletes it. All tasks and comments will be preserved in the database for compliance and audit retention (§8.14), but the project will no longer be visible or accessible to members.
          </p>
          <button
            type="button"
            onClick={() => setIsArchiveModalOpen(true)}
            className="px-4 py-2 text-sm font-medium text-red-200 bg-red-600/30 hover:bg-red-600/50 border border-red-500/40 rounded-md transition-colors"
          >
            Archive Project
          </button>
        </div>
      )}

      {/* Archive Confirmation Dialog */}
      {isArchiveModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 text-slate-100">
            <h3 className="text-lg font-semibold text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Archive Project [{project.key}]
            </h3>
            <p className="mt-3 text-sm text-slate-300">
              Are you sure you want to archive <strong>{project.name}</strong>?
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Tasks and comments remain securely preserved in the database per §8.14, but access will be revoked for all members.
            </p>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setIsArchiveModalOpen(false)}
                disabled={archiveMutation.isPending}
                className="px-4 py-2 text-sm text-slate-300 hover:text-slate-100 hover:bg-slate-800 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleArchive}
                disabled={archiveMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-md transition-colors disabled:opacity-50"
              >
                {archiveMutation.isPending ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span>Archiving...</span>
                  </>
                ) : (
                  <span>Confirm Archive</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
