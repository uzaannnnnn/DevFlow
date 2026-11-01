import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectApi } from './api';
import {
  Project,
  ProjectMember,
  CreateProjectInput,
  UpdateProjectInput,
  AddProjectMemberInput,
  UpdateProjectMemberRoleInput,
} from './types';
import { ApiClientError } from '../../shared/lib/api-client';

export const projectKeys = {
  all: ['projects'] as const,
  workspaceProjects: (workspaceId: string, search?: string) =>
    ['workspaces', workspaceId, 'projects', { search: search || '' }] as const,
  detail: (projectId: string) => ['projects', projectId] as const,
  members: (projectId: string) => ['projects', projectId, 'members'] as const,
};

export function useProjects(workspaceId?: string, search?: string) {
  return useQuery<{ projects: Project[]; total: number }, ApiClientError>({
    queryKey: projectKeys.workspaceProjects(workspaceId || '', search),
    queryFn: async () => {
      if (!workspaceId) return { projects: [], total: 0 };
      const res = await projectApi.listProjects(workspaceId, search);
      return res.data;
    },
    enabled: Boolean(workspaceId),
  });
}

export function useProject(projectId?: string) {
  return useQuery<{ project: Project }, ApiClientError>({
    queryKey: projectKeys.detail(projectId || ''),
    queryFn: async () => {
      if (!projectId) throw new Error('Project ID required');
      const res = await projectApi.getProject(projectId);
      return res.data;
    },
    enabled: Boolean(projectId),
  });
}

export function useProjectMembers(projectId?: string) {
  return useQuery<{ members: ProjectMember[] }, ApiClientError>({
    queryKey: projectKeys.members(projectId || ''),
    queryFn: async () => {
      if (!projectId) return { members: [] };
      const res = await projectApi.listMembers(projectId);
      return res.data;
    },
    enabled: Boolean(projectId),
  });
}

export function useCreateProjectMutation(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ project: Project }, ApiClientError, CreateProjectInput>({
    mutationFn: async (input: CreateProjectInput) => {
      const res = await projectApi.createProject(workspaceId, input);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['workspaces', workspaceId, 'projects'],
      });
      queryClient.setQueryData(projectKeys.detail(data.project.id), {
        project: data.project,
      });
    },
  });
}

export function useUpdateProjectMutation(projectId: string, workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ project: Project }, ApiClientError, UpdateProjectInput>({
    mutationFn: async (input: UpdateProjectInput) => {
      const res = await projectApi.updateProject(projectId, input);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(projectKeys.detail(projectId), {
        project: data.project,
      });
      queryClient.invalidateQueries({
        queryKey: ['workspaces', workspaceId, 'projects'],
      });
    },
  });
}

export function useArchiveProjectMutation(projectId: string, workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ message: string }, ApiClientError, void>({
    mutationFn: async () => {
      const res = await projectApi.archiveProject(projectId);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspaces', workspaceId, 'projects'],
      });
      queryClient.removeQueries({
        queryKey: projectKeys.detail(projectId),
      });
    },
  });
}

export function useAddProjectMemberMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ member: ProjectMember }, ApiClientError, AddProjectMemberInput>({
    mutationFn: async (input: AddProjectMemberInput) => {
      const res = await projectApi.addMember(projectId, input);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.members(projectId),
      });
    },
  });
}

export function useUpdateProjectMemberRoleMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    { member: ProjectMember },
    ApiClientError,
    { userId: string; input: UpdateProjectMemberRoleInput }
  >({
    mutationFn: async ({ userId, input }) => {
      const res = await projectApi.updateMemberRole(projectId, userId, input);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.members(projectId),
      });
    },
  });
}

export function useRemoveProjectMemberMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ message: string }, ApiClientError, string>({
    mutationFn: async (userId: string) => {
      const res = await projectApi.removeMember(projectId, userId);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.members(projectId),
      });
    },
  });
}
