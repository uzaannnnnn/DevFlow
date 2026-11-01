import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HomePage } from '../HomePage';
import { WorkspaceProvider } from '../../features/workspace/WorkspaceContext';
import { renderWithQueryClient } from '../../test/test-utils';
import { projectApi } from '../../features/projects/api';
import { apiClient } from '../../shared/lib/api-client';
import { Workspace } from '../../features/workspace/types';
import { Project } from '../../features/projects/types';

vi.mock('../../features/auth/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'user-1', email: 'alice@devflow.local', name: 'Alice' },
    isAuthenticated: true,
    logout: vi.fn(),
  })),
}));

vi.mock('../../shared/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    constructor(public status: number, public data: unknown) {
      super('API Error');
    }
  },
}));

vi.mock('../../features/projects/api', () => ({
  projectApi: {
    listProjects: vi.fn(),
    getProject: vi.fn(),
    listMembers: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    archiveProject: vi.fn(),
  },
}));

const mockWorkspaces: Workspace[] = [
  {
    id: 'ws-1',
    name: 'Workspace Alpha',
    slug: 'ws-alpha',
    owner_id: 'user-1',
    role: 'owner',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'ws-2',
    name: 'Workspace Beta',
    slug: 'ws-beta',
    owner_id: 'user-1',
    role: 'admin',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const mockProjectAlpha: Project = {
  id: 'proj-alpha-1',
  workspace_id: 'ws-1',
  name: 'Alpha Project One',
  key: 'ALP',
  description: 'First project in Alpha',
  task_counter: 5,
  created_by: 'user-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  role: 'owner',
};

const mockProjectBeta: Project = {
  id: 'proj-beta-1',
  workspace_id: 'ws-2',
  name: 'Beta Project One',
  key: 'BET',
  description: 'First project in Beta',
  task_counter: 2,
  created_by: 'user-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  role: 'admin',
};

describe('HomePage Component & Workspace Switching Invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
      if (path === 'health' || path === '/health') {
        return {
          success: true,
          data: { status: 'healthy', service: 'devflow-api', version: '0.1.0', environment: 'test' },
          meta: null,
        } as any;
      }
      if (path === 'health/ready' || path === '/health/ready') {
        return {
          success: true,
          data: { status: 'ready', database: 'connected', service: 'devflow-api', version: '0.1.0', environment: 'test' },
          meta: null,
        } as any;
      }
      return { success: true, data: {}, meta: null } as any;
    });

    vi.mocked(projectApi.listProjects).mockImplementation(async (workspaceId: string) => {
      if (workspaceId === 'ws-1') {
        return { success: true, data: { projects: [mockProjectAlpha], total: 1 }, meta: null };
      }
      if (workspaceId === 'ws-2') {
        return { success: true, data: { projects: [mockProjectBeta], total: 1 }, meta: null };
      }
      return { success: true, data: { projects: [], total: 0 }, meta: null };
    });

    vi.mocked(projectApi.getProject).mockImplementation(async (projectId: string) => {
      if (projectId === 'proj-alpha-1') {
        return { success: true, data: { project: mockProjectAlpha }, meta: null };
      }
      if (projectId === 'proj-beta-1') {
        return { success: true, data: { project: mockProjectBeta }, meta: null };
      }
      throw new Error('Not found');
    });

    vi.mocked(projectApi.listMembers).mockResolvedValue({
      success: true,
      data: { members: [] },
      meta: null,
    });
  });

  const renderHomePage = () => {
    return renderWithQueryClient(
      <WorkspaceProvider skipAutoFetch={true} initialWorkspaces={mockWorkspaces}>
        <HomePage />
      </WorkspaceProvider>
    );
  };

  it('resets selectedProjectId when switching active workspace to prevent stale cross-workspace project detail', async () => {
    renderHomePage();

    // 1. Navigate to Projects tab
    const projectsTabBtn = screen.getByRole('button', { name: /Projects/i });
    fireEvent.click(projectsTabBtn);

    // 2. In Workspace Alpha, Alpha Project One should be listed
    await waitFor(() => {
      expect(screen.getByText('Alpha Project One')).toBeInTheDocument();
      expect(screen.getByText('ALP')).toBeInTheDocument();
    });

    // 3. Click on the project card to view ProjectDetailView
    const projectCard = screen.getByTestId('project-card-ALP');
    fireEvent.click(projectCard);

    // 4. Verify ProjectDetailView is mounted for Alpha Project
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Alpha Project One' })).toBeInTheDocument();
      expect(screen.getByText('ALP-6')).toBeInTheDocument(); // task counter 5 + 1
    });

    // 5. Switch workspace from Alpha to Beta via WorkspaceSwitcher
    const switcherTrigger = screen.getByTestId('workspace-switcher-trigger');
    fireEvent.click(switcherTrigger);

    const betaOption = screen.getByRole('menuitem', { name: /Workspace Beta/i });
    fireEvent.click(betaOption);

    // 6. Verify regression fix: selectedProjectId is reset to null!
    // Instead of showing the stale Alpha project detail in Workspace Beta,
    // the UI must return to the ProjectListView of Workspace Beta!
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Alpha Project One' })).not.toBeInTheDocument();
      expect(screen.getByText('Beta Project One')).toBeInTheDocument();
      expect(screen.getByText('BET')).toBeInTheDocument();
    });
  });
});
