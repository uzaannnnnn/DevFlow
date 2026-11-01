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
    case 'viewer':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-semibold bg-subtle text-muted border border-line">
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
      <div className="p-8 text-center text-muted text-xs">
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
    <div className="bg-surface border border-line rounded-lg shadow-sm p-6 text-ink">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-line">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-ink">Workspace Members</h2>
          <p className="text-xs text-muted mt-0.5">
            Manage members and role permissions for <span className="text-ink font-medium">{activeWorkspace.name}</span>
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => setIsAddDialogOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ink hover:bg-ink/90 active:bg-ink text-surface text-xs font-medium rounded-md shadow-sm transition-colors self-start sm:self-auto"
            data-testid="add-member-button"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add Member</span>
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-4 p-3 text-xs text-danger bg-danger-soft border border-danger/25 rounded-md flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-danger" />
          <span>{error}</span>
        </div>
      )}

      {/* Members Table */}
      <div className="mt-4 overflow-x-auto">
        {isLoading ? (
          <div className="py-12 flex justify-center items-center">
            <LoadingSpinner size="lg" className="text-accent" />
          </div>
        ) : (
          <table className="w-full text-left text-xs" data-testid="members-table">
            <thead>
              <tr className="border-b border-line text-muted text-2xs uppercase tracking-wider">
                <th className="py-2.5 px-3 font-semibold">User</th>
                <th className="py-2.5 px-3 font-semibold">Role</th>
                <th className="py-2.5 px-3 font-semibold">Joined</th>
                <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {members.map((member) => {
                const isSelf = member.user_id === user?.id;
                const canModify = canChangeRole(activeRole, member, user?.id);
                const canDelete = canRemoveMember(activeRole, member, user?.id);

                return (
                  <tr key={member.id} className="hover:bg-subtle transition-colors">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-subtle border border-line flex items-center justify-center font-semibold text-2xs text-ink-2">
                          {member.name ? member.name.charAt(0).toUpperCase() : member.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-ink flex items-center gap-2">
                            <span>{member.name || member.email}</span>
                            {isSelf && (
                              <span className="text-2xs bg-accent-soft text-accent border border-accent/25 px-1.5 py-0.2 rounded font-medium">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-2xs text-muted">{member.email}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      {canModify ? (
                        <select
                          value={member.role}
                          onChange={(e) => handleRoleChange(member, e.target.value as WorkspaceRole)}
                          className="px-2 py-1 text-xs font-medium rounded-md bg-surface border border-line text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent cursor-pointer"
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

                    <td className="py-3 px-3 text-2xs text-muted font-mono">
                      {new Date(member.created_at).toLocaleDateString()}
                    </td>

                    <td className="py-3 px-3 text-right">
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => setRemovalTarget(member)}
                          className="p-1.5 text-muted hover:text-danger hover:bg-danger-soft rounded-md transition-colors"
                          title={isSelf ? 'Leave Workspace' : 'Remove Member'}
                          aria-label={isSelf ? 'Leave Workspace' : `Remove ${member.email}`}
                          data-testid={`remove-member-${member.email}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {members.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay/50 backdrop-blur-xs" role="dialog" aria-modal="true">
          <div className="w-full max-w-md bg-surface border border-line rounded-lg shadow-modal p-6 text-ink">
            <div className="flex items-center gap-2 pb-3 border-b border-line text-accent">
              <ArrowRightLeft className="w-4 h-4" />
              <h3 className="text-sm font-semibold text-ink">Transfer Workspace Ownership</h3>
            </div>
            <div className="mt-3.5 text-xs text-ink-2 space-y-2">
              <p>
                Are you sure you want to transfer ownership of <strong className="text-ink">{activeWorkspace.name}</strong> to{' '}
                <strong className="text-ink">{transferTarget.name || transferTarget.email}</strong>?
              </p>
              <p className="text-accent text-2xs bg-accent-soft border border-accent/25 p-2.5 rounded-md">
                Per approved architecture (Decision 3), ownership can only be transferred to an existing Admin. After transfer, your role will be demoted to Admin.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2.5 mt-5 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setTransferTarget(null)}
                disabled={isTransferring}
                className="px-3 py-1.5 text-xs font-medium text-muted hover:text-ink transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmTransferOwnership}
                disabled={isTransferring}
                className="flex items-center justify-center px-3.5 py-1.5 text-xs font-medium text-surface bg-accent hover:bg-accent/90 active:bg-accent disabled:opacity-50 rounded-md shadow-sm transition-colors"
                data-testid="confirm-transfer-button"
              >
                {isTransferring ? <LoadingSpinner size="sm" className="mr-2 text-surface" /> : null}
                Transfer Ownership
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Member Removal Confirmation Modal */}
      {removalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay/50 backdrop-blur-xs" role="dialog" aria-modal="true">
          <div className="w-full max-w-md bg-surface border border-line rounded-lg shadow-modal p-6 text-ink">
            <div className="flex items-center gap-2 pb-3 border-b border-line text-danger">
              <Trash2 className="w-4 h-4" />
              <h3 className="text-sm font-semibold text-ink">
                {removalTarget.user_id === user?.id ? 'Leave Workspace' : 'Remove Member'}
              </h3>
            </div>
            <div className="mt-3.5 text-xs text-ink-2">
              {removalTarget.user_id === user?.id ? (
                <p>Are you sure you want to leave this workspace? You will lose access to all its projects and tasks.</p>
              ) : (
                <p>
                  Are you sure you want to remove <strong className="text-ink">{removalTarget.name || removalTarget.email}</strong> from this workspace? Any tasks assigned to them will be unassigned automatically.
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2.5 mt-5 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setRemovalTarget(null)}
                disabled={isRemoving}
                className="px-3 py-1.5 text-xs font-medium text-muted hover:text-ink transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRemoveMember}
                disabled={isRemoving}
                className="flex items-center justify-center px-3.5 py-1.5 text-xs font-medium text-surface bg-danger hover:bg-danger/90 active:bg-danger disabled:opacity-50 rounded-md shadow-sm transition-colors"
                data-testid="confirm-remove-button"
              >
                {isRemoving ? <LoadingSpinner size="sm" className="mr-2 text-surface" /> : null}
                {removalTarget.user_id === user?.id ? 'Leave Workspace' : 'Remove Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

