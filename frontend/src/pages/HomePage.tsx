import { useState, type FC } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiClientError } from '../shared/lib/api-client';
import {
  RefreshCw,
  LogOut,
  User as UserIcon,
  Briefcase,
  Users,
  Settings,
  LayoutDashboard,
  Plus,
  FolderKanban,
} from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';
import { useWorkspace } from '../features/workspace/WorkspaceContext';
import { WorkspaceSwitcher } from '../features/workspace/components/WorkspaceSwitcher';
import { WorkspaceMembersView } from '../features/workspace/components/WorkspaceMembersView';
import { WorkspaceSettingsView } from '../features/workspace/components/WorkspaceSettingsView';
import { CreateWorkspaceModal } from '../features/workspace/components/CreateWorkspaceModal';
import { ProjectListView } from '../features/projects/components/ProjectListView';
import { ProjectDetailView } from '../features/projects/components/ProjectDetailView';
import { DashboardView } from '../features/dashboard/DashboardView';
import { canUpdateWorkspace } from '../features/workspace/types';

interface HealthData {
  status: string;
  service: string;
  version: string;
  environment: string;
}

interface ReadinessData {
  status: string;
  database: string;
  service: string;
  version: string;
  environment: string;
}

type TabType = 'overview' | 'projects' | 'members' | 'settings';

export const HomePage: FC = () => {
  const { user, logout } = useAuth();
  const { workspaces, activeWorkspace, activeRole, isLoading: isWsLoading } = useWorkspace();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Synchronous state adjustment during render prevents any 1-frame transient render
  const [prevWorkspaceId, setPrevWorkspaceId] = useState(activeWorkspace?.id);
  if (activeWorkspace?.id !== prevWorkspaceId) {
    setPrevWorkspaceId(activeWorkspace?.id);
    setSelectedProjectId(null);
  }

  // 1. Query Backend Liveness (/health)
  const healthQuery = useQuery<HealthData, ApiClientError>({
    queryKey: ['system', 'health'],
    queryFn: async () => {
      const res = await apiClient.get<HealthData>('health');
      return res.data;
    },
  });

  // 2. Query Database Readiness (/health/ready)
  const readinessQuery = useQuery<ReadinessData, ApiClientError>({
    queryKey: ['system', 'readiness'],
    queryFn: async () => {
      const res = await apiClient.get<ReadinessData>('health/ready');
      return res.data;
    },
  });

  const handleRefresh = () => {
    healthQuery.refetch();
    readinessQuery.refetch();
  };

  const isRefreshing = healthQuery.isFetching || readinessQuery.isFetching;
  const canManageSettings = canUpdateWorkspace(activeRole);

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col">
      {/* Top Navigation */}
      <header className="border-b border-line bg-surface px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-ink flex items-center justify-center font-bold text-surface text-xs tracking-wider shadow-sm">
              DF
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-ink leading-none">DevFlow</h1>
              <p className="text-2xs font-mono text-muted mt-0.5">Project & Task Management</p>
            </div>
          </div>

          <div className="h-5 w-[1px] bg-line mx-1 hidden sm:block" />

          {/* Workspace Switcher */}
          <WorkspaceSwitcher />
        </div>

        <div className="flex items-center gap-2.5">
          {user && (
            <div className="flex items-center gap-2 text-xs text-ink-2 bg-subtle px-2.5 py-1 rounded-md border border-line">
              <UserIcon className="h-3.5 w-3.5 text-muted" />
              <span className="font-medium">{user.name || user.email}</span>
            </div>
          )}

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-surface border border-line hover:bg-subtle text-ink-2 transition-colors disabled:opacity-50"
            title="Refresh System Status"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {user && (
            <button
              onClick={() => logout()}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-danger-soft hover:bg-danger-soft/80 text-danger border border-danger/25 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          )}
        </div>
      </header>

      {/* Workspace Subheader Navigation */}
      {activeWorkspace && (
        <div className="border-b border-line bg-surface/80 px-4 sm:px-6 backdrop-blur overflow-x-auto scrollbar-none">
          <nav className="flex space-x-6 text-sm min-w-max">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`py-2.5 px-1 border-b-2 text-xs font-medium flex items-center gap-2 transition-colors ${
                activeTab === 'overview'
                  ? 'border-accent text-accent font-semibold'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
              data-testid="tab-overview"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Overview</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedProjectId(null);
                setActiveTab('projects');
              }}
              className={`py-2.5 px-1 border-b-2 text-xs font-medium flex items-center gap-2 transition-colors ${
                activeTab === 'projects'
                  ? 'border-accent text-accent font-semibold'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
              data-testid="tab-projects"
            >
              <FolderKanban className="w-4 h-4" />
              <span>Projects</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('members')}
              className={`py-2.5 px-1 border-b-2 text-xs font-medium flex items-center gap-2 transition-colors ${
                activeTab === 'members'
                  ? 'border-accent text-accent font-semibold'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
              data-testid="tab-members"
            >
              <Users className="w-4 h-4" />
              <span>Members</span>
            </button>

            {canManageSettings && (
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className={`py-2.5 px-1 border-b-2 text-xs font-medium flex items-center gap-2 transition-colors ${
                  activeTab === 'settings'
                    ? 'border-accent text-accent font-semibold'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
                data-testid="tab-settings"
              >
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </button>
            )}
          </nav>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-8 flex flex-col gap-6">
        {/* Empty State: No Workspace */}
        {!isWsLoading && workspaces.length === 0 && (
          <div className="bg-surface border border-line rounded-lg p-8 shadow-sm text-center py-12 px-6 max-w-md mx-auto my-auto">
            <div className="w-10 h-10 rounded-md bg-subtle text-muted flex items-center justify-center mx-auto mb-3 border border-line">
              <Briefcase className="w-5 h-5" />
            </div>
            <h2 className="text-base font-semibold text-ink">No Workspace Found</h2>
            <p className="mt-1.5 text-xs text-muted leading-relaxed">
              You are not a member of any workspace yet. Create a workspace to start managing projects, tasks, and inviting team members.
            </p>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="mt-5 inline-flex items-center gap-2 px-3.5 py-2 bg-ink hover:bg-ink/90 active:bg-ink text-surface text-xs font-medium rounded-md shadow-sm transition-colors"
              data-testid="create-first-workspace-button"
            >
              <Plus className="w-4 h-4" />
              <span>Create Your First Workspace</span>
            </button>
          </div>
        )}

        {/* Tab 1: Overview */}
        {activeWorkspace && activeTab === 'overview' && (
          <DashboardView
            onNavigateToProjects={() => setActiveTab('projects')}
            onSelectProject={(projectId) => {
              setSelectedProjectId(projectId);
              setActiveTab('projects');
            }}
          />
        )}

        {/* Tab 2: Projects */}
        {activeWorkspace && activeTab === 'projects' && (
          selectedProjectId ? (
            <ProjectDetailView
              projectId={selectedProjectId}
              onBack={() => setSelectedProjectId(null)}
            />
          ) : (
            <ProjectListView
              onSelectProject={(id) => setSelectedProjectId(id)}
            />
          )
        )}

        {/* Tab 3: Members */}
        {activeWorkspace && activeTab === 'members' && <WorkspaceMembersView />}

        {/* Tab 4: Settings */}
        {activeWorkspace && activeTab === 'settings' && canManageSettings && <WorkspaceSettingsView />}
      </main>

      {/* Create Workspace Modal */}
      <CreateWorkspaceModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      {/* Footer */}
      <footer className="border-t border-line py-4 text-center text-2xs text-muted font-mono">
        DevFlow — Task & Project Engine
      </footer>
    </div>
  );
};
