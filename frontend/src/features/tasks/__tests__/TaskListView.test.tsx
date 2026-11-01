import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskListView } from '../components/TaskListView';
import { taskApi } from '../api';
import { projectApi } from '../../projects/api';
import { Task } from '../types';
import { Project } from '../../projects/types';
import { renderWithQueryClient } from '../../../test/test-utils';

vi.mock('../api', () => ({
  taskApi: {
    listTasks: vi.fn(),
    getTask: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
  },
}));

vi.mock('../../projects/api', () => ({
  projectApi: {
    listMembers: vi.fn(),
  },
}));

const mockProject: Project = {
  id: 'proj-1',
  workspace_id: 'ws-1',
  name: 'Core Platform',
  key: 'CORE',
  description: 'Main project',
  task_counter: 2,
  created_by: 'user-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  role: 'owner',
};

const mockTasks: Task[] = [
  {
    id: 'task-1',
    project_id: 'proj-1',
    identifier: 'CORE-001',
    title: 'Setup PostgreSQL migrations',
    description: 'Configure golang-migrate in Docker',
    status: 'todo',
    priority: 'high',
    assignee_id: 'user-2',
    assignee: { id: 'user-2', email: 'bob@devflow.local', name: 'Bob Engineer' },
    created_by: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'task-2',
    project_id: 'proj-1',
    identifier: 'CORE-002',
    title: 'Implement Task API endpoints',
    description: 'CRUD and concurrency locks',
    status: 'in_progress',
    priority: 'urgent',
    assignee_id: null,
    assignee: null,
    created_by: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

describe('TaskListView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(taskApi.listTasks).mockResolvedValue({
      success: true,
      data: { tasks: mockTasks, total: 2 },
      meta: null,
    });
    vi.mocked(projectApi.listMembers).mockResolvedValue({
      success: true,
      data: {
        members: [
          {
            id: 'pm-1',
            project_id: 'proj-1',
            user_id: 'user-2',
            role: 'member',
            email: 'bob@devflow.local',
            name: 'Bob Engineer',
            joined_at: new Date().toISOString(),
          },
        ],
      },
      meta: null,
    });
  });

  it('renders task list with identifiers, titles, status badges, and assignees', async () => {
    renderWithQueryClient(<TaskListView project={mockProject} />);

    await waitFor(() => {
      expect(screen.getByText('CORE-001')).toBeInTheDocument();
      expect(screen.getByText('Setup PostgreSQL migrations')).toBeInTheDocument();
      expect(screen.getByText('CORE-002')).toBeInTheDocument();
      expect(screen.getByText('Implement Task API endpoints')).toBeInTheDocument();
      expect(screen.getAllByText('Bob Engineer').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Unassigned')).toBeInTheDocument();
    });

    expect(screen.getByText(/Showing/i)).toBeInTheDocument();
    expect(screen.getByText('Project Key: CORE')).toBeInTheDocument();
  });

  it('filters task list when typing in search input', async () => {
    renderWithQueryClient(<TaskListView project={mockProject} />);

    await waitFor(() => {
      expect(screen.getByText('CORE-001')).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId('search-tasks-input');
    fireEvent.change(searchInput, { target: { value: 'PostgreSQL' } });

    await waitFor(() => {
      expect(taskApi.listTasks).toHaveBeenCalledWith('proj-1', expect.objectContaining({
        search: 'PostgreSQL',
      }));
    });
  });

  it('opens CreateTaskModal when clicking New Task button and creates task', async () => {
    vi.mocked(taskApi.createTask).mockResolvedValue({
      success: true,
      data: {
        task: {
          id: 'task-3',
          project_id: 'proj-1',
          identifier: 'CORE-003',
          title: 'Add Redis cache layer',
          description: null,
          status: 'todo',
          priority: 'medium',
          assignee_id: null,
          created_by: 'user-1',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
      meta: null,
    });

    renderWithQueryClient(<TaskListView project={mockProject} />);

    const newBtn = screen.getByTestId('open-create-task-modal-button');
    fireEvent.click(newBtn);

    expect(screen.getByRole('dialog', { name: /Create New Task/i })).toBeInTheDocument();

    const titleInput = screen.getByTestId('task-title-input');
    fireEvent.change(titleInput, { target: { value: 'Add Redis cache layer' } });

    const submitBtn = screen.getByTestId('submit-create-task-button');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(taskApi.createTask).toHaveBeenCalledWith('proj-1', expect.objectContaining({
        title: 'Add Redis cache layer',
        status: 'todo',
        priority: 'medium',
      }));
    });
  });

  it('shows empty state when project has no tasks', async () => {
    vi.mocked(taskApi.listTasks).mockResolvedValue({
      success: true,
      data: { tasks: [], total: 0 },
      meta: null,
    });

    renderWithQueryClient(<TaskListView project={mockProject} />);

    await waitFor(() => {
      expect(screen.getByText(/No tasks created yet/i)).toBeInTheDocument();
      expect(screen.getByTestId('empty-create-task-button')).toBeInTheDocument();
    });
  });
});
