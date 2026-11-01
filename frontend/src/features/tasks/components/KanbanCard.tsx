import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Task, TASK_PRIORITY_CONFIG, TaskStatus } from '../types';
import { Calendar, User } from 'lucide-react';

export interface KanbanCardProps {
  task: Task;
  onSelect: (taskId: string) => void;
  isOverlay?: boolean;
}

export const KanbanCard: React.FC<KanbanCardProps> = ({
  task,
  onSelect,
  isOverlay = false,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: {
      type: 'task',
      task,
      status: task.status,
    },
    disabled: isOverlay,
  });

  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    opacity: isDragging ? 0.35 : 1,
  };

  const isOverdue = (dueDateStr?: string | null, status?: TaskStatus) => {
    if (!dueDateStr || status === 'done') return false;
    return new Date(dueDateStr).getTime() < Date.now();
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  };

  const priorityConfig = TASK_PRIORITY_CONFIG[task.priority] || TASK_PRIORITY_CONFIG.medium;
  const formattedDueDate = formatDate(task.due_date);
  const overdue = isOverdue(task.due_date, task.status);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(task.id)}
      className={`group relative rounded-xl border bg-slate-900/90 p-4 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing select-none ${
        isOverlay
          ? 'border-indigo-500 shadow-xl shadow-indigo-500/20 rotate-2 scale-105'
          : 'border-slate-800 hover:border-slate-700'
      }`}
      data-testid={`kanban-card-${task.id}`}
    >
      {/* Top row: Identifier and Priority */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-mono text-xs font-semibold text-indigo-400">
          {task.identifier}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border ${priorityConfig.bg} ${priorityConfig.text} ${priorityConfig.border}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${priorityConfig.dot}`} />
          {priorityConfig.label}
        </span>
      </div>

      {/* Title */}
      <h4
        onClick={(e) => {
          e.stopPropagation();
          onSelect(task.id);
        }}
        data-testid={`kanban-card-title-${task.id}`}
        className="text-sm font-medium text-slate-100 line-clamp-2 mb-3 group-hover:text-white cursor-pointer"
      >
        {task.title}
      </h4>

      {/* Footer: Due date & Assignee */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
        {formattedDueDate ? (
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-medium ${
              overdue ? 'text-rose-400 font-semibold' : 'text-slate-400'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{formattedDueDate}</span>
            {overdue && (
              <span className="ml-1 px-1 py-0.2 rounded text-[9px] bg-rose-500/10 text-rose-400 border border-rose-500/20">
                Overdue
              </span>
            )}
          </span>
        ) : (
          <span className="text-slate-600 text-[11px] italic">No due date</span>
        )}

        <div className="flex items-center gap-1.5">
          {task.assignee ? (
            <div
              className="flex items-center gap-1 text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded-full text-[11px]"
              title={`Assigned to ${task.assignee.name || task.assignee.email}`}
            >
              <User className="w-3 h-3 text-indigo-400" />
              <span className="truncate max-w-[80px]">
                {task.assignee.name || task.assignee.email.split('@')[0]}
              </span>
            </div>
          ) : (
            <span
              className="inline-flex items-center text-slate-500 text-[11px]"
              title="Unassigned"
            >
              <User className="w-3 h-3 mr-0.5" />
              Unassigned
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
