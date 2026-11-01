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
      <div className="p-8 text-center text-muted text-xs">
        Please select a workspace to view its projects.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-ink flex items-center gap-2">
            <FolderKanban className="w-4 h-4 text-accent" />
            <span>Projects</span>
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Projects in <span className="font-medium text-ink">{activeWorkspace.name}</span>. Access is strictly scoped to project members.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ink hover:bg-ink/90 active:bg-ink text-surface text-xs font-medium rounded-md shadow-sm transition-colors self-start sm:self-auto"
          data-testid="create-project-button"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Project</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects by name or key..."
          className="w-full pl-9 pr-4 py-2 bg-surface border border-line rounded-md text-xs text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          data-testid="project-search-input"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="p-3 bg-danger-soft border border-danger/25 rounded-md text-xs text-danger flex items-start gap-2.5"
        >
          <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold">Unable to Load Projects</h4>
            <p className="mt-0.5">{error.message || 'Failed to load projects'}</p>
          </div>
        </div>
      )}

      {/* Projects Grid / List */}
      {isLoading ? (
        <div className="p-16 flex flex-col items-center justify-center gap-3">
          <LoadingSpinner size="lg" />
          <span className="text-xs text-muted">Loading projects...</span>
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-surface border border-line rounded-lg p-10 text-center">
          <div className="w-10 h-10 rounded-md bg-subtle text-muted flex items-center justify-center mx-auto mb-3 border border-line">
            <FolderKanban className="w-5 h-5" />
          </div>
          {search ? (
            <div>
              <h3 className="text-sm font-semibold text-ink">No matching projects</h3>
              <p className="mt-1 text-xs text-muted">
                No projects matched your search for &quot;{search}&quot;.
              </p>
              <button
                type="button"
                onClick={() => setSearch('')}
                className="mt-3 px-3 py-1 text-xs font-medium text-accent hover:text-accent/80 transition-colors"
              >
                Clear Search
              </button>
            </div>
          ) : (
            <div>
              <h3 className="text-sm font-semibold text-ink">No projects yet</h3>
              <p className="mt-1 text-xs text-muted max-w-sm mx-auto">
                Get started by creating your first project in this workspace.
              </p>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-ink hover:bg-ink/90 text-surface text-xs font-medium rounded-md shadow-sm transition-colors"
                data-testid="empty-create-project-button"
              >
                <Plus className="w-3.5 h-3.5" />
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
              className="group bg-surface hover:bg-subtle/50 border border-line hover:border-line-strong rounded-lg p-4 transition-all cursor-pointer flex flex-col justify-between shadow-sm"
              data-testid={`project-card-${project.key}`}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-2xs font-semibold px-1.5 py-0.5 rounded bg-accent-soft text-accent border border-accent/25">
                      {project.key}
                    </span>
                    <h3 className="text-xs font-semibold text-ink group-hover:text-accent transition-colors">
                      {project.name}
                    </h3>
                  </div>

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

                {project.description ? (
                  <p className="text-xs text-muted mt-2 line-clamp-2">
                    {project.description}
                  </p>
                ) : (
                  <p className="text-2xs text-faint italic mt-2">No description</p>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-line flex items-center justify-between text-2xs text-muted">
                <div className="flex items-center gap-1 font-mono">
                  <Hash className="w-3 h-3 text-muted" />
                  <span>Tasks: <strong className="text-ink font-semibold">{project.task_counter}</strong></span>
                </div>

                <div className="flex items-center gap-1 text-muted group-hover:text-accent transition-colors">
                  <span>Open</span>
                  <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
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
