import { apiClient, ApiResponse } from '../../shared/lib/api-client';
import {
  Project,
  ProjectMember,
  ActivityItem,
  CreateProjectInput,
  UpdateProjectInput,
  AddProjectMemberInput,
  UpdateProjectMemberRoleInput,
} from './types';

export const projectApi = {
  listProjects: (
    workspaceId: string,
    search?: string
  ): Promise<ApiResponse<{ projects: Project[]; total: number }>> => {
    const params = new URLSearchParams();
    if (search && search.trim()) {
      params.append('search', search.trim());
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get<{ projects: Project[]; total: number }>(
      `api/v1/workspaces/${workspaceId}/projects${query}`
    );
  },

  getProject: (projectId: string): Promise<ApiResponse<{ project: Project }>> => {
    return apiClient.get<{ project: Project }>(`api/v1/projects/${projectId}`);
  },

  createProject: (
    workspaceId: string,
    input: CreateProjectInput
  ): Promise<ApiResponse<{ project: Project }>> => {
    return apiClient.post<{ project: Project }>(
      `api/v1/workspaces/${workspaceId}/projects`,
      input
    );
  },

  updateProject: (
    projectId: string,
    input: UpdateProjectInput
  ): Promise<ApiResponse<{ project: Project }>> => {
    return apiClient.patch<{ project: Project }>(`api/v1/projects/${projectId}`, input);
  },

  archiveProject: (projectId: string): Promise<ApiResponse<{ message: string }>> => {
    return apiClient.delete<{ message: string }>(`api/v1/projects/${projectId}`);
  },

  listMembers: (projectId: string): Promise<ApiResponse<{ members: ProjectMember[] }>> => {
    return apiClient.get<{ members: ProjectMember[] }>(`api/v1/projects/${projectId}/members`);
  },

  addMember: (
    projectId: string,
    input: AddProjectMemberInput
  ): Promise<ApiResponse<{ member: ProjectMember }>> => {
    return apiClient.post<{ member: ProjectMember }>(
      `api/v1/projects/${projectId}/members`,
      input
    );
  },

  updateMemberRole: (
    projectId: string,
    userId: string,
    input: UpdateProjectMemberRoleInput
  ): Promise<ApiResponse<{ member: ProjectMember }>> => {
    return apiClient.patch<{ member: ProjectMember }>(
      `api/v1/projects/${projectId}/members/${userId}`,
      input
    );
  },

  removeMember: (
    projectId: string,
    userId: string
  ): Promise<ApiResponse<{ message: string }>> => {
    return apiClient.delete<{ message: string }>(
      `api/v1/projects/${projectId}/members/${userId}`
    );
  },

  listActivities: (
    projectId: string,
    params?: { page?: number; page_size?: number }
  ): Promise<ApiResponse<{ activities: ActivityItem[]; total: number }>> => {
    return apiClient.get<{ activities: ActivityItem[]; total: number }>(
      `api/v1/projects/${projectId}/activities`,
      { params }
    );
  },
};
