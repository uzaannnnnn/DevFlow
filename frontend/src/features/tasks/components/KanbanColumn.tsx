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
      className={`flex flex-col rounded-2xl bg-slate-950/60 border transition-colors min-h-[500px] w-full ${
        isOver
          ? 'border-indigo-500/80 bg-slate-900/60 ring-2 ring-indigo-500/20'
          : 'border-slate-800/80'
      }`}
      data-testid={`kanban-column-${status}`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${config.bg} ${config.text} ${config.border}`}
          >
            {config.label}
          </span>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400"
            data-testid={`column-count-${status}`}
          >
            {tasks.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onAddTask(status)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
          title={`Add task to ${config.label}`}
          data-testid={`add-task-to-${status}-button`}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Task Cards Container */}
      <div className="flex-1 p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-280px)]">
        {tasks.map((task) => (
          <KanbanCard
            key={task.id}
            task={task}
            onSelect={onSelectTask}
          />
        ))}

        {tasks.length === 0 && (
          <div className="h-32 rounded-xl border border-dashed border-slate-800/80 flex flex-col items-center justify-center p-4 text-center">
            <span className="text-xs text-slate-500">No tasks in this column</span>
          </div>
        )}
      </div>
    </div>
  );
};
