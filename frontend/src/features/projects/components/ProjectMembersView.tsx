import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useWorkspace } from '../../workspace/WorkspaceContext';
import { workspaceApi } from '../../workspace/api';
import { WorkspaceMember } from '../../workspace/types';
import {
  useProjectMembers,
  useUpdateProjectMemberRoleMutation,
  useRemoveProjectMemberMutation,
} from '../useProjects';
import {
  Project,
  ProjectMember,
  ProjectRole,
  canManageProjectMembers,
  canChangeProjectMemberRole,
  canRemoveProjectMember,
} from '../types';
import { AddProjectMemberModal } from './AddProjectMemberModal';
import { LoadingSpinner } from '../../../shared/ui/LoadingSpinner';
import { UserPlus, Shield, User, Trash2, AlertCircle, LogOut } from 'lucide-react';

export interface ProjectMembersViewProps {
  project: Project;
  onMemberChanged?: () => void;
  onProjectLeft?: () => void;
}

const getRoleBadge = (role: ProjectRole) => {
  switch (role) {
    case 'owner':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-semibold bg-accent-soft text-accent border border-accent/25">
          <Shield className="w-3 h-3" /> Owner
        </span>
      );
    case 'admin':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-semibold bg-info-soft text-info border border-info/25">
          <Shield className="w-3 h-3" /> Admin
        </span>
      );
    case 'member':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-semibold bg-success-soft text-success border border-success/25">
          <User className="w-3 h-3" /> Member
        </span>
      );
  }
};

