export type ProjectRole = 'owner' | 'admin' | 'member';

export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  key: string;
  description?: string | null;
  task_counter: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  role?: ProjectRole;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectRole;
  email: string;
  name?: string | null;
  avatar_url?: string | null;
  joined_at: string;
}

export interface CreateProjectInput {
  name: string;
  key?: string;
  description?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
}

export interface AddProjectMemberInput {
  user_id: string;
  role?: 'admin' | 'member';
}

export interface UpdateProjectMemberRoleInput {
  role: 'admin' | 'member';
}

// RBAC Permission Helpers
export const canUpdateProject = (role?: ProjectRole | null): boolean => {
  return role === 'owner' || role === 'admin';
};

export const canArchiveProject = (role?: ProjectRole | null): boolean => {
  return role === 'owner' || role === 'admin';
};

export const canManageProjectMembers = (role?: ProjectRole | null): boolean => {
  return role === 'owner' || role === 'admin';
};

export const canChangeProjectMemberRole = (
  actorRole?: ProjectRole | null,
  targetMember?: ProjectMember | null,
  currentUserId?: string | null
): boolean => {
  if (!actorRole || !targetMember) return false;
  // Sole owner cannot demote themselves
  if (actorRole === 'owner' && targetMember.user_id === currentUserId) return false;
  if (targetMember.role === 'owner') return false;
  // Actor must be owner or admin
  if (actorRole === 'owner') return true;
  if (actorRole === 'admin') {
    return targetMember.role === 'member';
  }
  return false;
};

export const canRemoveProjectMember = (
  actorRole?: ProjectRole | null,
  targetMember?: ProjectMember | null,
  currentUserId?: string | null
): boolean => {
  if (!actorRole || !targetMember) return false;
  // Target is self (leaving the project): allowed if not sole owner
  if (targetMember.user_id === currentUserId) {
    return targetMember.role !== 'owner';
  }
  // Target is another member
  if (targetMember.role === 'owner') return false;
  if (actorRole === 'owner') return true;
  if (actorRole === 'admin') {
    return targetMember.role === 'member';
  }
  return false;
};

export interface ActivityActor {
  id: string;
  email: string;
  name?: string | null;
  avatar_url?: string | null;
}

export interface ActivityItem {
  id: string;
  project_id: string;
  task_id?: string | null;
  task_identifier?: string | null;
  task_title?: string | null;
  actor_id: string;
  actor: ActivityActor;
  action: string;
  metadata?: Record<string, any> | null;
  created_at: string;
}

