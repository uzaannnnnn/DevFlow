import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { addMemberSchema, AddMemberFormValues } from '../schemas';
import { workspaceApi } from '../api';
import { ApiClientError } from '../../../shared/lib/api-client';
import { LoadingSpinner } from '../../../shared/ui/LoadingSpinner';
import { X, UserPlus } from 'lucide-react';

export interface AddMemberDialogProps {
  isOpen: boolean;
  workspaceId: string;
  onClose: () => void;
  onMemberAdded: () => void;
}

export const AddMemberDialog: React.FC<AddMemberDialogProps> = ({
  isOpen,
  workspaceId,
  onClose,
  onMemberAdded,
}) => {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddMemberFormValues>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: {
      email: '',
      role: 'member',
    },
  });

  if (!isOpen) return null;

  const handleClose = () => {
    reset();
    setServerError(null);
    onClose();
  };

  const onSubmit = async (values: AddMemberFormValues) => {
    setServerError(null);
    try {
      await workspaceApi.addMember(workspaceId, {
        email: values.email.trim(),
        role: values.role,
      });
      reset();
      onMemberAdded();
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.message || 'Failed to add member to workspace');
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
      aria-labelledby="add-member-title"
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 text-slate-100">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-indigo-400" />
            <h2 id="add-member-title" className="text-lg font-semibold">
              Add Member to Workspace
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
            <label htmlFor="member-email" className="block text-sm font-medium text-slate-300">
              User Email <span className="text-red-400">*</span>
            </label>
            <input
              id="member-email"
              type="email"
              placeholder="colleague@example.com"
              {...register('email')}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'member-email-error' : undefined}
              className="mt-1 block w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {errors.email && (
              <p id="member-email-error" className="mt-1 text-xs text-red-400">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="member-role" className="block text-sm font-medium text-slate-300">
              Role <span className="text-red-400">*</span>
            </label>
            <select
              id="member-role"
              {...register('role')}
              className="mt-1 block w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="member">Member (Can create & manage tasks/projects)</option>
              <option value="admin">Admin (Can manage members and settings)</option>
              <option value="viewer">Viewer (Read-only access)</option>
            </select>
            {errors.role && (
              <p className="mt-1 text-xs text-red-400">{errors.role.message}</p>
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
                  Adding...
                </>
              ) : (
                'Add Member'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

