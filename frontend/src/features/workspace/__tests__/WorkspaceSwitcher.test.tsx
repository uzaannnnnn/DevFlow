import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceSwitcher } from '../components/WorkspaceSwitcher';
import { WorkspaceProvider } from '../WorkspaceContext';
import type { Workspace } from '../types';

vi.mock('../../auth/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'user-1', email: 'owner@devflow.local' },
    isAuthenticated: true,
  })),
}));

vi.mock('../api', () => ({
  workspaceApi: {
    listWorkspaces: vi.fn(),
    createWorkspace: vi.fn(),
  },
}));

const mockWorkspaces: Workspace[] = [
  {
    id: 'ws-1',
    name: 'Frontend Team',
    slug: 'frontend-team',
    owner_id: 'user-1',
    role: 'owner',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'ws-2',
    name: 'Backend Team',
    slug: 'backend-team',
    owner_id: 'user-2',
    role: 'admin',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

describe('WorkspaceSwitcher Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const renderComponent = () => {
    return render(
      <WorkspaceProvider skipAutoFetch={true} initialWorkspaces={mockWorkspaces}>
        <WorkspaceSwitcher />
      </WorkspaceProvider>
    );
  };

  it('renders active workspace name and role badge', () => {
    renderComponent();

    expect(screen.getByTestId('workspace-switcher-trigger')).toHaveTextContent('Frontend Team');
    expect(screen.getByTestId('active-role-badge')).toHaveTextContent('owner');
  });

  it('opens dropdown when clicked, showing available workspaces', () => {
    renderComponent();

    const trigger = screen.getByTestId('workspace-switcher-trigger');
    fireEvent.click(trigger);

    expect(screen.getByTestId('workspace-dropdown')).toBeInTheDocument();
    expect(screen.getByText('Backend Team')).toBeInTheDocument();
    expect(screen.getByText('Create Workspace')).toBeInTheDocument();
  });

  it('switches active workspace when clicking an item from dropdown', async () => {
    renderComponent();

    const trigger = screen.getByTestId('workspace-switcher-trigger');
    fireEvent.click(trigger);

    const backendOption = screen.getByText('Backend Team');
    fireEvent.click(backendOption);

    // Dropdown closes and trigger updates
    await waitFor(() => {
      expect(screen.queryByTestId('workspace-dropdown')).not.toBeInTheDocument();
      expect(screen.getByTestId('workspace-switcher-trigger')).toHaveTextContent('Backend Team');
      expect(screen.getByTestId('active-role-badge')).toHaveTextContent('admin');
    });
  });

  it('opens CreateWorkspaceModal when clicking Create Workspace trigger', () => {
    renderComponent();

    const trigger = screen.getByTestId('workspace-switcher-trigger');
    fireEvent.click(trigger);

    const createBtn = screen.getByTestId('create-workspace-trigger');
    fireEvent.click(createBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Create New Workspace')).toBeInTheDocument();
  });
});

