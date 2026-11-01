import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useWorkspace } from '../WorkspaceContext';
import { workspaceApi } from '../api';
import { WorkspaceMember, WorkspaceRole, canManageMembers, canChangeRole, canRemoveMember } from '../types';
import { AddMemberDialog } from './AddMemberDialog';
import { LoadingSpinner } from '../../../shared/ui/LoadingSpinner';
import { ApiClientError } from '../../../shared/lib/api-client';
import { UserPlus, Shield, User, Eye, Trash2, ArrowRightLeft, AlertCircle } from 'lucide-react';

const getRoleBadge = (role: WorkspaceRole) => {
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
    case 'viewer':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
          <Eye className="w-3 h-3" /> Viewer
        </span>
      );
  }
};

export const WorkspaceMembersView: React.FC = () => {
  const { user } = useAuth();
  const { activeWorkspace, activeRole, refreshWorkspaces } = useWorkspace();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<WorkspaceMember | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [removalTarget, setRemovalTarget] = useState<WorkspaceMember | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!activeWorkspace) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await workspaceApi.listMembers(activeWorkspace.id);
      setMembers(res.data.members || []);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to load workspace members');
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  if (!activeWorkspace) {
    return (
      <div className="p-8 text-center text-slate-400">
        No workspace selected. Please select or create a workspace.
      </div>
    );
  }

  const handleRoleChange = async (member: WorkspaceMember, newRole: WorkspaceRole) => {
    if (newRole === 'owner') {
      // Standalone Ownership Transfer (Decision 3)
      setTransferTarget(member);
      return;
    }

    try {
      await workspaceApi.updateMemberRole(activeWorkspace.id, member.user_id, { role: newRole });
      fetchMembers();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to update member role');
      }
    }
  };

  const confirmTransferOwnership = async () => {
    if (!transferTarget || !activeWorkspace) return;
    setIsTransferring(true);
    setError(null);
    try {
      await workspaceApi.updateMemberRole(activeWorkspace.id, transferTarget.user_id, { role: 'owner' });
      setTransferTarget(null);
      await fetchMembers();
      await refreshWorkspaces();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to transfer ownership');
      }
    } finally {
      setIsTransferring(false);
    }
  };

  const confirmRemoveMember = async () => {
    if (!removalTarget || !activeWorkspace) return;
    setIsRemoving(true);
    setError(null);
    try {
      await workspaceApi.removeMember(activeWorkspace.id, removalTarget.user_id);
      setRemovalTarget(null);
      await fetchMembers();
      // If user removed themselves, refresh workspaces
      if (removalTarget.user_id === user?.id) {
        await refreshWorkspaces();
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to remove member');
      }
    } finally {
      setIsRemoving(false);
    }
  };

  const canManage = canManageMembers(activeRole);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg p-6 text-slate-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Workspace Members</h2>
          <p className="text-sm text-slate-400 mt-1">
            Manage members and role permissions for <span className="text-slate-200 font-semibold">{activeWorkspace.name}</span>
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => setIsAddDialogOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors self-start sm:self-auto"
            data-testid="add-member-button"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Member</span>
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-4 p-3 text-sm text-red-300 bg-red-950/40 border border-red-900/60 rounded-md flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Members Table */}
      <div className="mt-6 overflow-x-auto">
        {isLoading ? (
          <div className="py-12 flex justify-center items-center">
            <LoadingSpinner size="lg" className="text-indigo-400" />
          </div>
        ) : (
          <table className="w-full text-left text-sm" data-testid="members-table">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                <th className="py-3 px-4 font-semibold">User</th>
                <th className="py-3 px-4 font-semibold">Role</th>
                <th className="py-3 px-4 font-semibold">Joined</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {members.map((member) => {
                const isSelf = member.user_id === user?.id;
                const canModify = canChangeRole(activeRole, member, user?.id);
                const canDelete = canRemoveMember(activeRole, member, user?.id);

                return (
                  <tr key={member.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-indigo-400">
                          {member.name ? member.name.charAt(0).toUpperCase() : member.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-slate-200 flex items-center gap-2">
                            <span>{member.name || member.email}</span>
                            {isSelf && (
                              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.2 rounded font-medium">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400">{member.email}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {canModify ? (
                        <select
                          value={member.role}
                          onChange={(e) => handleRoleChange(member, e.target.value as WorkspaceRole)}
                          className="px-2.5 py-1 text-xs font-medium rounded-md bg-slate-950 border border-slate-700 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                          aria-label={`Change role for ${member.email}`}
                          data-testid={`role-select-${member.email}`}
                        >
                          {activeRole === 'owner' && <option value="owner">Owner (Transfer)</option>}
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      ) : (
                        getRoleBadge(member.role)
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-xs text-slate-400">
                      {new Date(member.created_at).toLocaleDateString()}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => setRemovalTarget(member)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                          title={isSelf ? 'Leave Workspace' : 'Remove Member'}
                          aria-label={isSelf ? 'Leave Workspace' : `Remove ${member.email}`}
                          data-testid={`remove-member-${member.email}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {members.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400">
                    No members found in this workspace.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Member Dialog */}
      <AddMemberDialog
        isOpen={isAddDialogOpen}
        workspaceId={activeWorkspace.id}
        onClose={() => setIsAddDialogOpen(false)}
        onMemberAdded={fetchMembers}
      />

      {/* Ownership Transfer Confirmation Modal */}
      {transferTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 text-slate-100">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800 text-amber-400">
              <ArrowRightLeft className="w-5 h-5" />
              <h3 className="text-lg font-semibold text-slate-100">Transfer Workspace Ownership</h3>
            </div>
            <div className="mt-4 text-sm text-slate-300 space-y-2">
              <p>
                Are you sure you want to transfer ownership of <strong className="text-white">{activeWorkspace.name}</strong> to{' '}
                <strong className="text-white">{transferTarget.name || transferTarget.email}</strong>?
              </p>
              <p className="text-amber-300/90 text-xs bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-md">
                Per approved architecture (Decision 3), ownership can only be transferred to an existing Admin. After transfer, your role will be demoted to Admin.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setTransferTarget(null)}
                disabled={isTransferring}
                className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmTransferOwnership}
                disabled={isTransferring}
                className="flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-500 active:bg-amber-700 disabled:opacity-50 rounded-md shadow-sm transition-colors"
                data-testid="confirm-transfer-button"
              >
                {isTransferring ? <LoadingSpinner size="sm" className="mr-2 text-white" /> : null}
                Transfer Ownership
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Member Removal Confirmation Modal */}
      {removalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 text-slate-100">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800 text-red-400">
              <Trash2 className="w-5 h-5" />
              <h3 className="text-lg font-semibold text-slate-100">
                {removalTarget.user_id === user?.id ? 'Leave Workspace' : 'Remove Member'}
              </h3>
            </div>
            <div className="mt-4 text-sm text-slate-300">
              {removalTarget.user_id === user?.id ? (
                <p>Are you sure you want to leave this workspace? You will lose access to all its projects and tasks.</p>
              ) : (
                <p>
                  Are you sure you want to remove <strong className="text-white">{removalTarget.name || removalTarget.email}</strong> from this workspace? Any tasks assigned to them will be unassigned automatically.
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setRemovalTarget(null)}
                disabled={isRemoving}
                className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRemoveMember}
                disabled={isRemoving}
                className="flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 active:bg-red-700 disabled:opacity-50 rounded-md shadow-sm transition-colors"
                data-testid="confirm-remove-button"
              >
                {isRemoving ? <LoadingSpinner size="sm" className="mr-2 text-white" /> : null}
                {removalTarget.user_id === user?.id ? 'Leave Workspace' : 'Remove Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

