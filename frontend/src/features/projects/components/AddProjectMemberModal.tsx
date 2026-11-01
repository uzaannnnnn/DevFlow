import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { addProjectMemberSchema, AddProjectMemberFormValues } from '../schemas';
import { useAddProjectMemberMutation } from '../useProjects';
import { ProjectMember } from '../types';
import { WorkspaceMember } from '../../workspace/types';
import { ApiClientError } from '../../../shared/lib/api-client';
import { LoadingSpinner } from '../../../shared/ui/LoadingSpinner';
import { X, UserPlus } from 'lucide-react';

export interface AddProjectMemberModalProps {
  isOpen: boolean;
  projectId: string;
  workspaceMembers: WorkspaceMember[];
  currentProjectMembers: ProjectMember[];
  onClose: () => void;
  onAdded?: (member: ProjectMember) => void;
}

export const AddProjectMemberModal: React.FC<AddProjectMemberModalProps> = ({
  isOpen,
  projectId,
  workspaceMembers,
  currentProjectMembers,
  onClose,
  onAdded,
}) => {
  const [serverError, setServerError] = useState<string | null>(null);
  const addMutation = useAddProjectMemberMutation(projectId);

  // Available users to add: workspace members not yet in this project
  const existingUserIds = new Set(currentProjectMembers.map((m) => m.user_id));
  const candidateMembers = workspaceMembers.filter((m) => !existingUserIds.has(m.user_id));

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddProjectMemberFormValues>({
    resolver: zodResolver(addProjectMemberSchema),
    defaultValues: {
      user_id: '',
      role: 'member',
    },
  });

  if (!isOpen) return null;

  const handleClose = () => {
    reset();
    setServerError(null);
    onClose();
  };

  const onSubmit = async (values: AddProjectMemberFormValues) => {
    setServerError(null);
    try {
      const res = await addMutation.mutateAsync({
        user_id: values.user_id,
        role: values.role,
      });

      reset();
      if (onAdded) {
        onAdded(res.member);
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.message || 'Failed to add project member');
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
      aria-labelledby="add-project-member-title"
    >
      <div className="w-full max-w-md bg-surface border border-line rounded-lg shadow-modal p-6 text-ink">
        <div className="flex items-center justify-between pb-3.5 border-b border-line">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-accent" />
            <h2 id="add-project-member-title" className="text-sm font-semibold text-ink">
              Add Project Member
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

        {candidateMembers.length === 0 ? (
          <div className="mt-4 p-4 text-center text-xs text-muted bg-subtle/50 rounded-md border border-line">
            <p className="font-medium text-ink">All workspace members are already in this project.</p>
            <p className="text-2xs text-muted mt-1">
              To add new people, invite them to the workspace first under Workspace Members.
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="mt-4 px-3.5 py-1.5 text-xs font-medium text-ink bg-surface border border-line hover:bg-subtle rounded-md transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4">
            {/* User Select */}
            <div>
              <label htmlFor="user-select" className="block text-xs font-medium text-ink-2 mb-1">
                Workspace Member <span className="text-danger">*</span>
              </label>
              <select
                id="user-select"
                disabled={addMutation.isPending}
                {...register('user_id')}
                className="w-full px-3 py-2 bg-surface border border-line rounded-md text-ink text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
              >
                <option value="">Select a member...</option>
                {candidateMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name ? `${m.name} (${m.email})` : m.email} [{m.role}]
                  </option>
                ))}
              </select>
              {errors.user_id && (
                <p className="mt-1 text-2xs text-danger">{errors.user_id.message}</p>
              )}
            </div>

            {/* Role Select */}
            <div>
              <label htmlFor="role-select" className="block text-xs font-medium text-ink-2 mb-1">
                Project Role <span className="text-danger">*</span>
              </label>
              <select
                id="role-select"
                disabled={addMutation.isPending}
                {...register('role')}
                className="w-full px-3 py-2 bg-surface border border-line rounded-md text-ink text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
              >
                <option value="member">Member — Can view and work on tasks</option>
                <option value="admin">Admin — Can manage project settings and members</option>
              </select>
              {errors.role && (
                <p className="mt-1 text-2xs text-danger">{errors.role.message}</p>
              )}
            </div>

            {/* Notice */}
            <div className="p-3 text-2xs bg-subtle/50 rounded-md border border-line text-muted">
              <span className="font-semibold text-ink">Project Boundary Isolation:</span> Members added here can access this project&apos;s tasks. Workspace administrators cannot access this project unless explicitly added as members.
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2.5 pt-3.5 border-t border-line">
              <button
                type="button"
                onClick={handleClose}
                disabled={addMutation.isPending}
                className="px-3 py-1.5 text-xs font-medium text-muted hover:text-ink rounded-md transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-surface bg-ink hover:bg-ink/90 active:bg-ink rounded-md shadow-sm transition-colors disabled:opacity-50"
              >
                {addMutation.isPending ? (
                  <>
                    <LoadingSpinner size="sm" className="text-surface" />
                    <span>Adding...</span>
                  </>
                ) : (
                  <span>Add Member</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
