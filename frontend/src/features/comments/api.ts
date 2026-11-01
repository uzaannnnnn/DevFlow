import { apiClient, ApiResponse } from '../../shared/lib/api-client';
import { Comment, CreateCommentInput } from './types';

export const commentApi = {
  listComments: (
    taskId: string,
    params?: { page?: number; page_size?: number }
  ): Promise<ApiResponse<{ comments: Comment[]; total: number }>> => {
    return apiClient.get<{ comments: Comment[]; total: number }>(
      `api/v1/tasks/${taskId}/comments`,
      { params }
    );
  },

  createComment: (
    taskId: string,
    input: CreateCommentInput
  ): Promise<ApiResponse<{ comment: Comment }>> => {
    return apiClient.post<{ comment: Comment }>(
      `api/v1/tasks/${taskId}/comments`,
      input
    );
  },
};
