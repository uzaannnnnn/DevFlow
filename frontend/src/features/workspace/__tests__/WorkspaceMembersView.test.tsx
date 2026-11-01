import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceMembersView } from '../components/WorkspaceMembersView';
import { WorkspaceProvider } from '../WorkspaceContext';
import { workspaceApi } from '../api';
import type { Workspace, WorkspaceMember } from '../types';

vi.mock('../../auth/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'user-owner', email: 'owner@devflow.local', name: 'Alice Owner' },
    isAuthenticated: true,
  })),
}));

vi.mock('../api', () => ({
  workspaceApi: {
    listWorkspaces: vi.fn(),
    createWorkspace: vi.fn(),
    listMembers: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
    addMember: vi.fn(),
  },
}));

const mockWorkspace: Workspace = {
  id: 'ws-test',
  name: 'DevFlow Core',
  slug: 'devflow-core',
  owner_id: 'user-owner',
  role: 'owner',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockMembers: WorkspaceMember[] = [
  {
    id: 'mem-1',
    workspace_id: 'ws-test',
    user_id: 'user-owner',
    role: 'owner',
    email: 'owner@devflow.local',
    name: 'Alice Owner',
    created_at: new Date().toISOString(),
  },
  {
    id: 'mem-2',
    workspace_id: 'ws-test',
    user_id: 'user-admin',
    role: 'admin',
    email: 'bob.admin@devflow.local',
    name: 'Bob Admin',
    created_at: new Date().toISOString(),
  },
  {
    id: 'mem-3',
    workspace_id: 'ws-test',
    user_id: 'user-member',
    role: 'member',
    email: 'carol.member@devflow.local',
    name: 'Carol Member',
    created_at: new Date().toISOString(),
  },
];

describe('WorkspaceMembersView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(workspaceApi.listMembers).mockResolvedValue({
      success: true,
      data: { members: mockMembers },
      meta: null,
    });
  });

  const renderComponent = () => {
    return render(
      <WorkspaceProvider skipAutoFetch={true} initialWorkspaces={[mockWorkspace]}>
        <WorkspaceMembersView />
      </WorkspaceProvider>
    );
  };

  it('renders members list with users, roles, and action buttons', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Alice Owner')).toBeInTheDocument();
      expect(screen.getByText('bob.admin@devflow.local')).toBeInTheDocument();
      expect(screen.getByText('carol.member@devflow.local')).toBeInTheDocument();
    });

    // Owner cannot delete self (no delete button for self)
    expect(screen.queryByTestId('remove-member-owner@devflow.local')).not.toBeInTheDocument();

    // Owner can remove other members
    expect(screen.getByTestId('remove-member-bob.admin@devflow.local')).toBeInTheDocument();
    expect(screen.getByTestId('remove-member-carol.member@devflow.local')).toBeInTheDocument();
  });

  it('shows ownership transfer confirmation modal when selecting Owner for an Admin', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('role-select-bob.admin@devflow.local')).toBeInTheDocument();
    });

    const select = screen.getByTestId('role-select-bob.admin@devflow.local');
    fireEvent.change(select, { target: { value: 'owner' } });

    await waitFor(() => {
      expect(screen.getByText('Transfer Workspace Ownership')).toBeInTheDocument();
      expect(screen.getByText(/Per approved architecture \(Decision 3\)/)).toBeInTheDocument();
    });
  });

  it('opens confirmation modal and removes member when clicking remove', async () => {
    vi.mocked(workspaceApi.removeMember).mockResolvedValueOnce({
      success: true,
      data: { message: 'Member removed' },
      meta: null,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('remove-member-carol.member@devflow.local')).toBeInTheDocument();
    });

    const removeBtn = screen.getByTestId('remove-member-carol.member@devflow.local');
    fireEvent.click(removeBtn);

    expect(screen.getByRole('heading', { name: 'Remove Member' })).toBeInTheDocument();
    expect(screen.getByText(/tasks assigned to them will be unassigned automatically/)).toBeInTheDocument();

    const confirmBtn = screen.getByTestId('confirm-remove-button');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(workspaceApi.removeMember).toHaveBeenCalledWith('ws-test', 'user-member');
    });
  });
});
