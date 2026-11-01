import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from '../workspace/WorkspaceContext';
import { useProjects } from '../projects/useProjects';
import { taskApi } from '../tasks/api';
import {
  Task,
  TaskStatus,
  TASK_STATUS_CONFIG,
  TASK_PRIORITY_CONFIG,
} from '../tasks/types';
import { TaskDetailModal } from '../tasks/components/TaskDetailModal';
import { EditTaskModal } from '../tasks/components/EditTaskModal';
import { DeleteTaskModal } from '../tasks/components/DeleteTaskModal';
import { LoadingSpinner } from '../../shared/ui/LoadingSpinner';
import {
  FolderKanban,
  CheckSquare,
  Clock,
  CheckCircle2,
  ArrowRight,
  Plus,
  TrendingUp,
} from 'lucide-react';

export interface DashboardViewProps {
  onNavigateToProjects: () => void;
  onSelectProject: (projectId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigateToProjects,
  onSelectProject,
}) => {
  const { activeWorkspace, activeRole } = useWorkspace();
  const { data: projectsData, isLoading: isProjectsLoading } = useProjects(activeWorkspace?.id);

  const projects = projectsData?.projects || [];

  // Query tasks for all projects in the workspace
  const {
    data: allTasks = [],
    isLoading: isTasksLoading,
  } = useQuery<Task[]>({
    queryKey: ['workspace-all-tasks', activeWorkspace?.id, projects.map((p) => p.id).sort().join(',')],
    queryFn: async () => {
      if (projects.length === 0) return [];
      const responses = await Promise.all(
        projects.map((p) => taskApi.listTasks(p.id, { limit: 50 }))
      );
      return responses.flatMap((res) => res.data.tasks);
    },
    enabled: Boolean(activeWorkspace?.id && projects.length > 0),
  });

  // Modal states for task detail / edit / delete
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);

  if (isProjectsLoading || (projects.length > 0 && isTasksLoading)) {
    return (
      <div className="p-16 flex flex-col items-center justify-center gap-3" data-testid="dashboard-loading">
        <LoadingSpinner size="lg" />
        <span className="text-xs text-muted">Loading workspace dashboard...</span>
      </div>
    );
  }

  // Calculate metrics
  const totalProjects = projects.length;
  const totalTasks = allTasks.length;
  const todoTasks = allTasks.filter((t) => t.status === 'todo');
  const inProgressTasks = allTasks.filter((t) => t.status === 'in_progress');
  const reviewTasks = allTasks.filter((t) => t.status === 'review');
  const doneTasks = allTasks.filter((t) => t.status === 'done');

  // Sort recent tasks by updated_at descending
  const recentTasks = [...allTasks]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);

  // Map project id to project object for quick lookup
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  return (
    <div className="space-y-6" data-testid="dashboard-view">
      {/* Workspace Header Banner */}
      <div className="rounded-lg border border-line bg-surface p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-ink">{activeWorkspace?.name}</h2>
            {activeRole && (
              <span className="text-2xs uppercase font-semibold px-2 py-0.5 rounded border bg-accent-soft text-accent border-accent/25">
                {activeRole}
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-1">
            Workspace Overview & Task Activity Summary
            {activeWorkspace?.description && <span className="ml-2 font-normal">· {activeWorkspace.description}</span>}
          </p>
        </div>

        <button
          type="button"
          onClick={onNavigateToProjects}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-ink hover:bg-ink/90 text-surface text-xs font-medium rounded-md shadow-sm transition-colors self-start sm:self-auto"
          data-testid="dashboard-view-projects-btn"
        >
          <FolderKanban className="w-4 h-4" />
          <span>View All Projects</span>
        </button>
      </div>

      {/* 4 Metric Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Projects */}
        <div className="rounded-lg border border-line bg-surface p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-semibold uppercase tracking-wider text-muted">Total Projects</span>
            <div className="p-1.5 rounded bg-subtle text-ink-2 border border-line">
              <FolderKanban className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-semibold text-ink" data-testid="metric-total-projects">
              {totalProjects}
            </span>
            <span className="text-2xs text-muted ml-2">active</span>
          </div>
        </div>

        {/* Card 2: Total Tasks */}
        <div className="rounded-lg border border-line bg-surface p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-semibold uppercase tracking-wider text-muted">Total Tasks</span>
            <div className="p-1.5 rounded bg-subtle text-ink-2 border border-line">
              <CheckSquare className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-semibold text-ink" data-testid="metric-total-tasks">
              {totalTasks}
            </span>
            <span className="text-2xs text-muted ml-2">across workspace</span>
          </div>
        </div>

        {/* Card 3: In Progress */}
        <div className="rounded-lg border border-line bg-surface p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-semibold uppercase tracking-wider text-muted">In Progress</span>
            <div className="p-1.5 rounded bg-info-soft text-info border border-info/25">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-semibold text-ink" data-testid="metric-in-progress">
              {inProgressTasks.length}
            </span>
            <span className="text-2xs text-muted ml-2">underway</span>
          </div>
        </div>

        {/* Card 4: Done */}
        <div className="rounded-lg border border-line bg-surface p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-semibold uppercase tracking-wider text-muted">Completed</span>
            <div className="p-1.5 rounded bg-success-soft text-success border border-success/25">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-semibold text-ink" data-testid="metric-done">
              {doneTasks.length}
            </span>
            <span className="text-2xs text-muted ml-2">tasks done</span>
          </div>
        </div>
      </div>

      {/* Status Breakdown Section */}
      <div className="rounded-lg border border-line bg-surface p-5 shadow-sm space-y-3.5">
        <h3 className="text-xs font-semibold text-ink uppercase tracking-wider flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-accent" />
          <span>Task Status Breakdown</span>
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatusCountCard
            status="todo"
            label="To Do"
            count={todoTasks.length}
            total={totalTasks}
          />
          <StatusCountCard
            status="in_progress"
            label="In Progress"
            count={inProgressTasks.length}
            total={totalTasks}
          />
          <StatusCountCard
            status="review"
            label="In Review"
            count={reviewTasks.length}
            total={totalTasks}
          />
          <StatusCountCard
            status="done"
            label="Done"
            count={doneTasks.length}
            total={totalTasks}
          />
        </div>
      </div>

      {/* Two Column Layout: Recent Tasks & Active Projects */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Recent Tasks (2 cols) */}
        <div className="lg:col-span-2 rounded-lg border border-line bg-surface p-5 shadow-sm space-y-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-ink uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-accent" />
              <span>Recently Updated Tasks</span>
            </h3>
            {totalTasks > 5 && (
              <span className="text-2xs text-muted font-mono">Showing 5 of {totalTasks}</span>
            )}
          </div>

          {recentTasks.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-line rounded-md">
              <CheckSquare className="w-7 h-7 text-faint mx-auto mb-2" />
              <p className="text-xs font-medium text-muted">No tasks in this workspace</p>
              <p className="text-2xs text-muted mt-1">
                Select a project to create your first task.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-line">
              {recentTasks.map((task) => {
                const project = projectMap.get(task.project_id);
                const statusCfg = TASK_STATUS_CONFIG[task.status];
                const priorityCfg = TASK_PRIORITY_CONFIG[task.priority];

                return (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTask(task)}
                    className="py-2.5 px-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 hover:bg-subtle rounded-md cursor-pointer transition-colors"
                    data-testid={`dashboard-recent-task-${task.identifier}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="px-1.5 py-0.5 rounded text-2xs font-mono font-medium bg-subtle text-ink-2 border border-line shrink-0">
                        {task.identifier}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-ink truncate">{task.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-2xs text-muted">
                          {project && <span>{project.name}</span>}
                          <span>•</span>
                          <span className="font-mono">{formatTime(task.updated_at)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
                      <span
                        className={`text-2xs font-medium px-2 py-0.5 rounded border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}
                      >
                        {statusCfg.label}
                      </span>
                      <span
                        className={`text-2xs font-medium px-2 py-0.5 rounded border ${priorityCfg.bg} ${priorityCfg.text} ${priorityCfg.border}`}
                      >
                        {priorityCfg.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Active Projects */}
        <div className="rounded-lg border border-line bg-surface p-5 shadow-sm space-y-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-ink uppercase tracking-wider flex items-center gap-2">
              <FolderKanban className="w-3.5 h-3.5 text-accent" />
              <span>Projects ({projects.length})</span>
            </h3>
          </div>

          {projects.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-line rounded-md">
              <FolderKanban className="w-7 h-7 text-faint mx-auto mb-2" />
              <p className="text-xs font-medium text-muted">No projects yet</p>
              <button
                type="button"
                onClick={onNavigateToProjects}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-ink hover:bg-ink/90 text-surface transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Project</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {projects.map((proj) => (
                <div
                  key={proj.id}
                  onClick={() => onSelectProject(proj.id)}
                  className="p-2.5 bg-surface hover:bg-subtle border border-line hover:border-line-strong rounded-md flex items-center justify-between cursor-pointer transition-colors shadow-2xs"
                  data-testid={`dashboard-project-item-${proj.key}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded text-2xs font-mono font-semibold bg-accent-soft text-accent border border-accent/25">
                        {proj.key}
                      </span>
                      <h4 className="text-xs font-medium text-ink truncate">{proj.name}</h4>
                    </div>
                    {proj.description && (
                      <p className="text-2xs text-muted truncate mt-0.5">{proj.description}</p>
                    )}
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-muted shrink-0 ml-2" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          isOpen={Boolean(selectedTask)}
          projectId={selectedTask.project_id}
          taskId={selectedTask.id}
          onClose={() => setSelectedTask(null)}
          onEdit={(t) => {
            setSelectedTask(null);
            setEditingTask(t);
          }}
          onDelete={(t) => {
            setSelectedTask(null);
            setDeletingTask(t);
          }}
        />
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <EditTaskModal
          isOpen={Boolean(editingTask)}
          projectId={editingTask.project_id}
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onUpdated={() => setEditingTask(null)}
        />
      )}

      {/* Delete Task Modal */}
      {deletingTask && (
        <DeleteTaskModal
          isOpen={Boolean(deletingTask)}
          projectId={deletingTask.project_id}
          task={deletingTask}
          onClose={() => setDeletingTask(null)}
          onDeleted={() => setDeletingTask(null)}
        />
      )}
    </div>
  );
};

const StatusCountCard: React.FC<{
  status: TaskStatus;
  label: string;
  count: number;
  total: number;
}> = ({ status, label, count, total }) => {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  const barColor =
    status === 'done'
      ? 'bg-success'
      : status === 'in_progress'
      ? 'bg-info'
      : status === 'review'
      ? 'bg-review'
      : 'bg-muted';

  return (
    <div className="p-3 rounded-md border border-line bg-subtle/50 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted font-medium">{label}</span>
        <span className="font-semibold text-ink font-mono">{count}</span>
      </div>
      <div className="w-full bg-surface border border-line rounded-full h-1.5 overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-2xs text-muted font-mono">{pct}% of tasks</span>
    </div>
  );
};

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString();
  } catch {
    return 'recently';
  }
}