export const ProjectMembersView: React.FC<ProjectMembersViewProps> = ({
  project,
  onMemberChanged,
  onProjectLeft,
}) => {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [removalTarget, setRemovalTarget] = useState<ProjectMember | null>(null);

  const {
    data: membersData,
    isLoading,
    error: fetchError,
  } = useProjectMembers(project.id);

  const members = membersData?.members || [];
  const updateRoleMutation = useUpdateProjectMemberRoleMutation(project.id);
  const removeMemberMutation = useRemoveProjectMemberMutation(project.id);

  // Fetch workspace members to know who can be added
  const fetchWorkspaceMembers = useCallback(async () => {
    if (!activeWorkspace) return;
    try {
      const res = await workspaceApi.listMembers(activeWorkspace.id);
      setWorkspaceMembers(res.data.members || []);
    } catch {
      // Non-fatal, candidate list will be empty
    }
  }, [activeWorkspace]);

  useEffect(() => {
    fetchWorkspaceMembers();
  }, [fetchWorkspaceMembers]);

  // Determine current user's role in this project
  const currentMember = members.find((m) => m.user_id === user?.id);
  const currentUserRole = currentMember?.role || project.role;
  const canManage = canManageProjectMembers(currentUserRole);

  const handleRoleChange = async (member: ProjectMember, newRole: 'admin' | 'member') => {
    setMutationError(null);
    updateRoleMutation.mutate(
      { userId: member.user_id, input: { role: newRole } },
      {
        onSuccess: () => {
          if (onMemberChanged) onMemberChanged();
        },
        onError: (err) => {
          setMutationError(err.message || 'Failed to update project member role');
        },
      }
    );
  };

  const handleConfirmRemove = async () => {
    if (!removalTarget) return;
    setMutationError(null);
    removeMemberMutation.mutate(removalTarget.user_id, {
      onSuccess: () => {
        const isSelf = removalTarget.user_id === user?.id;
        setRemovalTarget(null);
        if (isSelf && onProjectLeft) {
          onProjectLeft();
        } else {
          if (onMemberChanged) onMemberChanged();
        }
      },
      onError: (err) => {
        setMutationError(err.message || 'Failed to remove project member');
      },
    });
  };

  const displayError = mutationError || fetchError?.message || null;

  return (
    <div className="space-y-5">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">Project Members</h3>
          <p className="text-xs text-muted mt-0.5">
            Manage who has access to work on tasks in <span className="font-semibold text-ink">[{project.key}] {project.name}</span>.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ink hover:bg-ink/90 active:bg-ink text-surface text-xs font-medium rounded-md transition-colors shadow-sm self-start sm:self-auto"
            data-testid="add-project-member-button"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add Member</span>
          </button>
        )}
      </div>

      {displayError && (
        <div
          role="alert"
          className="p-3 bg-danger-soft border border-danger/25 rounded-md text-xs text-danger flex items-start gap-2.5"
        >
          <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold">Action Failed</h4>
            <p className="mt-0.5">{displayError}</p>
          </div>
        </div>
      )}

      {/* Members Table */}
      <div className="bg-surface border border-line rounded-lg shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex justify-center">
            <LoadingSpinner size="md" />
          </div>
        ) : members.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted">No project members found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-ink">
              <thead className="bg-subtle/50 text-2xs uppercase font-medium text-muted border-b border-line">
                <tr>
                  <th scope="col" className="px-4 py-2.5">Member</th>
                  <th scope="col" className="px-4 py-2.5">Role</th>
                  <th scope="col" className="px-4 py-2.5">Joined</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {members.map((member) => {
                  const isSelf = member.user_id === user?.id;
                  const canChange = canChangeProjectMemberRole(currentUserRole, member, user?.id);
                  const canRemove = canRemoveProjectMember(currentUserRole, member, user?.id);

                  return (
                    <tr key={member.id} className="hover:bg-subtle transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-subtle border border-line flex items-center justify-center font-medium text-ink-2 uppercase text-2xs">
                            {member.name ? member.name.charAt(0) : member.email.charAt(0)}
                          </div>
                          <div>
                            <div className="font-medium text-ink flex items-center gap-1.5">
                              {member.name || member.email.split('@')[0]}
                              {isSelf && (
                                <span className="text-2xs uppercase font-medium px-1.5 py-0.2 rounded bg-subtle text-muted border border-line">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-2xs text-muted font-mono">{member.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getRoleBadge(member.role)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-2xs text-muted font-mono">
                        {new Date(member.joined_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canChange && (
                            <select
                              aria-label={`Change role for ${member.name || member.email}`}
                              value={member.role}
                              disabled={updateRoleMutation.isPending}
                              onChange={(e) =>
                                handleRoleChange(member, e.target.value as 'admin' | 'member')
                              }
                              className="text-xs bg-surface border border-line text-ink rounded px-2 py-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:opacity-50"
                            >
                              <option value="member">Member</option>
                              <option value="admin">Admin</option>
                            </select>
                          )}

                          {canRemove && (
                            <button
                              type="button"
                              onClick={() => setRemovalTarget(member)}
                              disabled={removeMemberMutation.isPending}
                              className={`p-1.5 rounded transition-colors disabled:opacity-50 ${
                                isSelf
                                  ? 'text-warning hover:bg-warning-soft'
                                  : 'text-muted hover:text-danger hover:bg-danger-soft'
                              }`}
                              title={isSelf ? 'Leave Project' : 'Remove Member'}
                            >
                              {isSelf ? (
                                <LogOut className="w-3.5 h-3.5" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Removal / Leave Confirmation Modal */}
      {removalTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-surface border border-line rounded-lg shadow-modal p-6 text-ink">
            <h3 className="text-sm font-semibold text-ink">
              {removalTarget.user_id === user?.id ? 'Leave Project' : 'Remove Project Member'}
            </h3>
            <p className="mt-2 text-xs text-muted leading-relaxed">
              {removalTarget.user_id === user?.id ? (
                <span>
                  Are you sure you want to leave <strong className="text-ink">{project.name}</strong>? Any tasks assigned to you in this project will be unassigned automatically.
                </span>
              ) : (
                <span>
                  Are you sure you want to remove <strong className="text-ink">{removalTarget.name || removalTarget.email}</strong> from this project? Any tasks assigned to them will be unassigned automatically per §8.13.
                </span>
              )}
            </p>

            <div className="flex justify-end gap-2.5 mt-5 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setRemovalTarget(null)}
                disabled={removeMemberMutation.isPending}
                className="px-3 py-1.5 text-xs font-medium text-muted hover:text-ink rounded-md transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemove}
                disabled={removeMemberMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-surface bg-danger hover:bg-danger/90 rounded-md transition-colors disabled:opacity-50"
              >
                {removeMemberMutation.isPending ? (
                  <>
                    <LoadingSpinner size="sm" className="text-surface" />
                    <span>Removing...</span>
                  </>
                ) : (
                  <span>{removalTarget.user_id === user?.id ? 'Confirm Leave' : 'Confirm Remove'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      <AddProjectMemberModal
        isOpen={isAddModalOpen}
        projectId={project.id}
        workspaceMembers={workspaceMembers}
        currentProjectMembers={members}
        onClose={() => setIsAddModalOpen(false)}
        onAdded={() => {
          if (onMemberChanged) onMemberChanged();
        }}
      />
    </div>
  );
};
