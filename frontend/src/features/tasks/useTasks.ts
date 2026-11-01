import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { taskApi } from './api';
import {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  TaskListFilters,
} from './types';
import { ApiClientError } from '../../shared/lib/api-client';

export const taskKeys = {
  all: ['tasks'] as const,
  projectTasks: (projectId: string, filters?: TaskListFilters) =>
    ['projects', projectId, 'tasks', filters || {}] as const,
  detail: (taskId: string) => ['tasks', taskId] as const,
};

export function useTasks(projectId?: string, filters?: TaskListFilters) {
  return useQuery<{ tasks: Task[]; total: number }, ApiClientError>({
    queryKey: taskKeys.projectTasks(projectId || '', filters),
    queryFn: async () => {
      if (!projectId) return { tasks: [], total: 0 };
      const res = await taskApi.listTasks(projectId, filters);
      return res.data;
    },
    enabled: Boolean(projectId),
  });
}

export function useTask(taskId?: string) {
  return useQuery<{ task: Task }, ApiClientError>({
    queryKey: taskKeys.detail(taskId || ''),
    queryFn: async () => {
      if (!taskId) throw new Error('Task ID required');
      const res = await taskApi.getTask(taskId);
      return res.data;
    },
    enabled: Boolean(taskId),
  });
}

export function useCreateTaskMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ task: Task }, ApiClientError, CreateTaskInput>({
    mutationFn: async (input: CreateTaskInput) => {
      const res = await taskApi.createTask(projectId, input);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'tasks'],
      });
      // Invalidate project detail to refresh task_counter
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId],
      });
      queryClient.setQueryData(taskKeys.detail(data.task.id), {
        task: data.task,
      });
    },
  });
}

export function useUpdateTaskMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    { task: Task },
    ApiClientError,
    { taskId: string; input: UpdateTaskInput }
  >({
    mutationFn: async ({ taskId, input }) => {
      const res = await taskApi.updateTask(taskId, input);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(taskKeys.detail(data.task.id), {
        task: data.task,
      });
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'tasks'],
      });
    },
  });
}

export function useDeleteTaskMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ message: string }, ApiClientError, string>({
    mutationFn: async (taskId: string) => {
      const res = await taskApi.deleteTask(taskId);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'tasks'],
      });
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId],
      });
    },
  });
}
