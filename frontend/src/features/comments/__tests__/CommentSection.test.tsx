import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommentSection } from '../components/CommentSection';
import { commentApi } from '../api';
import { Comment } from '../types';
import { renderWithQueryClient } from '../../../test/test-utils';

vi.mock('../api', () => ({
  commentApi: {
    listComments: vi.fn(),
    createComment: vi.fn(),
  },
}));

const mockComments: Comment[] = [
  {
    id: 'c-1',
    task_id: 'task-1',
    author_id: 'user-1',
    body: 'Initial architecture reviewed and approved.',
    author: {
      id: 'user-1',
      email: 'alice@devflow.local',
      name: 'Alice Architect',
    },
    created_at: new Date('2026-11-01T10:00:00Z').toISOString(),
    updated_at: new Date('2026-11-01T10:00:00Z').toISOString(),
  },
  {
    id: 'c-2',
    task_id: 'task-1',
    author_id: 'user-2',
    body: 'Implementation in progress on branch feat/kanban.',
    author: {
      id: 'user-2',
      email: 'bob@devflow.local',
      name: 'Bob Developer',
    },
    created_at: new Date('2026-11-01T11:00:00Z').toISOString(),
    updated_at: new Date('2026-11-01T11:00:00Z').toISOString(),
  },
];

describe('CommentSection Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders comments list with author name and comment text', async () => {
    vi.mocked(commentApi.listComments).mockResolvedValue({
      success: true,
      data: { comments: mockComments, total: 2 },
      meta: null,
    });

    renderWithQueryClient(<CommentSection taskId="task-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('comment-section')).toBeInTheDocument();
      expect(screen.getByText('Alice Architect')).toBeInTheDocument();
      expect(screen.getByText('Initial architecture reviewed and approved.')).toBeInTheDocument();
      expect(screen.getByText('Bob Developer')).toBeInTheDocument();
      expect(screen.getByText('Implementation in progress on branch feat/kanban.')).toBeInTheDocument();
    });

    expect(screen.getByText(/Comments \(2\)/i)).toBeInTheDocument();
  });

  it('displays empty state when there are no comments', async () => {
    vi.mocked(commentApi.listComments).mockResolvedValue({
      success: true,
      data: { comments: [], total: 0 },
      meta: null,
    });

    renderWithQueryClient(<CommentSection taskId="task-1" />);

    await waitFor(() => {
      expect(screen.getByText('No comments yet. Start the conversation!')).toBeInTheDocument();
    });
  });

  it('submits a new comment and resets input field', async () => {
    vi.mocked(commentApi.listComments).mockResolvedValue({
      success: true,
      data: { comments: mockComments, total: 2 },
      meta: null,
    });
    vi.mocked(commentApi.createComment).mockResolvedValue({
      success: true,
      data: {
        comment: {
          id: 'c-3',
          task_id: 'task-1',
          author_id: 'user-1',
          body: 'LGTM! Ready for merge.',
          author: { id: 'user-1', email: 'alice@devflow.local', name: 'Alice Architect' },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
      meta: null,
    });

    renderWithQueryClient(<CommentSection taskId="task-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('comment-input')).toBeInTheDocument();
    });

    const textarea = screen.getByTestId('comment-input');
    fireEvent.change(textarea, { target: { value: 'LGTM! Ready for merge.' } });

    const submitBtn = screen.getByTestId('submit-comment-button');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(commentApi.createComment).toHaveBeenCalledWith('task-1', {
        body: 'LGTM! Ready for merge.',
      });
    });

    expect(textarea).toHaveValue('');
  });
});
