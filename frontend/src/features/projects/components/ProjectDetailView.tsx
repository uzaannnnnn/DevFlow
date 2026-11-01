import React, { useState } from 'react';
import { useProject } from '../useProjects';
import { canUpdateProject } from '../types';
import { ProjectMembersView } from './ProjectMembersView';
import { ProjectSettingsView } from './ProjectSettingsView';
import { ProjectActivityFeed } from './ProjectActivityFeed';
import { TaskListView } from '../../tasks/components/TaskListView';
import { LoadingSpinner } from '../../../shared/ui/LoadingSpinner';
import {
  ArrowLeft,
  CheckSquare,
  Users,
  Settings,
  Shield,
  User,
  Hash,
  AlertCircle,
  Activity,
} from 'lucide-react';

export interface ProjectDetailViewProps {
  projectId: string;
  onBack: () => void;
}

type ProjectTab = 'tasks' | 'members' | 'activity' | 'settings';

export const ProjectDetailView: React.FC<ProjectDetailViewProps> = ({
  projectId,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<ProjectTab>('tasks');

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useProject(projectId);

  const project = data?.project;

  if (isLoading) {
    return (
      <div className="p-16 flex flex-col items-center justify-center gap-3">
        <LoadingSpinner size="lg" />
        <span className="text-sm text-slate-400">Loading project details...</span>
      </div>
    );
  }

  if (error || !project) {
    const errorMsg =
      error && error.status === 404
        ? 'Project not found or you do not have permission to access it.'
        : error?.message || 'Project unavailable.';

    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Projects</span>
        </button>
        <div
          role="alert"
          className="p-6 bg-red-950/40 border border-red-900/60 rounded-xl text-red-300 space-y-2"
        >
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <span>Unable to Access Project</span>
          </div>
          <p className="text-sm text-slate-300">{errorMsg}</p>
        </div>
      </div>
    );
  }

  const canManage = canUpdateProject(project.role);

  return (
    <div className="space-y-5">
      {/* Back button */}
      <div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors font-medium"
          data-testid="back-to-projects-button"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Projects</span>
        </button>
      </div>

      {/* Project Banner */}
      <div className="rounded-lg border border-line bg-surface p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl font-semibold tracking-tight text-ink">{project.name}</h2>
            <span className="font-mono text-2xs font-semibold px-2 py-0.5 rounded bg-accent-soft text-accent border border-accent/25">
              {project.key}
            </span>
            {project.role && (
              <span className={`text-2xs uppercase font-medium px-2 py-0.5 rounded border flex items-center gap-1 ${
                project.role === 'owner'
                  ? 'bg-accent-soft text-accent border-accent/25'
                  : project.role === 'admin'
                  ? 'bg-info-soft text-info border-info/25'
                  : 'bg-success-soft text-success border-success/25'
              }`}>
                {project.role === 'owner' ? (
                  <Shield className="w-3 h-3 text-accent" />
                ) : project.role === 'admin' ? (
                  <Shield className="w-3 h-3 text-info" />
                ) : (
                  <User className="w-3 h-3 text-success" />
                )}
                {project.role}
              </span>
            )}
          </div>
          {project.description && (
            <p className="text-xs text-muted max-w-2xl mt-0.5">{project.description}</p>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-muted sm:self-center">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-subtle border border-line">
            <Hash className="w-3.5 h-3.5 text-accent" />
            <span>Tasks: <strong className="text-ink font-mono font-semibold">{project.task_counter}</strong></span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-line overflow-x-auto scrollbar-none">
        <nav className="flex space-x-6 text-sm min-w-max">
          <button
            type="button"
            onClick={() => setActiveTab('tasks')}
            className={`py-2.5 px-1 border-b-2 text-xs font-medium flex items-center gap-2 transition-colors ${
              activeTab === 'tasks'
                ? 'border-accent text-accent font-semibold'
                : 'border-transparent text-muted hover:text-ink'
            }`}
            data-testid="project-tab-tasks"
          >
            <CheckSquare className="w-4 h-4" />
            <span>Tasks</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('members')}
            className={`py-2.5 px-1 border-b-2 text-xs font-medium flex items-center gap-2 transition-colors ${
              activeTab === 'members'
                ? 'border-accent text-accent font-semibold'
                : 'border-transparent text-muted hover:text-ink'
            }`}
            data-testid="project-tab-members"
          >
            <Users className="w-4 h-4" />
            <span>Members</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('activity')}
            className={`py-2.5 px-1 border-b-2 text-xs font-medium flex items-center gap-2 transition-colors ${
              activeTab === 'activity'
                ? 'border-accent text-accent font-semibold'
                : 'border-transparent text-muted hover:text-ink'
            }`}
            data-testid="project-tab-activity"
          >
            <Activity className="w-4 h-4" />
            <span>Activity</span>
          </button>

          {canManage && (
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`py-2.5 px-1 border-b-2 text-xs font-medium flex items-center gap-2 transition-colors ${
                activeTab === 'settings'
                  ? 'border-accent text-accent font-semibold'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
              data-testid="project-tab-settings"
            >
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </button>
          )}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'tasks' && (
        <TaskListView project={project} />
      )}

      {activeTab === 'members' && (
        <ProjectMembersView
          project={project}
          onMemberChanged={() => refetch()}
          onProjectLeft={onBack}
        />
      )}

      {activeTab === 'activity' && (
        <ProjectActivityFeed projectId={project.id} />
      )}

      {activeTab === 'settings' && canManage && (
        <ProjectSettingsView
          project={project}
          onProjectUpdated={() => refetch()}
          onProjectArchived={onBack}
        />
      )}
    </div>
  );
};
