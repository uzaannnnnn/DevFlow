import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectListView } from '../components/ProjectListView';
import { WorkspaceProvider } from '../../workspace/WorkspaceContext';
import { projectApi } from '../api';
import { Project } from '../types';
import { Workspace } from '../../workspace/types';
import { renderWithQueryClient } from '../../../test/test-utils';

vi.mock('../../auth/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'user-1', email: 'alice@devflow.local' },
    isAuthenticated: true,
  })),
}));

vi.mock('../api', () => ({
  projectApi: {
    listProjects: vi.fn(),
    createProject: vi.fn(),
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

const mockProjects: Project[] = [
  {
    id: 'proj-1',
    workspace_id: 'ws-100',
    name: 'Frontend Engine',
    key: 'FE',
    description: 'React SPA client',
    task_counter: 12,
    created_by: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    role: 'owner',
  },
  {
    id: 'proj-2',
    workspace_id: 'ws-100',
    name: 'Backend API',
    key: 'BE',
    description: 'Go REST service',
    task_counter: 45,
    created_by: 'user-2',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    role: 'member',
  },
];

describe('ProjectListView Component', () => {
  const mockOnSelectProject = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(projectApi.listProjects).mockResolvedValue({
      success: true,
      data: { projects: mockProjects, total: 2 },
      meta: null,
    });
  });

  const renderComponent = () => {
    return renderWithQueryClient(
      <WorkspaceProvider skipAutoFetch={true} initialWorkspaces={[mockWorkspace]}>
        <ProjectListView onSelectProject={mockOnSelectProject} />
      </WorkspaceProvider>
    );
  };

  it('renders projects with keys, task count, and role badges', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Frontend Engine')).toBeInTheDocument();
      expect(screen.getByText('FE')).toBeInTheDocument();
      expect(screen.getByText('Backend API')).toBeInTheDocument();
      expect(screen.getByText('BE')).toBeInTheDocument();
    });

    expect(screen.getByText('React SPA client')).toBeInTheDocument();
    expect(screen.getByText('Go REST service')).toBeInTheDocument();
  });

  it('calls onSelectProject when clicking a project card', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Frontend Engine')).toBeInTheDocument();
    });

    const card = screen.getByTestId('project-card-FE');
    fireEvent.click(card);

    expect(mockOnSelectProject).toHaveBeenCalledWith('proj-1');
  });

  it('filters projects when typing into search input', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Frontend Engine')).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId('project-search-input');
    fireEvent.change(searchInput, { target: { value: 'Frontend' } });

    await waitFor(() => {
      expect(projectApi.listProjects).toHaveBeenCalledWith('ws-100', 'Frontend');
    });
  });

  it('shows empty state when no projects exist', async () => {
    vi.mocked(projectApi.listProjects).mockResolvedValue({
      success: true,
      data: { projects: [], total: 0 },
      meta: null,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/No projects yet/i)).toBeInTheDocument();
      expect(screen.getByTestId('empty-create-project-button')).toBeInTheDocument();
    });
  });
});
