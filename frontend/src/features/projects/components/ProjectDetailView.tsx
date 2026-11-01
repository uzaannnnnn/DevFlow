import React, { useState } from 'react';
import { useProject } from '../useProjects';
import { canUpdateProject } from '../types';
import { ProjectMembersView } from './ProjectMembersView';
import { ProjectSettingsView } from './ProjectSettingsView';
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
} from 'lucide-react';

export interface ProjectDetailViewProps {
  projectId: string;
  onBack: () => void;
}

type ProjectTab = 'tasks' | 'members' | 'settings';

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
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          data-testid="back-to-projects-button"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Projects</span>
        </button>
      </div>

      {/* Project Banner */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold tracking-tight text-white">{project.name}</h2>
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              {project.key}
            </span>
            {project.role && (
              <span className="text-xs uppercase font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                {project.role === 'owner' ? (
                  <Shield className="w-3 h-3 text-amber-400" />
                ) : project.role === 'admin' ? (
                  <Shield className="w-3 h-3 text-blue-400" />
                ) : (
                  <User className="w-3 h-3 text-emerald-400" />
                )}
                {project.role}
              </span>
            )}
          </div>
          {project.description && (
            <p className="text-sm text-slate-400 max-w-2xl">{project.description}</p>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400 sm:self-center">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
            <Hash className="w-3.5 h-3.5 text-indigo-400" />
            <span>Tasks: <strong className="text-slate-200">{project.task_counter}</strong></span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-slate-800">
        <nav className="flex space-x-6 text-sm">
          <button
            type="button"
            onClick={() => setActiveTab('tasks')}
            className={`py-3 px-1 border-b-2 font-medium flex items-center gap-2 transition-colors ${
              activeTab === 'tasks'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
            data-testid="project-tab-tasks"
          >
            <CheckSquare className="w-4 h-4" />
            <span>Tasks</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('members')}
            className={`py-3 px-1 border-b-2 font-medium flex items-center gap-2 transition-colors ${
              activeTab === 'members'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
            data-testid="project-tab-members"
          >
            <Users className="w-4 h-4" />
            <span>Members</span>
          </button>

          {canManage && (
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`py-3 px-1 border-b-2 font-medium flex items-center gap-2 transition-colors ${
                activeTab === 'settings'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
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
