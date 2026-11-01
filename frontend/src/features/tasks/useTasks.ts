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
    { taskId: string; input: UpdateTaskInput },
    { previousTasksData?: { tasks: Task[]; total: number } }
  >({
    mutationFn: async ({ taskId, input }) => {
      const res = await taskApi.updateTask(taskId, input);
      return res.data;
    },
    onMutate: async ({ taskId, input }) => {
      await queryClient.cancelQueries({
        queryKey: ['projects', projectId, 'tasks'],
      });

      const previousTasksData = queryClient.getQueryData<{
        tasks: Task[];
        total: number;
      }>(taskKeys.projectTasks(projectId));

      // Optimistically update task in all queries for this project
      queryClient.setQueriesData<{ tasks: Task[]; total: number }>(
        { queryKey: ['projects', projectId, 'tasks'] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            tasks: old.tasks.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    ...input,
                    updated_at: new Date().toISOString(),
                  }
                : t
            ),
          };
        }
      );

      return { previousTasksData };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTasksData) {
        queryClient.setQueriesData(
          { queryKey: ['projects', projectId, 'tasks'] },
          context.previousTasksData
        );
      }
    },
    onSettled: (data, _err, variables) => {
      if (data?.task) {
        queryClient.setQueryData(taskKeys.detail(data.task.id), {
          task: data.task,
        });
      }
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'tasks'],
      });
      queryClient.invalidateQueries({
        queryKey: taskKeys.detail(variables.taskId),
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
