import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectMembersView } from '../components/ProjectMembersView';
import { WorkspaceProvider } from '../../workspace/WorkspaceContext';
import { projectApi } from '../api';
import { workspaceApi } from '../../workspace/api';
import { Project, ProjectMember } from '../types';
import { Workspace, WorkspaceMember } from '../../workspace/types';
import { renderWithQueryClient } from '../../../test/test-utils';

vi.mock('../../auth/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'user-owner', email: 'owner@devflow.local', name: 'Alice Owner' },
    isAuthenticated: true,
  })),
}));

vi.mock('../api', () => ({
  projectApi: {
    listMembers: vi.fn(),
    addMember: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
  },
}));

vi.mock('../../workspace/api', () => ({
  workspaceApi: {
    listMembers: vi.fn(),
  },
}));

const mockWorkspace: Workspace = {
  id: 'ws-100',
  name: 'Acme Corp',
  slug: 'acme-corp',
  owner_id: 'user-owner',
  role: 'owner',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockProject: Project = {
  id: 'proj-1',
  workspace_id: 'ws-100',
  name: 'Core Engine',
  key: 'CORE',
  task_counter: 0,
  created_by: 'user-owner',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  role: 'owner',
};

const mockMembers: ProjectMember[] = [
  {
    id: 'pm-1',
    project_id: 'proj-1',
    user_id: 'user-owner',
    role: 'owner',
    email: 'owner@devflow.local',
    name: 'Alice Owner',
    joined_at: new Date().toISOString(),
  },
  {
    id: 'pm-2',
    project_id: 'proj-1',
    user_id: 'user-member-1',
    role: 'member',
    email: 'bob@devflow.local',
    name: 'Bob Member',
    joined_at: new Date().toISOString(),
  },
];

const mockWorkspaceMembers: WorkspaceMember[] = [
  {
    id: 'wm-1',
    workspace_id: 'ws-100',
    user_id: 'user-owner',
    role: 'owner',
    email: 'owner@devflow.local',
    name: 'Alice Owner',
    created_at: new Date().toISOString(),
  },
  {
    id: 'wm-2',
    workspace_id: 'ws-100',
    user_id: 'user-member-1',
    role: 'member',
    email: 'bob@devflow.local',
    name: 'Bob Member',
    created_at: new Date().toISOString(),
  },
  {
    id: 'wm-3',
    workspace_id: 'ws-100',
    user_id: 'user-candidate-2',
    role: 'member',
    email: 'carol@devflow.local',
    name: 'Carol Candidate',
    created_at: new Date().toISOString(),
  },
];

describe('ProjectMembersView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(projectApi.listMembers).mockResolvedValue({
      success: true,
      data: { members: mockMembers },
      meta: null,
    });
    vi.mocked(workspaceApi.listMembers).mockResolvedValue({
      success: true,
      data: { members: mockWorkspaceMembers },
      meta: null,
    });
  });

  const renderComponent = () => {
    return renderWithQueryClient(
      <WorkspaceProvider skipAutoFetch={true} initialWorkspaces={[mockWorkspace]}>
        <ProjectMembersView project={mockProject} />
      </WorkspaceProvider>
    );
  };

  it('renders project members with roles and joined dates', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Alice Owner')).toBeInTheDocument();
      expect(screen.getByText('Bob Member')).toBeInTheDocument();
      expect(screen.getByText('owner@devflow.local')).toBeInTheDocument();
      expect(screen.getByText('bob@devflow.local')).toBeInTheDocument();
    });
  });

  it('allows owner to change a member role to admin', async () => {
    vi.mocked(projectApi.updateMemberRole).mockResolvedValue({
      success: true,
      data: { member: { ...mockMembers[1], role: 'admin' } },
      meta: null,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Bob Member')).toBeInTheDocument();
    });

    const roleSelect = screen.getByLabelText(/Change role for Bob Member/i);
    fireEvent.change(roleSelect, { target: { value: 'admin' } });

    await waitFor(() => {
      expect(projectApi.updateMemberRole).toHaveBeenCalledWith(
        'proj-1',
        'user-member-1',
        { role: 'admin' }
      );
    });
  });

  it('opens confirmation modal and removes member', async () => {
    vi.mocked(projectApi.removeMember).mockResolvedValue({
      success: true,
      data: { message: 'member removed' },
      meta: null,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Bob Member')).toBeInTheDocument();
    });

    const removeBtn = screen.getByTitle('Remove Member');
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to remove/i)).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole('button', { name: /Confirm Remove/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(projectApi.removeMember).toHaveBeenCalledWith('proj-1', 'user-member-1');
    });
  });
});
