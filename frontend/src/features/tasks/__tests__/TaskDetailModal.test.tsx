import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskDetailModal } from '../components/TaskDetailModal';
import { taskApi } from '../api';
import { projectApi } from '../../projects/api';
import { Task } from '../types';
import { renderWithQueryClient } from '../../../test/test-utils';

vi.mock('../api', () => ({
  taskApi: {
    getTask: vi.fn(),
    updateTask: vi.fn(),
  },
}));

vi.mock('../../projects/api', () => ({
  projectApi: {
    listMembers: vi.fn(),
  },
}));

const mockTask: Task = {
  id: 'task-100',
  project_id: 'proj-1',
  identifier: 'CORE-042',
  title: 'Implement database connection pooling',
  description: 'Use pgxpool with max 25 connections',
  status: 'todo',
  priority: 'high',
  assignee_id: 'user-2',
  due_date: '2026-12-31T00:00:00.000Z',
  created_by: 'user-1',
  assignee: { id: 'user-2', email: 'alice@devflow.local', name: 'Alice Engineer' },
  creator: { id: 'user-1', email: 'owner@devflow.local', name: 'Project Owner' },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('TaskDetailModal Component', () => {
  const mockOnClose = vi.fn();
  const mockOnEdit = vi.fn();
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(taskApi.getTask).mockResolvedValue({
      success: true,
      data: { task: mockTask },
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
            email: 'alice@devflow.local',
            name: 'Alice Engineer',
            joined_at: new Date().toISOString(),
          },
          {
            id: 'pm-2',
            project_id: 'proj-1',
            user_id: 'user-3',
            role: 'member',
            email: 'bob@devflow.local',
            name: 'Bob Developer',
            joined_at: new Date().toISOString(),
          },
        ],
      },
      meta: null,
    });
  });

  it('renders task details correctly', async () => {
    renderWithQueryClient(
      <TaskDetailModal
        isOpen={true}
        projectId="proj-1"
        taskId="task-100"
        onClose={mockOnClose}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('CORE-042')).toBeInTheDocument();
      expect(screen.getByText('Implement database connection pooling')).toBeInTheDocument();
      expect(screen.getByTestId('detail-task-description')).toHaveTextContent(
        'Use pgxpool with max 25 connections'
      );
      expect(screen.getByTestId('detail-task-creator')).toHaveTextContent('Project Owner');
      expect(screen.getByTestId('detail-task-priority-badge')).toHaveTextContent('High');
    });
  });

  it('allows quick status update directly from detail modal', async () => {
    vi.mocked(taskApi.updateTask).mockResolvedValue({
      success: true,
      data: { task: { ...mockTask, status: 'in_progress' } },
      meta: null,
    });

    renderWithQueryClient(
      <TaskDetailModal
        isOpen={true}
        projectId="proj-1"
        taskId="task-100"
        onClose={mockOnClose}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('detail-task-status-select')).toBeInTheDocument();
    });

    const statusSelect = screen.getByTestId('detail-task-status-select');
    fireEvent.change(statusSelect, { target: { value: 'in_progress' } });

    await waitFor(() => {
      expect(taskApi.updateTask).toHaveBeenCalledWith('task-100', { status: 'in_progress' });
    });
  });

  it('calls onEdit callback when clicking edit task button', async () => {
    renderWithQueryClient(
      <TaskDetailModal
        isOpen={true}
        projectId="proj-1"
        taskId="task-100"
        onClose={mockOnClose}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('edit-task-from-detail-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('edit-task-from-detail-button'));
    expect(mockOnEdit).toHaveBeenCalledWith(mockTask);
  });

  it('calls onDelete callback when clicking delete task button', async () => {
    renderWithQueryClient(
      <TaskDetailModal
        isOpen={true}
        projectId="proj-1"
        taskId="task-100"
        onClose={mockOnClose}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('delete-task-from-detail-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('delete-task-from-detail-button'));
    expect(mockOnDelete).toHaveBeenCalledWith(mockTask);
  });
});
