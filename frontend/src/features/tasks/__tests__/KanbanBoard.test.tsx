import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KanbanBoard } from '../components/KanbanBoard';
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
  task_counter: 4,
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
    status: 'todo',
    priority: 'high',
    assignee_id: 'user-2',
    assignee: { id: 'user-2', email: 'bob@devflow.local', name: 'Bob' },
    created_by: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'task-2',
    project_id: 'proj-1',
    identifier: 'CORE-002',
    title: 'Implement Task API endpoints',
    status: 'in_progress',
    priority: 'urgent',
    assignee_id: 'user-1',
    created_by: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'task-3',
    project_id: 'proj-1',
    identifier: 'CORE-003',
    title: 'Code review for RBAC',
    status: 'review',
    priority: 'medium',
    created_by: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'task-4',
    project_id: 'proj-1',
    identifier: 'CORE-004',
    title: 'Deploy to staging',
    status: 'done',
    priority: 'low',
    created_by: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

describe('KanbanBoard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(taskApi.listTasks).mockResolvedValue({
      success: true,
      data: { tasks: mockTasks, total: 4 },
      meta: null,
    });
    vi.mocked(projectApi.listMembers).mockResolvedValue({
      success: true,
      data: {
        members: [
          {
            id: 'pm-1',
            project_id: 'proj-1',
            user_id: 'user-1',
            email: 'alice@devflow.local',
            name: 'Alice',
            role: 'owner',
            joined_at: new Date().toISOString(),
          },
        ],
      },
      meta: null,
    });
  });

  it('renders all 4 Kanban columns with task counts', async () => {
    renderWithQueryClient(<KanbanBoard project={mockProject} />);

    await waitFor(() => {
      expect(screen.getByTestId('kanban-column-todo')).toBeInTheDocument();
      expect(screen.getByTestId('kanban-column-in_progress')).toBeInTheDocument();
      expect(screen.getByTestId('kanban-column-review')).toBeInTheDocument();
      expect(screen.getByTestId('kanban-column-done')).toBeInTheDocument();
    });

    expect(screen.getByTestId('column-count-todo')).toHaveTextContent('1');
    expect(screen.getByTestId('column-count-in_progress')).toHaveTextContent('1');
    expect(screen.getByTestId('column-count-review')).toHaveTextContent('1');
    expect(screen.getByTestId('column-count-done')).toHaveTextContent('1');
  });

  it('renders task cards in their corresponding columns', async () => {
    renderWithQueryClient(<KanbanBoard project={mockProject} />);

    await waitFor(() => {
      expect(screen.getByText('Setup PostgreSQL migrations')).toBeInTheDocument();
      expect(screen.getByText('Implement Task API endpoints')).toBeInTheDocument();
      expect(screen.getByText('Code review for RBAC')).toBeInTheDocument();
      expect(screen.getByText('Deploy to staging')).toBeInTheDocument();
    });

    expect(screen.getByText('CORE-001')).toBeInTheDocument();
    expect(screen.getByText('CORE-002')).toBeInTheDocument();
  });

  it('opens detail modal when clicking on a card', async () => {
    vi.mocked(taskApi.getTask).mockResolvedValue({
      success: true,
      data: { task: mockTasks[0] },
      meta: null,
    });

    renderWithQueryClient(<KanbanBoard project={mockProject} />);

    await waitFor(() => {
      expect(screen.getByTestId('kanban-card-task-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Setup PostgreSQL migrations'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('detail-task-title')).toHaveTextContent('Setup PostgreSQL migrations');
    });
  });

  it('opens create modal with initialStatus when clicking plus on column', async () => {
    renderWithQueryClient(<KanbanBoard project={mockProject} />);

    await waitFor(() => {
      expect(screen.getByTestId('add-task-to-in_progress-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('add-task-to-in_progress-button'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Create New Task')).toBeInTheDocument();
    });
  });
});
