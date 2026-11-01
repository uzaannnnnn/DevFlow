import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceProvider, useWorkspace } from '../WorkspaceContext';
import { workspaceApi } from '../api';
import type { Workspace } from '../types';
import type { ReactNode } from 'react';

vi.mock('../api', () => ({
  workspaceApi: {
    listWorkspaces: vi.fn(),
    createWorkspace: vi.fn(),
    updateWorkspace: vi.fn(),
    deleteWorkspace: vi.fn(),
    getWorkspace: vi.fn(),
    listMembers: vi.fn(),
    addMember: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
  },
}));

vi.mock('../../auth/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'user-1', email: 'owner@devflow.local', name: 'Owner User' },
    isAuthenticated: true,
  })),
}));

const mockWorkspaces: Workspace[] = [
  {
    id: 'ws-1',
    name: 'Workspace Alpha',
    slug: 'workspace-alpha',
    description: 'First test workspace',
    owner_id: 'user-1',
    role: 'owner',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'ws-2',
    name: 'Workspace Beta',
    slug: 'workspace-beta',
    description: 'Second test workspace',
    owner_id: 'user-2',
    role: 'member',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

describe('WorkspaceContext and useWorkspace Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <WorkspaceProvider skipAutoFetch={true} initialWorkspaces={mockWorkspaces}>
      {children}
    </WorkspaceProvider>
  );

  it('initializes with active workspace and active role', () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    expect(result.current.workspaces).toHaveLength(2);
    expect(result.current.activeWorkspace?.id).toBe('ws-1');
    expect(result.current.activeRole).toBe('owner');
  });

  it('switches active workspace and updates active role', () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    act(() => {
      result.current.switchWorkspace('ws-2');
    });

    expect(result.current.activeWorkspace?.id).toBe('ws-2');
    expect(result.current.activeRole).toBe('member');
  });

  it('creates a new workspace and sets it as active', async () => {
    const newWs: Workspace = {
      id: 'ws-3',
      name: 'Workspace Gamma',
      slug: 'workspace-gamma',
      owner_id: 'user-1',
      role: 'owner',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    vi.mocked(workspaceApi.createWorkspace).mockResolvedValueOnce({
      success: true,
      data: { workspace: newWs },
      meta: null,
    });

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await result.current.createWorkspace({ name: 'Workspace Gamma' });
    });

    expect(result.current.workspaces).toHaveLength(3);
    expect(result.current.activeWorkspace?.id).toBe('ws-3');
    expect(result.current.activeRole).toBe('owner');
  });

  it('updates the active workspace name and description', async () => {
    const updatedWs: Workspace = {
      ...mockWorkspaces[0],
      name: 'Workspace Alpha Renamed',
      description: 'Updated Description',
    };

    vi.mocked(workspaceApi.updateWorkspace).mockResolvedValueOnce({
      success: true,
      data: { workspace: updatedWs },
      meta: null,
    });

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await result.current.updateWorkspace({ name: 'Workspace Alpha Renamed' });
    });

    expect(result.current.activeWorkspace?.name).toBe('Workspace Alpha Renamed');
    expect(result.current.activeWorkspace?.description).toBe('Updated Description');
  });

  it('deletes active workspace and selects the next available workspace', async () => {
    vi.mocked(workspaceApi.deleteWorkspace).mockResolvedValueOnce({
      success: true,
      data: { message: 'Workspace deleted' },
      meta: null,
    });

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    expect(result.current.activeWorkspace?.id).toBe('ws-1');

    await act(async () => {
      await result.current.deleteWorkspace();
    });

    expect(result.current.workspaces).toHaveLength(1);
    expect(result.current.activeWorkspace?.id).toBe('ws-2');
    expect(result.current.activeRole).toBe('member');
  });
});
