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
    <div className="space-y-6 max-w-2xl">
      {/* Title */}
      <div>
        <h3 className="text-base font-semibold text-ink">Project Settings</h3>
        <p className="text-xs text-muted mt-0.5">
          Manage general settings and lifecycle for <span className="font-semibold text-ink">[{project.key}] {project.name}</span>.
        </p>
      </div>

      {successMessage && (
        <div className="p-3 bg-success-soft border border-success/25 rounded-md text-xs text-success flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-danger-soft border border-danger/25 rounded-md text-xs text-danger flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* General Settings Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="bg-surface border border-line rounded-lg shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-2 pb-3.5 border-b border-line text-xs font-semibold text-ink uppercase tracking-wider">
          <Settings className="w-4 h-4 text-accent" />
          <span>General Information</span>
        </div>

        {/* Project Key (Permanently Immutable - Decision 6) */}
        <div>
          <label className="block text-xs font-medium text-ink-2 mb-1 flex items-center justify-between">
            <span>Project Key</span>
            <span className="text-2xs text-accent flex items-center gap-1 font-normal">
              <Lock className="w-3 h-3" /> Immutable (Decision 6)
            </span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={project.key}
              readOnly
              disabled
              className="w-full px-3 py-2 bg-subtle/60 border border-line rounded-md text-muted font-mono text-xs cursor-not-allowed select-none"
            />
          </div>
          <p className="mt-1 text-2xs text-muted">
            Project keys are permanently immutable once created to ensure stable task identifiers across Git branches and integrations.
          </p>
        </div>

        {/* Project Name */}
        <div>
          <label htmlFor="settings-project-name" className="block text-xs font-medium text-ink-2 mb-1">
            Project Name <span className="text-danger">*</span>
          </label>
          <input
            id="settings-project-name"
            type="text"
            disabled={!canEdit || updateMutation.isPending}
            {...register('name')}
            className="w-full px-3 py-2 bg-surface border border-line rounded-md text-ink text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
          />
          {errors.name && (
            <p className="mt-1 text-2xs text-danger">{errors.name.message}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label htmlFor="settings-project-description" className="block text-xs font-medium text-ink-2 mb-1">
            Description
          </label>
          <textarea
            id="settings-project-description"
            rows={4}
            disabled={!canEdit || updateMutation.isPending}
            {...register('description')}
            className="w-full px-3 py-2 bg-surface border border-line rounded-md text-ink text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent placeholder:text-muted resize-none disabled:opacity-50"
          />
          {errors.description && (
            <p className="mt-1 text-2xs text-danger">{errors.description.message}</p>
          )}
        </div>

        {canEdit && (
          <div className="flex justify-end pt-3.5 border-t border-line">
            <button
              type="submit"
              disabled={!isDirty || updateMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-surface bg-ink hover:bg-ink/90 active:bg-ink rounded-md shadow-sm transition-colors disabled:opacity-50"
            >
              {updateMutation.isPending ? (
                <>
                  <LoadingSpinner size="sm" className="text-surface" />
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
        <div className="bg-danger-soft/20 border border-danger/25 rounded-lg p-6 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-danger">
            <AlertTriangle className="w-4 h-4" />
            <span>Danger Zone</span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Archiving a project soft-deletes it. All tasks and comments will be preserved in the database for compliance and audit retention (§8.14), but the project will no longer be visible or accessible to members.
          </p>
          <button
            type="button"
            onClick={() => setIsArchiveModalOpen(true)}
            className="px-3.5 py-1.5 text-xs font-medium text-surface bg-danger hover:bg-danger/90 rounded-md shadow-sm transition-colors"
          >
            Archive Project
          </button>
        </div>
      )}

      {/* Archive Confirmation Dialog */}
      {isArchiveModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-surface border border-line rounded-lg shadow-modal p-6 text-ink">
            <h3 className="text-sm font-semibold text-danger flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-danger" />
              Archive Project [{project.key}]
            </h3>
            <p className="mt-3 text-xs text-ink-2">
              Are you sure you want to archive <strong className="text-ink">{project.name}</strong>?
            </p>
            <p className="mt-1.5 text-2xs text-muted">
              Tasks and comments remain securely preserved in the database per §8.14, but access will be revoked for all members.
            </p>

            <div className="flex justify-end gap-2.5 mt-5 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setIsArchiveModalOpen(false)}
                disabled={archiveMutation.isPending}
                className="px-3 py-1.5 text-xs font-medium text-muted hover:text-ink rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleArchive}
                disabled={archiveMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-surface bg-danger hover:bg-danger/90 rounded-md shadow-sm transition-colors disabled:opacity-50"
              >
                {archiveMutation.isPending ? (
                  <>
                    <LoadingSpinner size="sm" className="text-surface" />
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
