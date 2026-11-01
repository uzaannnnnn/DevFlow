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
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
              DF
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">DevFlow</h1>
              <p className="text-xs text-slate-400">Sprint 2 Phase 4 — Project & Task Management</p>
            </div>
          </div>

          <div className="h-6 w-[1px] bg-slate-800 mx-1 hidden sm:block" />

          {/* Workspace Switcher */}
          <WorkspaceSwitcher />
        </div>

        <div className="flex items-center gap-3">
          {user && (
            <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700">
              <UserIcon className="h-3.5 w-3.5 text-indigo-400" />
              <span className="font-medium">{user.name || user.email}</span>
            </div>
          )}

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors disabled:opacity-50"
            title="Refresh System Status"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {user && (
            <button
              onClick={() => logout()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          )}
        </div>
      </header>

      {/* Workspace Subheader Navigation */}
      {activeWorkspace && (
        <div className="border-b border-slate-800 bg-slate-950/20 px-6">
          <nav className="flex space-x-6 text-sm">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`py-3 px-1 border-b-2 font-medium flex items-center gap-2 transition-colors ${
                activeTab === 'overview'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
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
              className={`py-3 px-1 border-b-2 font-medium flex items-center gap-2 transition-colors ${
                activeTab === 'projects'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
              data-testid="tab-projects"
            >
              <FolderKanban className="w-4 h-4" />
              <span>Projects</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('members')}
              className={`py-3 px-1 border-b-2 font-medium flex items-center gap-2 transition-colors ${
                activeTab === 'members'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
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
                className={`py-3 px-1 border-b-2 font-medium flex items-center gap-2 transition-colors ${
                  activeTab === 'settings'
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
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
      <main className="flex-1 max-w-5xl w-full mx-auto p-6 md:p-8 flex flex-col gap-8">
        {/* Empty State: No Workspace */}
        {!isWsLoading && workspaces.length === 0 && (
          <div className="text-center py-16 px-4 max-w-md mx-auto">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto mb-4 border border-indigo-500/20">
              <Briefcase className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold">No Workspace Found</h2>
            <p className="mt-2 text-sm text-slate-400">
              You are not a member of any workspace yet. Create a workspace to start managing projects, tasks, and inviting team members.
            </p>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
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
      <footer className="border-t border-slate-800/60 py-4 text-center text-xs text-slate-500">
        DevFlow — Sprint 2 Phase 4 Verified Task Management Engine
      </footer>
    </div>
  );
};
