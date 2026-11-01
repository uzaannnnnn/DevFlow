import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from '../AuthContext';
import { authApi } from '../api';
import { getAuthToken } from '../../../shared/lib/api-client';
import type { ReactNode } from 'react';

vi.mock('../api', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}));

describe('AuthContext and useAuth Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthProvider skipInitialRefresh={true}>{children}</AuthProvider>
  );

  it('provides initial unauthenticated state and allows login', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.user).toBeNull();
    expect(result.current.accessToken).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);

    vi.mocked(authApi.login).mockResolvedValueOnce({
      success: true,
      data: {
        access_token: 'memory-access-token-123',
        token_type: 'Bearer',
        expires_in: 900,
        user: {
          id: 'uuid-1',
          email: 'dev@devflow.local',
          name: 'Developer',
          avatar_url: null,
          created_at: new Date().toISOString(),
        },
      },
      meta: null,
    });

    await act(async () => {
      await result.current.login({ email: 'dev@devflow.local', password: 'password123' });
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe('dev@devflow.local');
    expect(result.current.accessToken).toBe('memory-access-token-123');

    // Security assertion: Access token is set in memory only
    expect(getAuthToken()).toBe('memory-access-token-123');
    if (typeof window !== 'undefined' && window.localStorage?.getItem) {
      expect(window.localStorage.getItem('access_token')).toBeNull();
    }
    if (typeof window !== 'undefined' && window.sessionStorage?.getItem) {
      expect(window.sessionStorage.getItem('access_token')).toBeNull();
    }
  });

  it('clears in-memory token and resets user on logout', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    vi.mocked(authApi.login).mockResolvedValueOnce({
      success: true,
      data: {
        access_token: 'token-to-be-logged-out',
        token_type: 'Bearer',
        expires_in: 900,
        user: {
          id: 'uuid-1',
          email: 'dev@devflow.local',
          name: 'Developer',
          avatar_url: null,
          created_at: new Date().toISOString(),
        },
      },
      meta: null,
    });

    await act(async () => {
      await result.current.login({ email: 'dev@devflow.local', password: 'password123' });
    });

    expect(result.current.isAuthenticated).toBe(true);

    vi.mocked(authApi.logout).mockResolvedValueOnce({
      success: true,
      data: { message: 'Logged out successfully' },
      meta: null,
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.accessToken).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(getAuthToken()).toBeNull();
  });

  it('restores session automatically on mount if refresh succeeds', async () => {
    vi.mocked(authApi.refresh).mockResolvedValueOnce({
      success: true,
      data: {
        access_token: 'restored-token-456',
        token_type: 'Bearer',
        expires_in: 900,
        user: {
          id: 'restored-uuid',
          email: 'restored@devflow.local',
          name: 'Restored User',
          avatar_url: null,
          created_at: new Date().toISOString(),
        },
      },
      meta: null,
    });

    const autoWrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider skipInitialRefresh={false}>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper: autoWrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user?.email).toBe('restored@devflow.local');
      expect(result.current.accessToken).toBe('restored-token-456');
    });
  });
});
