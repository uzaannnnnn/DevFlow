export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface UserSummary {
  id: string;
  email: string;
  name?: string | null;
  avatar_url?: string | null;
}

export interface Task {
  id: string;
  project_id: string;
  identifier: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id?: string | null;
  due_date?: string | null;
  created_by: string;
  assignee?: UserSummary | null;
  creator?: UserSummary | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee_id?: string | null;
  due_date?: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee_id?: string | null;
  due_date?: string | null;
}

export interface TaskListFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export const TASK_STATUS_CONFIG: Record<
  TaskStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  todo: {
    label: 'To Do',
    bg: 'bg-subtle',
    text: 'text-muted',
    border: 'border-line',
  },
  in_progress: {
    label: 'In Progress',
    bg: 'bg-info-soft',
    text: 'text-info',
    border: 'border-info/25',
  },
  review: {
    label: 'Review',
    bg: 'bg-review-soft',
    text: 'text-review',
    border: 'border-review/25',
  },
  done: {
    label: 'Done',
    bg: 'bg-success-soft',
    text: 'text-success',
    border: 'border-success/25',
  },
};

export const TASK_PRIORITY_CONFIG: Record<
  TaskPriority,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  low: {
    label: 'Low',
    bg: 'bg-subtle',
    text: 'text-muted',
    border: 'border-line',
    dot: 'bg-faint',
  },
  medium: {
    label: 'Medium',
    bg: 'bg-info-soft',
    text: 'text-info',
    border: 'border-info/25',
    dot: 'bg-info',
  },
  high: {
    label: 'High',
    bg: 'bg-warning-soft',
    text: 'text-warning',
    border: 'border-warning/25',
    dot: 'bg-warning',
  },
  urgent: {
    label: 'Urgent',
    bg: 'bg-danger-soft',
    text: 'text-danger',
    border: 'border-danger/25',
    dot: 'bg-danger',
  },
};
