import React, { useState } from 'react';
import { useTasks } from '../useTasks';
import { useProjectMembers } from '../../projects/useProjects';
import { Project } from '../../projects/types';
import {
  Task,
  TaskStatus,
  TaskPriority,
  TASK_STATUS_CONFIG,
  TASK_PRIORITY_CONFIG,
} from '../types';
import { CreateTaskModal } from './CreateTaskModal';
import { TaskDetailModal } from './TaskDetailModal';
import { EditTaskModal } from './EditTaskModal';
import { DeleteTaskModal } from './DeleteTaskModal';
import { KanbanBoard } from './KanbanBoard';
import { LoadingSpinner } from '../../../shared/ui/LoadingSpinner';
import {
  Plus,
  Search,
  Filter,
  CheckSquare,
  Calendar,
  User,
  AlertCircle,
  Edit2,
  Trash2,
  LayoutGrid,
  List as ListIcon,
} from 'lucide-react';

export interface TaskListViewProps {
  project: Project;
}

export const TaskListView: React.FC<TaskListViewProps> = ({ project }) => {
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string | 'all'>('all');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);

  const { data: membersData } = useProjectMembers(project.id);

  const activeFilters = {
    search: search.trim() || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    priority: priorityFilter !== 'all' ? priorityFilter : undefined,
    assignee_id: assigneeFilter !== 'all' ? assigneeFilter : undefined,
  };

  const { data, isLoading, error, refetch } = useTasks(project.id, activeFilters);

  const tasks = data?.tasks || [];
  const total = data?.total || 0;

  const isOverdue = (dueDateStr?: string | null, status?: TaskStatus) => {
    if (!dueDateStr || status === 'done') return false;
    return new Date(dueDateStr).getTime() < Date.now();
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  };

  const hasFilterActive =
    search.trim() !== '' ||
    statusFilter !== 'all' ||
    priorityFilter !== 'all' ||
    assigneeFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setPriorityFilter('all');
    setAssigneeFilter('all');
  };

  return (
    <div className="space-y-4">
      {/* Action and Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/40 p-3.5 rounded-xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Search bar */}
          <div className="relative min-w-[180px] max-w-xs flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              data-testid="search-tasks-input"
            />
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            data-testid="filter-status-select"
          >
            <option value="all">All Statuses</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="review">Review</option>
            <option value="done">Done</option>
          </select>

          {/* Priority filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | 'all')}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            data-testid="filter-priority-select"
          >
            <option value="all">All Priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>

          {/* Assignee filter */}
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            data-testid="filter-assignee-select"
          >
            <option value="all">All Assignees</option>
            {membersData?.members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.name || m.email}
              </option>
            ))}
          </select>

          {hasFilterActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors px-2 py-1"
              data-testid="clear-filters-button"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Actions: View Mode Switcher and Create Task */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* View Toggle */}
          <div className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('board')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'board'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              data-testid="view-mode-board-button"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Board</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              data-testid="view-mode-list-button"
            >
              <ListIcon className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
          </div>

          {/* Create Task Button */}
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20 whitespace-nowrap"
            data-testid="open-create-task-modal-button"
          >
            <Plus className="w-4 h-4" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Main View Area: Kanban Board vs Table List */}
      {viewMode === 'board' ? (
        <KanbanBoard
          project={project}
          searchQuery={search}
          priorityFilter={priorityFilter}
          assigneeFilter={assigneeFilter}
        />
      ) : (
        <>
          {/* Error Alert */}
          {error && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>Failed to load tasks: {error.message}</span>
              </div>
              <button
                type="button"
                onClick={() => refetch()}
                className="text-xs underline hover:text-rose-300"
              >
                Retry
              </button>
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
              <LoadingSpinner size="md" />
              <span className="text-sm">Loading tasks...</span>
            </div>
          )}

          {/* Task List / Table */}
          {!isLoading && !error && tasks.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden">
          <div className="divide-y divide-slate-800/80">
            {tasks.map((task) => (
              <div
                key={task.id}
                onClick={() => setSelectedTaskId(task.id)}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-900/60 transition-colors cursor-pointer group"
                data-testid={`task-row-${task.id}`}
              >
                {/* Left side: Identifier, Title, and Description */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold shrink-0 mt-0.5">
                    {task.identifier}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">
                      {task.title}
                    </h3>
                    {task.description && (
                      <p className="text-xs text-slate-400 truncate mt-0.5">
                        {task.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right side: Badges, Assignee, Due date, Actions */}
                <div className="flex items-center gap-3 shrink-0 flex-wrap sm:flex-nowrap">
                  {/* Status badge */}
                  <span
                    className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${
                      TASK_STATUS_CONFIG[task.status].bg
                    } ${TASK_STATUS_CONFIG[task.status].text} ${
                      TASK_STATUS_CONFIG[task.status].border
                    }`}
                  >
                    {TASK_STATUS_CONFIG[task.status].label}
                  </span>

                  {/* Priority badge */}
                  <span
                    className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${
                      TASK_PRIORITY_CONFIG[task.priority].bg
                    } ${TASK_PRIORITY_CONFIG[task.priority].text} ${
                      TASK_PRIORITY_CONFIG[task.priority].border
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${TASK_PRIORITY_CONFIG[task.priority].dot}`}
                    />
                    {TASK_PRIORITY_CONFIG[task.priority].label}
                  </span>

                  {/* Assignee */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-300 min-w-[100px]">
                    <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] text-slate-400 font-bold overflow-hidden shrink-0">
                      {task.assignee?.name ? (
                        task.assignee.name.charAt(0).toUpperCase()
                      ) : (
                        <User className="w-3 h-3 text-slate-500" />
                      )}
                    </div>
                    <span className="truncate max-w-[90px]">
                      {task.assignee?.name || task.assignee?.email?.split('@')[0] || (
                        <span className="text-slate-500 italic">Unassigned</span>
                      )}
                    </span>
                  </div>

                  {/* Due date */}
                  <div className="text-xs min-w-[70px] text-right">
                    <span
                      className={`inline-flex items-center gap-1 ${
                        isOverdue(task.due_date, task.status)
                          ? 'text-rose-400 font-semibold'
                          : 'text-slate-400'
                      }`}
                    >
                      <Calendar className="w-3 h-3" />
                      {formatDate(task.due_date)}
                    </span>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 pl-2 border-l border-slate-800">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTask(task);
                      }}
                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      title="Edit task"
                      data-testid={`edit-task-btn-${task.id}`}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingTask(task);
                      }}
                      className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Delete task"
                      data-testid={`delete-task-btn-${task.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* List Footer Count */}
          <div className="p-3 bg-slate-950/60 border-t border-slate-800/80 text-xs text-slate-400 flex items-center justify-between">
            <span>
              Showing <strong className="text-slate-200">{tasks.length}</strong> of{' '}
              <strong className="text-slate-200">{total}</strong> tasks
            </span>
            <span className="font-mono text-[11px] text-slate-500">
              Project Key: {project.key}
            </span>
          </div>
        </div>
      )}

      {/* Empty State: No tasks matching filter */}
      {!isLoading && !error && tasks.length === 0 && hasFilterActive && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-12 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <Filter className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold text-slate-200">No matching tasks</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            No tasks match the active filters or search criteria.
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-indigo-400 hover:text-indigo-300 underline font-medium"
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* Empty State: Zero tasks in project */}
      {!isLoading && !error && tasks.length === 0 && !hasFilterActive && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto border border-indigo-500/20">
            <CheckSquare className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-200">No tasks created yet</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              Create your first task to start tracking work under project{' '}
              <strong className="text-slate-300 font-mono">{project.key}</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20"
            data-testid="empty-create-task-button"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Task</span>
          </button>
        </div>
      )}
      </>
      )}

      {/* Modals */}
      <CreateTaskModal
        isOpen={isCreateOpen}
        projectId={project.id}
        onClose={() => setIsCreateOpen(false)}
        onCreated={() => refetch()}
      />

      <TaskDetailModal
        isOpen={Boolean(selectedTaskId)}
        projectId={project.id}
        taskId={selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        onEdit={(task) => {
          setSelectedTaskId(null);
          setEditingTask(task);
        }}
        onDelete={(task) => {
          setSelectedTaskId(null);
          setDeletingTask(task);
        }}
      />

      {editingTask && (
        <EditTaskModal
          isOpen={Boolean(editingTask)}
          projectId={project.id}
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onUpdated={() => {
            setEditingTask(null);
            refetch();
          }}
        />
      )}

      {deletingTask && (
        <DeleteTaskModal
          isOpen={Boolean(deletingTask)}
          projectId={project.id}
          task={deletingTask}
          onClose={() => setDeletingTask(null)}
          onDeleted={() => {
            setDeletingTask(null);
            refetch();
          }}
        />
      )}
    </div>
  );
};
