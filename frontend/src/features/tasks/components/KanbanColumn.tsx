import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Task, TaskStatus, TASK_STATUS_CONFIG } from '../types';
import { KanbanCard } from './KanbanCard';
import { Plus } from 'lucide-react';

export interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Task[];
  onSelectTask: (taskId: string) => void;
  onAddTask: (defaultStatus: TaskStatus) => void;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  status,
  tasks,
  onSelectTask,
  onAddTask,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: {
      type: 'column',
      status,
    },
  });

  const config = TASK_STATUS_CONFIG[status];

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-lg bg-subtle/50 border transition-colors min-h-[500px] w-full ${
        isOver
          ? 'border-accent bg-subtle ring-2 ring-accent/20'
          : 'border-line'
      }`}
      data-testid={`kanban-column-${status}`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between p-3 border-b border-line">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-2xs font-semibold border ${config.bg} ${config.text} ${config.border}`}
          >
            {config.label}
          </span>
          <span
            className="text-2xs font-mono font-semibold px-1.5 py-0.2 rounded bg-surface text-ink-2 border border-line"
            data-testid={`column-count-${status}`}
          >
            {tasks.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onAddTask(status)}
          className="p-1 rounded text-muted hover:text-ink hover:bg-subtle transition-colors"
          title={`Add task to ${config.label}`}
          data-testid={`add-task-to-${status}-button`}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Task Cards Container */}
      <div className="flex-1 p-2.5 space-y-2.5 overflow-y-auto max-h-[calc(100vh-280px)]">
        {tasks.map((task) => (
          <KanbanCard
            key={task.id}
            task={task}
            onSelect={onSelectTask}
          />
        ))}

        {tasks.length === 0 && (
          <div className="h-28 rounded-md border border-dashed border-line flex flex-col items-center justify-center p-3 text-center">
            <span className="text-2xs text-muted font-medium">No tasks in this column</span>
          </div>
        )}
      </div>
    </div>
  );
};
