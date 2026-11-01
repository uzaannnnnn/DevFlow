import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateProjectModal } from '../components/CreateProjectModal';
import { projectApi } from '../api';
import { ApiClientError } from '../../../shared/lib/api-client';
import { renderWithQueryClient } from '../../../test/test-utils';

vi.mock('../api', () => ({
  projectApi: {
    createProject: vi.fn(),
  },
}));

describe('CreateProjectModal Component', () => {
  const mockOnClose = vi.fn();
  const mockOnCreated = vi.fn();
  const workspaceId = 'ws-test-uuid';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal with name, key, and description fields', () => {
    renderWithQueryClient(
      <CreateProjectModal
        isOpen={true}
        workspaceId={workspaceId}
        onClose={mockOnClose}
        onCreated={mockOnCreated}
      />
    );

    expect(screen.getByRole('heading', { name: /Create New Project/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Project Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Project Key/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Description/i)).toBeInTheDocument();
  });

  it('auto-suggests project key when button is clicked', async () => {
    renderWithQueryClient(
      <CreateProjectModal
        isOpen={true}
        workspaceId={workspaceId}
        onClose={mockOnClose}
        onCreated={mockOnCreated}
      />
    );

    const nameInput = screen.getByLabelText(/Project Name/i);
    fireEvent.change(nameInput, { target: { value: 'DevFlow Architecture' } });

    const suggestBtn = screen.getByTitle(/Generate key from project name/i);
    fireEvent.click(suggestBtn);

    const keyInput = screen.getByLabelText(/Project Key/i) as HTMLInputElement;
    expect(keyInput.value).toBe('DA');
  });

  it('submits valid form and invokes callbacks', async () => {
    const mockCreatedProject = {
      id: 'proj-123',
      workspace_id: workspaceId,
      name: 'Mobile Client',
      key: 'MOB',
      description: 'iOS and Android',
      task_counter: 0,
      created_by: 'user-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      role: 'owner' as const,
    };

    vi.mocked(projectApi.createProject).mockResolvedValue({
      success: true,
      data: { project: mockCreatedProject },
      meta: null,
    });

    renderWithQueryClient(
      <CreateProjectModal
        isOpen={true}
        workspaceId={workspaceId}
        onClose={mockOnClose}
        onCreated={mockOnCreated}
      />
    );

    fireEvent.change(screen.getByLabelText(/Project Name/i), {
      target: { value: 'Mobile Client' },
    });
    fireEvent.change(screen.getByLabelText(/Project Key/i), {
      target: { value: 'MOB' },
    });

    const submitBtn = screen.getByRole('button', { name: /^Create Project$/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(projectApi.createProject).toHaveBeenCalledWith(workspaceId, {
        name: 'Mobile Client',
        key: 'MOB',
        description: undefined,
      });
      expect(mockOnCreated).toHaveBeenCalledWith(mockCreatedProject);
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('displays error alert on duplicate key conflict (409)', async () => {
    vi.mocked(projectApi.createProject).mockRejectedValue(
      new ApiClientError(409, {
        code: 'CONFLICT',
        message: 'A project with key "MOB" already exists in this workspace',
        details: [],
      })
    );

    renderWithQueryClient(
      <CreateProjectModal
        isOpen={true}
        workspaceId={workspaceId}
        onClose={mockOnClose}
        onCreated={mockOnCreated}
      />
    );

    fireEvent.change(screen.getByLabelText(/Project Name/i), {
      target: { value: 'Mobile Client' },
    });
    fireEvent.change(screen.getByLabelText(/Project Key/i), {
      target: { value: 'MOB' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^Create Project$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/already exists in this workspace/i);
    });
  });
});
