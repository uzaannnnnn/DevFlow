import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectDetailView } from '../components/ProjectDetailView';
import { WorkspaceProvider } from '../../workspace/WorkspaceContext';
import { projectApi } from '../api';
import { Project } from '../types';
import { Workspace } from '../../workspace/types';
import { ApiClientError } from '../../../shared/lib/api-client';
import { renderWithQueryClient } from '../../../test/test-utils';

vi.mock('../../auth/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'user-1', email: 'alice@devflow.local' },
    isAuthenticated: true,
  })),
}));

vi.mock('../api', () => ({
  projectApi: {
    getProject: vi.fn(),
    listMembers: vi.fn(),
    updateProject: vi.fn(),
    archiveProject: vi.fn(),
  },
}));

vi.mock('../../tasks/api', () => ({
  taskApi: {
    listTasks: vi.fn(() => Promise.resolve({ success: true, data: { tasks: [], total: 0 }, meta: null })),
    getTask: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
  },
}));

const mockWorkspace: Workspace = {
  id: 'ws-100',
  name: 'Acme Corp',
  slug: 'acme-corp',
  owner_id: 'user-1',
  role: 'owner',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockProject: Project = {
  id: 'proj-1',
  workspace_id: 'ws-100',
  name: 'Core Engine',
  key: 'CORE',
  description: 'Foundational backend service',
  task_counter: 7,
  created_by: 'user-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  role: 'owner',
};

describe('ProjectDetailView Component', () => {
  const mockOnBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(projectApi.getProject).mockResolvedValue({
      success: true,
      data: { project: mockProject },
      meta: null,
    });
    vi.mocked(projectApi.listMembers).mockResolvedValue({
      success: true,
      data: { members: [] },
      meta: null,
    });
  });

  const renderComponent = (projectId = 'proj-1') => {
    return renderWithQueryClient(
      <WorkspaceProvider skipAutoFetch={true} initialWorkspaces={[mockWorkspace]}>
        <ProjectDetailView projectId={projectId} onBack={mockOnBack} />
      </WorkspaceProvider>
    );
  };

  it('renders project header, key badge, and default tasks tab with next task counter', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Core Engine')).toBeInTheDocument();
      expect(screen.getByText('CORE')).toBeInTheDocument();
      expect(screen.getByText('Foundational backend service')).toBeInTheDocument();
    });

    // Default Tasks Tab renders TaskListView with New Task button
    expect(screen.getByTestId('open-create-task-modal-button')).toBeInTheDocument();
    expect(screen.getByTestId('search-tasks-input')).toBeInTheDocument();
  });

  it('allows navigating to Settings tab and verifies Decision 6 key immutability', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Core Engine')).toBeInTheDocument();
    });

    const settingsTab = screen.getByTestId('project-tab-settings');
    fireEvent.click(settingsTab);

    await waitFor(() => {
      expect(screen.getByText(/Immutable \(Decision 6\)/i)).toBeInTheDocument();
    });

    // Key input must be readOnly
    const keyInput = screen.getByDisplayValue('CORE');
    expect(keyInput).toHaveAttribute('readOnly');
    expect(keyInput).toBeDisabled();
  });

  it('renders 404 access withholding error message when project cannot be accessed', async () => {
    vi.mocked(projectApi.getProject).mockRejectedValue(
      new ApiClientError(404, {
        code: 'NOT_FOUND',
        message: 'project not found or membership withheld',
        details: [],
      })
    );

    renderComponent('unknown-id');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Project not found or you do not have permission/i);
    });
  });
});
