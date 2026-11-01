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
        <span className="text-sm text-slate-400">Loading workspace dashboard...</span>
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
      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-white">{activeWorkspace?.name}</h2>
            {activeRole && (
              <span className="text-xs uppercase font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                {activeRole}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Workspace Overview & Task Activity Summary
            {activeWorkspace?.description && <span className="ml-2">· {activeWorkspace.description}</span>}
          </p>
        </div>

        <button
          type="button"
          onClick={onNavigateToProjects}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors self-start sm:self-auto"
          data-testid="dashboard-view-projects-btn"
        >
          <FolderKanban className="w-4 h-4" />
          <span>View All Projects</span>
        </button>
      </div>

      {/* 4 Metric Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Projects */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Projects</span>
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <FolderKanban className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-bold text-white" data-testid="metric-total-projects">
              {totalProjects}
            </span>
            <span className="text-xs text-slate-500 ml-2">active</span>
          </div>
        </div>

        {/* Card 2: Total Tasks */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Tasks</span>
            <div className="p-2 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
              <CheckSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-bold text-white" data-testid="metric-total-tasks">
              {totalTasks}
            </span>
            <span className="text-xs text-slate-500 ml-2">across workspace</span>
          </div>
        </div>

        {/* Card 3: In Progress */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">In Progress</span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-bold text-white" data-testid="metric-in-progress">
              {inProgressTasks.length}
            </span>
            <span className="text-xs text-slate-500 ml-2">underway</span>
          </div>
        </div>

        {/* Card 4: Done */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Completed</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-bold text-white" data-testid="metric-done">
              {doneTasks.length}
            </span>
            <span className="text-xs text-slate-500 ml-2">tasks done</span>
          </div>
        </div>
      </div>

      {/* Status Breakdown Section */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-indigo-400" />
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
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-950/40 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              <span>Recently Updated Tasks</span>
            </h3>
            {totalTasks > 5 && (
              <span className="text-xs text-slate-500">Showing 5 of {totalTasks}</span>
            )}
          </div>

          {recentTasks.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-slate-800 rounded-lg">
              <CheckSquare className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-400">No tasks in this workspace</p>
              <p className="text-xs text-slate-500 mt-1">
                Select a project to create your first task.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {recentTasks.map((task) => {
                const project = projectMap.get(task.project_id);
                const statusCfg = TASK_STATUS_CONFIG[task.status];
                const priorityCfg = TASK_PRIORITY_CONFIG[task.priority];

                return (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTask(task)}
                    className="py-3 px-2 flex items-center justify-between gap-3 hover:bg-slate-900/60 rounded-lg cursor-pointer transition-colors"
                    data-testid={`dashboard-recent-task-${task.identifier}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-slate-800 text-slate-300 shrink-0">
                        {task.identifier}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">{task.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                          {project && <span>{project.name}</span>}
                          <span>•</span>
                          <span>{formatTime(task.updated_at)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}
                      >
                        {statusCfg.label}
                      </span>
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${priorityCfg.bg} ${priorityCfg.text} ${priorityCfg.border}`}
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
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-indigo-400" />
              <span>Projects ({projects.length})</span>
            </h3>
          </div>

          {projects.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-slate-800 rounded-lg">
              <FolderKanban className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-400">No projects yet</p>
              <button
                type="button"
                onClick={onNavigateToProjects}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Project</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {projects.map((proj) => (
                <div
                  key={proj.id}
                  onClick={() => onSelectProject(proj.id)}
                  className="p-3 bg-slate-900/50 hover:bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between cursor-pointer transition-colors"
                  data-testid={`dashboard-project-item-${proj.key}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                        {proj.key}
                      </span>
                      <h4 className="text-xs font-medium text-slate-200 truncate">{proj.name}</h4>
                    </div>
                    {proj.description && (
                      <p className="text-[11px] text-slate-500 truncate mt-1">{proj.description}</p>
                    )}
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500 shrink-0 ml-2" />
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
  const cfg = TASK_STATUS_CONFIG[status];
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-900/40 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-bold text-slate-200">{count}</span>
      </div>
      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full ${cfg.text === 'text-emerald-400' ? 'bg-emerald-500' : cfg.text === 'text-blue-400' ? 'bg-blue-500' : cfg.text === 'text-purple-400' ? 'bg-purple-500' : 'bg-slate-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-slate-500">{pct}% of tasks</span>
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
