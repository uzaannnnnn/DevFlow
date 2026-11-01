export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  owner_id: string;
  role?: WorkspaceRole;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  email: string;
  name?: string | null;
  avatar_url?: string | null;
  created_at: string;
}

export interface CreateWorkspaceInput {
  name: string;
  slug?: string;
  description?: string;
}

export interface UpdateWorkspaceInput {
  name?: string;
  slug?: string;
  description?: string;
}

export interface AddMemberInput {
  email: string;
  role: WorkspaceRole;
}

export interface UpdateMemberRoleInput {
  role: WorkspaceRole;
}

// RBAC Permission Helpers
export const canUpdateWorkspace = (role?: WorkspaceRole | null): boolean => {
  return role === 'owner' || role === 'admin';
};

export const canDeleteWorkspace = (role?: WorkspaceRole | null): boolean => {
  return role === 'owner';
};

export const canManageMembers = (role?: WorkspaceRole | null): boolean => {
  return role === 'owner' || role === 'admin';
};

export const canTransferOwnership = (role?: WorkspaceRole | null): boolean => {
  return role === 'owner';
};

export const canChangeRole = (
  actorRole?: WorkspaceRole | null,
  targetMember?: WorkspaceMember | null,
  currentUserId?: string | null
): boolean => {
  if (!actorRole || !targetMember) return false;
  // Last owner cannot demote themselves
  if (actorRole === 'owner' && targetMember.user_id === currentUserId) return false;
  // Owner can manage anyone
  if (actorRole === 'owner') return true;
  // Admin can manage members and viewers, but not owner or other admins
  if (actorRole === 'admin') {
    return targetMember.role === 'member' || targetMember.role === 'viewer';
  }
  return false;
};

export const canRemoveMember = (
  actorRole?: WorkspaceRole | null,
  targetMember?: WorkspaceMember | null,
  currentUserId?: string | null
): boolean => {
  if (!actorRole || !targetMember) return false;
  // Target is self (leaving workspace): allowed for anyone EXCEPT the owner
  if (targetMember.user_id === currentUserId) {
    return actorRole !== 'owner';
  }
  // Target is someone else:
  if (actorRole === 'owner') return true;
  if (actorRole === 'admin') {
    return targetMember.role === 'member' || targetMember.role === 'viewer';
  }
  return false;
};

