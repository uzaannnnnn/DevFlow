import { apiClient, ApiResponse } from '../../shared/lib/api-client';
import {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  TaskListFilters,
} from './types';

export const taskApi = {
  listTasks: (
    projectId: string,
    filters?: TaskListFilters
  ): Promise<ApiResponse<{ tasks: Task[]; total: number }>> => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.priority) params.append('priority', filters.priority);
    if (filters?.assignee_id) params.append('assignee_id', filters.assignee_id);
    if (filters?.search && filters.search.trim()) params.append('search', filters.search.trim());
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());

    const query = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get<{ tasks: Task[]; total: number }>(
      `api/v1/projects/${projectId}/tasks${query}`
    );
  },

  getTask: (taskId: string): Promise<ApiResponse<{ task: Task }>> => {
    return apiClient.get<{ task: Task }>(`api/v1/tasks/${taskId}`);
  },

  createTask: (
    projectId: string,
    input: CreateTaskInput
  ): Promise<ApiResponse<{ task: Task }>> => {
    return apiClient.post<{ task: Task }>(`api/v1/projects/${projectId}/tasks`, input);
  },

  updateTask: (
    taskId: string,
    input: UpdateTaskInput
  ): Promise<ApiResponse<{ task: Task }>> => {
    return apiClient.patch<{ task: Task }>(`api/v1/tasks/${taskId}`, input);
  },

  deleteTask: (taskId: string): Promise<ApiResponse<{ message: string }>> => {
    return apiClient.delete<{ message: string }>(`api/v1/tasks/${taskId}`);
  },
};
