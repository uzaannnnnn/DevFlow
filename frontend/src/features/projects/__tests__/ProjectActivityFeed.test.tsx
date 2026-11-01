import { screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectActivityFeed } from '../components/ProjectActivityFeed';
import { projectApi } from '../api';
import { renderWithQueryClient } from '../../../test/test-utils';
import { ActivityItem } from '../types';

vi.mock('../api', () => ({
  projectApi: {
    listActivities: vi.fn(),
  },
}));

const mockActivities: ActivityItem[] = [
  {
    id: 'act-1',
    project_id: 'proj-1',
    task_id: 'task-1',
    task_identifier: 'CORE-1',
    task_title: 'Setup Database',
    actor_id: 'user-1',
    actor: {
      id: 'user-1',
      email: 'alice@devflow.local',
      name: 'Alice Smith',
    },
    action: 'task_created',
    metadata: {},
    created_at: new Date().toISOString(),
  },
  {
    id: 'act-2',
    project_id: 'proj-1',
    task_id: 'task-1',
    task_identifier: 'CORE-1',
    task_title: 'Setup Database',
    actor_id: 'user-1',
    actor: {
      id: 'user-1',
      email: 'alice@devflow.local',
      name: 'Alice Smith',
    },
    action: 'task_status_changed',
    metadata: {
      old_status: 'todo',
      new_status: 'in_progress',
    },
    created_at: new Date().toISOString(),
  },
  {
    id: 'act-3',
    project_id: 'proj-1',
    task_id: 'task-2',
    task_identifier: 'CORE-2',
    task_title: 'Auth Flow',
    actor_id: 'user-2',
    actor: {
      id: 'user-2',
      email: 'bob@devflow.local',
      name: 'Bob Jones',
    },
    action: 'task_assigned',
    metadata: {
      assignee_id: 'user-2',
      assignee_name: 'Bob Jones',
    },
    created_at: new Date().toISOString(),
  },
  {
    id: 'act-4',
    project_id: 'proj-1',
    task_id: 'task-1',
    task_identifier: 'CORE-1',
    task_title: 'Setup Database',
    actor_id: 'user-1',
    actor: {
      id: 'user-1',
      email: 'alice@devflow.local',
      name: 'Alice Smith',
    },
    action: 'comment_added',
    metadata: {
      comment_id: 'c-1',
    },
    created_at: new Date().toISOString(),
  },
];

describe('ProjectActivityFeed Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    vi.mocked(projectApi.listActivities).mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<ProjectActivityFeed projectId="proj-1" />);

    expect(screen.getByTestId('activity-loading')).toBeInTheDocument();
  });

  it('renders empty state when there are no activities', async () => {
    vi.mocked(projectApi.listActivities).mockResolvedValue({
      success: true,
      data: { activities: [], total: 0 },
      meta: null,
    });

    renderWithQueryClient(<ProjectActivityFeed projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText('No activity yet')).toBeInTheDocument();
    });
  });

  it('renders list of activities correctly', async () => {
    vi.mocked(projectApi.listActivities).mockResolvedValue({
      success: true,
      data: { activities: mockActivities, total: 4 },
      meta: null,
    });

    renderWithQueryClient(<ProjectActivityFeed projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('project-activity-feed')).toBeInTheDocument();
    });

    expect(screen.getByText('Audit Trail (4)')).toBeInTheDocument();

    // Verify task_created
    expect(screen.getByText(/created task/i)).toBeInTheDocument();
    // Verify task_status_changed
    expect(screen.getByText(/changed status of/i)).toBeInTheDocument();
    expect(screen.getByText('in progress')).toBeInTheDocument();
    // Verify task_assigned
    expect(screen.getByText(/assigned/i)).toBeInTheDocument();
    // Verify comment_added
    expect(screen.getByText(/commented on/i)).toBeInTheDocument();
  });

  it('renders error state when api fails', async () => {
    vi.mocked(projectApi.listActivities).mockRejectedValue(new Error('Network error'));

    renderWithQueryClient(<ProjectActivityFeed projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load activity feed: Network error/i)).toBeInTheDocument();
    });
  });
});
