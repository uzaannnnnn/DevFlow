import React, { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { Project } from '../../projects/types';
import { Task, TaskStatus } from '../types';
import { useTasks, useUpdateTaskMutation } from '../useTasks';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import { TaskDetailModal } from './TaskDetailModal';
import { EditTaskModal } from './EditTaskModal';
import { DeleteTaskModal } from './DeleteTaskModal';
import { CreateTaskModal } from './CreateTaskModal';
import { LoadingSpinner } from '../../../shared/ui/LoadingSpinner';
import { AlertCircle } from 'lucide-react';

export interface KanbanBoardProps {
  project: Project;
  searchQuery?: string;
  priorityFilter?: string;
  assigneeFilter?: string;
}

const COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  project,
  searchQuery,
  priorityFilter,
  assigneeFilter,
}) => {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [createModalStatus, setCreateModalStatus] = useState<TaskStatus | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const activeFilters = {
    search: searchQuery?.trim() || undefined,
    priority: priorityFilter !== 'all' ? (priorityFilter as any) : undefined,
    assignee_id: assigneeFilter !== 'all' ? assigneeFilter : undefined,
    limit: 100, // board view fetches up to 100 tasks
  };

  const { data, isLoading, error } = useTasks(project.id, activeFilters);
  const updateMutation = useUpdateTaskMutation(project.id);

  const tasks = data?.tasks || [];

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const taskId = active.id as string;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // The over.id can be either a column status ('todo', 'in_progress', etc.)
    // or another task's id. We resolve the target status accordingly.
    let targetStatus: TaskStatus | null = null;
    if (COLUMNS.includes(over.id as TaskStatus)) {
      targetStatus = over.id as TaskStatus;
    } else {
      const targetTask = tasks.find((t) => t.id === over.id);
      if (targetTask) {
        targetStatus = targetTask.status;
      }
    }

    if (targetStatus && targetStatus !== task.status) {
      updateMutation.mutate({
        taskId: task.id,
        input: { status: targetStatus },
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-16 flex flex-col items-center justify-center gap-3">
        <LoadingSpinner size="lg" />
        <span className="text-sm text-slate-400">Loading Kanban board...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-950/40 border border-red-900/60 rounded-xl text-red-300 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
        <div>
          <p className="font-semibold text-sm">Failed to load board tasks</p>
          <p className="text-xs text-slate-400">{error.message || 'Please refresh and try again.'}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start w-full overflow-x-auto pb-4"
          data-testid="kanban-board-container"
        >
          {COLUMNS.map((status) => {
            const columnTasks = tasks.filter((t) => t.status === status);
            return (
              <KanbanColumn
                key={status}
                status={status}
                tasks={columnTasks}
                onSelectTask={setSelectedTaskId}
                onAddTask={(s) => setCreateModalStatus(s)}
              />
            );
          })}
        </div>

        {/* Drag Overlay for smooth preview */}
        <DragOverlay>
          {activeTask ? (
            <KanbanCard
              task={activeTask}
              onSelect={() => {}}
              isOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Task Modals */}
      {selectedTaskId && (
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
      )}

      {editingTask && (
        <EditTaskModal
          isOpen={Boolean(editingTask)}
          projectId={project.id}
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onUpdated={() => setEditingTask(null)}
        />
      )}

      {deletingTask && (
        <DeleteTaskModal
          isOpen={Boolean(deletingTask)}
          projectId={project.id}
          task={deletingTask}
          onClose={() => setDeletingTask(null)}
          onDeleted={() => setDeletingTask(null)}
        />
      )}

      {createModalStatus && (
        <CreateTaskModal
          isOpen={Boolean(createModalStatus)}
          projectId={project.id}
          initialStatus={createModalStatus}
          onClose={() => setCreateModalStatus(null)}
          onSuccess={() => setCreateModalStatus(null)}
        />
      )}
    </>
  );
};
