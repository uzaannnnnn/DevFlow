import { apiClient, ApiResponse } from '../../shared/lib/api-client';
import { AuthTokens, LoginInput, RegisterInput, User } from './types';

export const authApi = {
  register: (input: RegisterInput): Promise<ApiResponse<{ user: User }>> => {
    return apiClient.post<{ user: User }>('/api/v1/auth/register', input);
  },

  login: (input: LoginInput): Promise<ApiResponse<AuthTokens>> => {
    return apiClient.post<AuthTokens>('/api/v1/auth/login', input);
  },

  refresh: (): Promise<ApiResponse<AuthTokens>> => {
    return apiClient.post<AuthTokens>('/api/v1/auth/refresh');
  },

  logout: (): Promise<ApiResponse<{ message: string }>> => {
    return apiClient.post<{ message: string }>('/api/v1/auth/logout');
  },

  getCurrentUser: (): Promise<ApiResponse<{ user: User }>> => {
    return apiClient.get<{ user: User }>('/api/v1/auth/me');
  },
};
