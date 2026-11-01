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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-member-title"
    >
      <div className="w-full max-w-md bg-surface border border-line rounded-lg shadow-modal p-6 text-ink">
        <div className="flex items-center justify-between pb-3.5 border-b border-line">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-accent" />
            <h2 id="add-member-title" className="text-sm font-semibold text-ink">
              Add Member to Workspace
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
            <label htmlFor="member-email" className="block text-xs font-medium text-ink-2">
              User Email <span className="text-danger">*</span>
            </label>
            <input
              id="member-email"
              type="email"
              placeholder="colleague@example.com"
              {...register('email')}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'member-email-error' : undefined}
              className="mt-1 block w-full px-3 py-2 bg-surface border border-line rounded-md text-xs text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            {errors.email && (
              <p id="member-email-error" className="mt-1 text-2xs text-danger">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="member-role" className="block text-xs font-medium text-ink-2">
              Role <span className="text-danger">*</span>
            </label>
            <select
              id="member-role"
              {...register('role')}
              className="mt-1 block w-full px-3 py-2 bg-surface border border-line rounded-md text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <option value="member">Member (Can create & manage tasks/projects)</option>
              <option value="admin">Admin (Can manage members and settings)</option>
              <option value="viewer">Viewer (Read-only access)</option>
            </select>
            {errors.role && (
              <p className="mt-1 text-2xs text-danger">{errors.role.message}</p>
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

