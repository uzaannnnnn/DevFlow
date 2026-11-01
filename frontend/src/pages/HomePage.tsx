import { useState, type FC } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiClientError } from '../shared/lib/api-client';
import { config } from '../shared/lib/config';
import { LoadingSpinner } from '../shared/ui/LoadingSpinner';
import {
  CheckCircle2,
  AlertTriangle,
  Database,
  Server,
  RefreshCw,
  ShieldCheck,
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
          <div className="space-y-6">
            {/* Workspace Banner */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold tracking-tight text-white">{activeWorkspace.name}</h2>
                  {activeRole && (
                    <span className="text-xs uppercase font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      {activeRole}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-400 mt-1">
                  Slug: <code className="text-slate-300 font-mono text-xs">{activeWorkspace.slug}</code>
                  {activeWorkspace.description && <span className="ml-2">· {activeWorkspace.description}</span>}
                </p>
              </div>

              <div className="text-xs text-slate-400">
                Created: {new Date(activeWorkspace.created_at).toLocaleDateString()}
              </div>
            </div>

            <div className="text-center max-w-xl mx-auto pt-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-3">
                <ShieldCheck className="h-3.5 w-3.5" />
                Multi-Tenant Isolation & RBAC Active
              </div>
              <h3 className="text-lg font-bold text-slate-200">
                Secure Tenant Workspace
              </h3>
              <p className="mt-1 text-sm text-slate-400">
                All data, permissions, and members are isolated to this workspace.
              </p>
            </div>

            {/* Integration Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Card 1: Backend Service Liveness */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-5 flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      <Server className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-200">Backend API</h3>
                      <p className="text-xs text-slate-500">{config.apiUrl}/health</p>
                    </div>
                  </div>

                  {healthQuery.isLoading ? (
                    <LoadingSpinner size="sm" />
                  ) : healthQuery.isSuccess ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {healthQuery.data.status}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Offline
                    </span>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800/80 text-xs text-slate-400 flex justify-between">
                  <span>Service: {healthQuery.data?.service || 'devflow-api'}</span>
                  <span>v{healthQuery.data?.version || '0.1.0'} [{healthQuery.data?.environment || config.isDev ? 'dev' : 'prod'}]</span>
                </div>
              </div>

              {/* Card 2: Database Readiness */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-5 flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <Database className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-200">PostgreSQL Database</h3>
                      <p className="text-xs text-slate-500">{config.apiUrl}/health/ready</p>
                    </div>
                  </div>

                  {readinessQuery.isLoading ? (
                    <LoadingSpinner size="sm" />
                  ) : readinessQuery.isSuccess && readinessQuery.data.database === 'connected' ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {readinessQuery.data.database}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/20">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Disconnected
                    </span>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800/80 text-xs text-slate-400 flex justify-between">
                  <span>PostgreSQL 16 Engine</span>
                  <span>Migration v2 Applied</span>
                </div>
              </div>
            </div>

            {/* Technical Stack Pills */}
            <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                <span>Active Workspace: <code className="text-slate-300 font-mono">{activeWorkspace.name}</code></span>
              </div>
              <div className="flex items-center gap-4 text-slate-400 font-mono text-[11px]">
                <span>RBAC 4-Tier Roles</span>
                <span>Tenant Isolation</span>
                <span>Project Boundary Isolation</span>
              </div>
            </div>
          </div>
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
