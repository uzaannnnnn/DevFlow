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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-project-member-title"
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 text-slate-100">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-indigo-400" />
            <h2 id="add-project-member-title" className="text-lg font-semibold">
              Add Project Member
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

        {candidateMembers.length === 0 ? (
          <div className="mt-4 p-4 text-center text-sm text-slate-400 bg-slate-950/50 rounded-lg border border-slate-800">
            <p className="font-medium text-slate-300">All workspace members are already in this project.</p>
            <p className="text-xs text-slate-500 mt-1">
              To add new people, invite them to the workspace first under Workspace Members.
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="mt-4 px-4 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4">
            {/* User Select */}
            <div>
              <label htmlFor="user-select" className="block text-sm font-medium text-slate-300 mb-1">
                Workspace Member <span className="text-red-400">*</span>
              </label>
              <select
                id="user-select"
                disabled={addMutation.isPending}
                {...register('user_id')}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-md text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
              >
                <option value="">Select a member...</option>
                {candidateMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name ? `${m.name} (${m.email})` : m.email} [{m.role}]
                  </option>
                ))}
              </select>
              {errors.user_id && (
                <p className="mt-1 text-xs text-red-400">{errors.user_id.message}</p>
              )}
            </div>

            {/* Role Select */}
            <div>
              <label htmlFor="role-select" className="block text-sm font-medium text-slate-300 mb-1">
                Project Role <span className="text-red-400">*</span>
              </label>
              <select
                id="role-select"
                disabled={addMutation.isPending}
                {...register('role')}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-md text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
              >
                <option value="member">Member — Can view and work on tasks</option>
                <option value="admin">Admin — Can manage project settings and members</option>
              </select>
              {errors.role && (
                <p className="mt-1 text-xs text-red-400">{errors.role.message}</p>
              )}
            </div>

            {/* Notice */}
            <div className="p-3 text-xs bg-slate-950 rounded-lg border border-slate-800 text-slate-400">
              <span className="font-semibold text-slate-300">Project Boundary Isolation:</span> Members added here can access this project's tasks. Workspace administrators cannot access this project unless explicitly added as members.
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleClose}
                disabled={addMutation.isPending}
                className="px-4 py-2 text-sm text-slate-300 hover:text-slate-100 hover:bg-slate-800 rounded-md transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-md transition-colors disabled:opacity-50"
              >
                {addMutation.isPending ? (
                  <>
                    <LoadingSpinner size="sm" />
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
