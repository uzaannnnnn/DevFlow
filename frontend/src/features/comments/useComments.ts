import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { commentApi } from './api';
import { Comment, CreateCommentInput } from './types';
import { ApiClientError } from '../../shared/lib/api-client';

export const commentKeys = {
  all: ['comments'] as const,
  taskComments: (taskId: string) => ['tasks', taskId, 'comments'] as const,
};

export function useComments(taskId?: string) {
  return useQuery<{ comments: Comment[]; total: number }, ApiClientError>({
    queryKey: commentKeys.taskComments(taskId || ''),
    queryFn: async () => {
      if (!taskId) return { comments: [], total: 0 };
      const res = await commentApi.listComments(taskId);
      return res.data;
    },
    enabled: Boolean(taskId),
  });
}

export function useCreateCommentMutation(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ comment: Comment }, ApiClientError, CreateCommentInput>({
    mutationFn: async (input: CreateCommentInput) => {
      const res = await commentApi.createComment(taskId, input);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: commentKeys.taskComments(taskId),
      });
      // Invalidate project activities so activity feed shows 'comment_added'
      queryClient.invalidateQueries({
        queryKey: ['activities'],
      });
    },
  });
}
