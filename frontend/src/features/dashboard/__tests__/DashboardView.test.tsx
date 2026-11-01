import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardView } from '../DashboardView';
import { WorkspaceProvider } from '../../workspace/WorkspaceContext';
import { projectApi } from '../../projects/api';
import { taskApi } from '../../tasks/api';
import { renderWithQueryClient } from '../../../test/test-utils';
import { Workspace } from '../../workspace/types';
import { Project } from '../../projects/types';
import { Task } from '../../tasks/types';

vi.mock('../../auth/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'user-1', email: 'alice@devflow.local', name: 'Alice' },
    isAuthenticated: true,
  })),
}));

vi.mock('../../projects/api', () => ({
  projectApi: {
    listProjects: vi.fn(),
    getProject: vi.fn(),
    listMembers: vi.fn(() => Promise.resolve({ success: true, data: { members: [] }, meta: null })),
  },
}));

vi.mock('../../tasks/api', () => ({
  taskApi: {
    listTasks: vi.fn(),
    getTask: vi.fn(),
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

const mockProjects: Project[] = [
  {
    id: 'proj-1',
    workspace_id: 'ws-100',
    name: 'Core Engine',
    key: 'CORE',
    description: 'Foundational backend',
    task_counter: 3,
    created_by: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    role: 'owner',
  },
  {
    id: 'proj-2',
    workspace_id: 'ws-100',
    name: 'Web Client',
    key: 'WEB',
    description: 'Frontend React app',
    task_counter: 1,
    created_by: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    role: 'admin',
  },
];

const mockTasks: Task[] = [
  {
    id: 'task-1',
    project_id: 'proj-1',
    identifier: 'CORE-1',
    title: 'Setup Database',
    description: 'Postgres migrations',
    status: 'done',
    priority: 'high',
    created_by: 'user-1',
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T12:00:00Z',
  },
  {
    id: 'task-2',
    project_id: 'proj-1',
    identifier: 'CORE-2',
    title: 'Implement Auth',
    description: 'JWT session tokens',
    status: 'in_progress',
    priority: 'urgent',
    created_by: 'user-1',
    created_at: '2026-03-01T11:00:00Z',
    updated_at: '2026-03-01T13:00:00Z',
  },
  {
    id: 'task-3',
    project_id: 'proj-2',
    identifier: 'WEB-1',
    title: 'Build Login UI',
    description: 'React form with zod',
    status: 'todo',
    priority: 'medium',
    created_by: 'user-1',
    created_at: '2026-03-01T12:00:00Z',
    updated_at: '2026-03-01T12:30:00Z',
  },
];

describe('DashboardView Component', () => {
  const mockOnNavigateToProjects = vi.fn();
  const mockOnSelectProject = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return renderWithQueryClient(
      <WorkspaceProvider skipAutoFetch={true} initialWorkspaces={[mockWorkspace]}>
        <DashboardView
          onNavigateToProjects={mockOnNavigateToProjects}
          onSelectProject={mockOnSelectProject}
        />
      </WorkspaceProvider>
    );
  };

  it('renders loading state when projects are loading', () => {
    vi.mocked(projectApi.listProjects).mockReturnValue(new Promise(() => {}));
    renderComponent();

    expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument();
  });

  it('renders metric cards and status breakdown with accurate counts', async () => {
    vi.mocked(projectApi.listProjects).mockResolvedValue({
      success: true,
      data: { projects: mockProjects, total: 2 },
      meta: null,
    });

    vi.mocked(taskApi.listTasks).mockImplementation(async (projectId: string) => {
      if (projectId === 'proj-1') {
        return {
          success: true,
          data: { tasks: [mockTasks[0], mockTasks[1]], total: 2 },
          meta: null,
        };
      }
      return {
        success: true,
        data: { tasks: [mockTasks[2]], total: 1 },
        meta: null,
      };
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
    });

    // Check Metrics
    expect(screen.getByTestId('metric-total-projects')).toHaveTextContent('2');
    expect(screen.getByTestId('metric-total-tasks')).toHaveTextContent('3');
    expect(screen.getByTestId('metric-in-progress')).toHaveTextContent('1');
    expect(screen.getByTestId('metric-done')).toHaveTextContent('1');

    // Check Status breakdown labels
    expect(screen.getAllByText('To Do')[0]).toBeInTheDocument();
    expect(screen.getByText('In Review')).toBeInTheDocument();

    // Check Recent tasks
    expect(screen.getByText('CORE-2')).toBeInTheDocument();
    expect(screen.getByText('Implement Auth')).toBeInTheDocument();
    expect(screen.getByText('WEB-1')).toBeInTheDocument();

    // Check Projects listed
    expect(screen.getAllByText('Core Engine')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Web Client')[0]).toBeInTheDocument();
  });

  it('navigates to projects when clicking View All Projects button', async () => {
    vi.mocked(projectApi.listProjects).mockResolvedValue({
      success: true,
      data: { projects: mockProjects, total: 2 },
      meta: null,
    });
    vi.mocked(taskApi.listTasks).mockResolvedValue({
      success: true,
      data: { tasks: [], total: 0 },
      meta: null,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-view-projects-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('dashboard-view-projects-btn'));
    expect(mockOnNavigateToProjects).toHaveBeenCalledTimes(1);
  });

  it('calls onSelectProject when clicking a project item', async () => {
    vi.mocked(projectApi.listProjects).mockResolvedValue({
      success: true,
      data: { projects: mockProjects, total: 2 },
      meta: null,
    });
    vi.mocked(taskApi.listTasks).mockResolvedValue({
      success: true,
      data: { tasks: [], total: 0 },
      meta: null,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-project-item-CORE')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('dashboard-project-item-CORE'));
    expect(mockOnSelectProject).toHaveBeenCalledWith('proj-1');
  });

  it('renders empty states when there are no projects', async () => {
    vi.mocked(projectApi.listProjects).mockResolvedValue({
      success: true,
      data: { projects: [], total: 0 },
      meta: null,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('No projects yet')).toBeInTheDocument();
      expect(screen.getByText('No tasks in this workspace')).toBeInTheDocument();
    });
  });
});
