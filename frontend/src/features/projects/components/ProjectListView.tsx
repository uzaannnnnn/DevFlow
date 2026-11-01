import React, { useState } from 'react';
import { useWorkspace } from '../../workspace/WorkspaceContext';
import { useProjects } from '../useProjects';
import { CreateProjectModal } from './CreateProjectModal';
import { LoadingSpinner } from '../../../shared/ui/LoadingSpinner';
import {
  FolderKanban,
  Plus,
  Search,
  Shield,
  User,
  Hash,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';

export interface ProjectListViewProps {
  onSelectProject: (projectId: string) => void;
}

export const ProjectListView: React.FC<ProjectListViewProps> = ({
  onSelectProject,
}) => {
  const { activeWorkspace } = useWorkspace();
  const [search, setSearch] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const {
    data,
    isLoading,
    error,
  } = useProjects(activeWorkspace?.id, search);

  const projects = data?.projects || [];

  if (!activeWorkspace) {
    return (
      <div className="p-8 text-center text-slate-400">
        Please select a workspace to view its projects.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-indigo-400" />
            <span>Projects</span>
          </h2>
          <p className="text-sm text-slate-400">
            Projects in <span className="font-semibold text-slate-200">{activeWorkspace.name}</span>. Access is strictly scoped to project members.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors self-start sm:self-auto"
          data-testid="create-project-button"
        >
          <Plus className="w-4 h-4" />
          <span>New Project</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects by name or key..."
          className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          data-testid="project-search-input"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="p-4 bg-red-950/40 border border-red-900/60 rounded-xl text-sm text-red-300 flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold">Unable to Load Projects</h4>
            <p className="mt-1">{error.message || 'Failed to load projects'}</p>
          </div>
        </div>
      )}

      {/* Projects Grid / List */}
      {isLoading ? (
        <div className="p-16 flex flex-col items-center justify-center gap-3">
          <LoadingSpinner size="lg" />
          <span className="text-sm text-slate-400">Loading projects...</span>
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto mb-4 border border-indigo-500/20">
            <FolderKanban className="w-6 h-6" />
          </div>
          {search ? (
            <div>
              <h3 className="text-base font-semibold text-slate-200">No matching projects</h3>
              <p className="mt-1 text-sm text-slate-400">
                No projects matched your search for &quot;{search}&quot;.
              </p>
              <button
                type="button"
                onClick={() => setSearch('')}
                className="mt-4 px-3 py-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Clear Search
              </button>
            </div>
          ) : (
            <div>
              <h3 className="text-base font-semibold text-slate-200">No projects yet</h3>
              <p className="mt-1 text-sm text-slate-400 max-w-sm mx-auto">
                Get started by creating your first project in this workspace.
              </p>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
                data-testid="empty-create-project-button"
              >
                <Plus className="w-4 h-4" />
                <span>Create Your First Project</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => onSelectProject(project.id)}
              className="group bg-slate-950/40 hover:bg-slate-900/60 border border-slate-800 hover:border-indigo-500/50 rounded-xl p-5 transition-all cursor-pointer flex flex-col justify-between"
              data-testid={`project-card-${project.key}`}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      {project.key}
                    </span>
                    <h3 className="font-semibold text-slate-100 group-hover:text-indigo-300 transition-colors">
                      {project.name}
                    </h3>
                  </div>

                  {project.role && (
                    <span className="text-[11px] uppercase font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
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

                {project.description ? (
                  <p className="text-xs text-slate-400 mt-2.5 line-clamp-2">
                    {project.description}
                  </p>
                ) : (
                  <p className="text-xs text-slate-600 italic mt-2.5">No description</p>
                )}
              </div>

              <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-1 font-mono">
                  <Hash className="w-3.5 h-3.5 text-slate-500" />
                  <span>Tasks: <strong className="text-slate-300">{project.task_counter}</strong></span>
                </div>

                <div className="flex items-center gap-1 text-slate-400 group-hover:text-indigo-400 transition-colors">
                  <span>Open</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={isCreateModalOpen}
        workspaceId={activeWorkspace.id}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={(newProject) => {
          onSelectProject(newProject.id);
        }}
      />
    </div>
  );
};
