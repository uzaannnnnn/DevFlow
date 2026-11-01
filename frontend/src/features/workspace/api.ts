import { apiClient, ApiResponse } from '../../shared/lib/api-client';
import {
  Workspace,
  WorkspaceMember,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  AddMemberInput,
  UpdateMemberRoleInput,
} from './types';

export const workspaceApi = {
  listWorkspaces: (): Promise<ApiResponse<{ workspaces: Workspace[] }>> => {
    return apiClient.get<{ workspaces: Workspace[] }>('api/v1/workspaces');
  },

  getWorkspace: (id: string): Promise<ApiResponse<{ workspace: Workspace }>> => {
    return apiClient.get<{ workspace: Workspace }>(`api/v1/workspaces/${id}`);
  },

  createWorkspace: (input: CreateWorkspaceInput): Promise<ApiResponse<{ workspace: Workspace }>> => {
    return apiClient.post<{ workspace: Workspace }>('api/v1/workspaces', input);
  },

  updateWorkspace: (id: string, input: UpdateWorkspaceInput): Promise<ApiResponse<{ workspace: Workspace }>> => {
    return apiClient.patch<{ workspace: Workspace }>(`api/v1/workspaces/${id}`, input);
  },

  deleteWorkspace: (id: string): Promise<ApiResponse<{ message: string }>> => {
    return apiClient.delete<{ message: string }>(`api/v1/workspaces/${id}`);
  },

  listMembers: (workspaceId: string): Promise<ApiResponse<{ members: WorkspaceMember[] }>> => {
    return apiClient.get<{ members: WorkspaceMember[] }>(`api/v1/workspaces/${workspaceId}/members`);
  },

  addMember: (workspaceId: string, input: AddMemberInput): Promise<ApiResponse<{ member: WorkspaceMember }>> => {
    return apiClient.post<{ member: WorkspaceMember }>(`api/v1/workspaces/${workspaceId}/members`, input);
  },

  updateMemberRole: (
    workspaceId: string,
    memberId: string,
    input: UpdateMemberRoleInput
  ): Promise<ApiResponse<{ member: WorkspaceMember }>> => {
    return apiClient.patch<{ member: WorkspaceMember }>(`api/v1/workspaces/${workspaceId}/members/${memberId}`, input);
  },

  removeMember: (workspaceId: string, memberId: string): Promise<ApiResponse<{ message: string }>> => {
    return apiClient.delete<{ message: string }>(`api/v1/workspaces/${workspaceId}/members/${memberId}`);
  },
};

