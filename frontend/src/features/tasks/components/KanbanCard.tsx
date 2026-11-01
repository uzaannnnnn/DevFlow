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
      className={`group relative rounded-md border bg-surface p-3 shadow-2xs hover:shadow-pop hover:border-line-strong transition-all cursor-grab active:cursor-grabbing select-none ${
        isOverlay
          ? 'border-accent shadow-modal rotate-1 scale-105 bg-surface ring-2 ring-accent/25'
          : 'border-line'
      }`}
      data-testid={`kanban-card-${task.id}`}
    >
      {/* Top row: Identifier and Priority */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-mono text-2xs font-semibold text-accent">
          {task.identifier}
        </span>
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-medium border ${priorityConfig.bg} ${priorityConfig.text} ${priorityConfig.border}`}
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
        className="text-xs font-medium text-ink line-clamp-2 mb-2 group-hover:text-accent cursor-pointer transition-colors"
      >
        {task.title}
      </h4>

      {/* Footer: Due date & Assignee */}
      <div className="flex items-center justify-between pt-2 border-t border-line text-2xs">
        {formattedDueDate ? (
          <span
            className={`inline-flex items-center gap-1 text-2xs font-medium font-mono ${
              overdue ? 'text-danger font-semibold' : 'text-muted'
            }`}
          >
            <Calendar className="w-3 h-3" />
            <span>{formattedDueDate}</span>
            {overdue && (
              <span className="ml-1 px-1 py-0.2 rounded text-2xs bg-danger-soft text-danger border border-danger/25">
                Overdue
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted text-2xs italic">No due date</span>
        )}

        <div className="flex items-center gap-1.5">
          {task.assignee ? (
            <div
              className="flex items-center gap-1 text-ink-2 bg-subtle border border-line px-1.5 py-0.5 rounded text-2xs"
              title={`Assigned to ${task.assignee.name || task.assignee.email}`}
            >
              <User className="w-3 h-3 text-muted" />
              <span className="truncate max-w-[80px]">
                {task.assignee.name || task.assignee.email.split('@')[0]}
              </span>
            </div>
          ) : (
            <span
              className="inline-flex items-center text-muted text-2xs italic"
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
