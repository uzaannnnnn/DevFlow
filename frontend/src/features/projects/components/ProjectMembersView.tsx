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
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <Shield className="w-3 h-3" /> Owner
        </span>
      );
    case 'admin':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
          <Shield className="w-3 h-3" /> Admin
        </span>
      );
    case 'member':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
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
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">Project Members</h3>
          <p className="text-sm text-slate-400">
            Manage who has access to work on tasks in <span className="font-semibold text-indigo-400">[{project.key}] {project.name}</span>.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm self-start sm:self-auto"
            data-testid="add-project-member-button"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Member</span>
          </button>
        )}
      </div>

      {displayError && (
        <div
          role="alert"
          className="p-4 bg-red-950/40 border border-red-900/60 rounded-xl text-sm text-red-300 flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold">Action Failed</h4>
            <p className="mt-1">{displayError}</p>
          </div>
        </div>
      )}

      {/* Members Table */}
      <div className="bg-slate-950/40 border border-slate-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex justify-center">
            <LoadingSpinner size="md" />
          </div>
        ) : members.length === 0 ? (
          <div className="p-8 text-center text-slate-400">No project members found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-900/80 text-xs uppercase font-medium text-slate-400 border-b border-slate-800">
                <tr>
                  <th scope="col" className="px-6 py-3">Member</th>
                  <th scope="col" className="px-6 py-3">Role</th>
                  <th scope="col" className="px-6 py-3">Joined</th>
                  <th scope="col" className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {members.map((member) => {
                  const isSelf = member.user_id === user?.id;
                  const canChange = canChangeProjectMemberRole(currentUserRole, member, user?.id);
                  const canRemove = canRemoveProjectMember(currentUserRole, member, user?.id);

                  return (
                    <tr key={member.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center font-medium text-slate-200 uppercase border border-slate-700">
                            {member.name ? member.name.charAt(0) : member.email.charAt(0)}
                          </div>
                          <div>
                            <div className="font-medium text-slate-100 flex items-center gap-2">
                              {member.name || member.email.split('@')[0]}
                              {isSelf && (
                                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 font-mono">{member.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {getRoleBadge(member.role)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400">
                        {new Date(member.joined_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canChange && (
                            <select
                              aria-label={`Change role for ${member.name || member.email}`}
                              value={member.role}
                              disabled={updateRoleMutation.isPending}
                              onChange={(e) =>
                                handleRoleChange(member, e.target.value as 'admin' | 'member')
                              }
                              className="text-xs bg-slate-900 border border-slate-700 text-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
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
                                  ? 'text-amber-400 hover:bg-amber-500/10'
                                  : 'text-red-400 hover:bg-red-500/10'
                              }`}
                              title={isSelf ? 'Leave Project' : 'Remove Member'}
                            >
                              {isSelf ? (
                                <LogOut className="w-4 h-4" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 text-slate-100">
            <h3 className="text-lg font-semibold text-slate-100">
              {removalTarget.user_id === user?.id ? 'Leave Project' : 'Remove Project Member'}
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              {removalTarget.user_id === user?.id ? (
                <span>
                  Are you sure you want to leave <strong className="text-slate-200">{project.name}</strong>? Any tasks assigned to you in this project will be unassigned automatically.
                </span>
              ) : (
                <span>
                  Are you sure you want to remove <strong className="text-slate-200">{removalTarget.name || removalTarget.email}</strong> from this project? Any tasks assigned to them will be unassigned automatically per §8.13.
                </span>
              )}
            </p>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setRemovalTarget(null)}
                disabled={removeMemberMutation.isPending}
                className="px-4 py-2 text-sm text-slate-300 hover:text-slate-100 hover:bg-slate-800 rounded-md transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemove}
                disabled={removeMemberMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-md transition-colors disabled:opacity-50"
              >
                {removeMemberMutation.isPending ? (
                  <>
                    <LoadingSpinner size="sm" />
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
