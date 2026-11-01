import React, { useState } from 'react';
import { useProjectActivities } from '../useProjects';
import { ActivityItem } from '../types';
import { LoadingSpinner } from '../../../shared/ui/LoadingSpinner';
import {
  Activity,
  PlusCircle,
  ArrowRightCircle,
  UserPlus,
  UserMinus,
  MessageSquare,
  Trash2,
  Calendar,
  Flag,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export interface ProjectActivityFeedProps {
  projectId: string;
}

const PAGE_SIZE = 20;

export const ProjectActivityFeed: React.FC<ProjectActivityFeedProps> = ({ projectId }) => {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useProjectActivities(projectId, {
    page,
    page_size: PAGE_SIZE,
  });

  if (isLoading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center gap-3" data-testid="activity-loading">
        <LoadingSpinner size="md" />
        <span className="text-xs text-muted">Loading project activities...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-danger-soft border border-danger/25 rounded-md text-xs text-danger">
        <p>Failed to load activity feed: {error.message}</p>
      </div>
    );
  }

  const activities = data?.activities || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  if (activities.length === 0) {
    return (
      <div className="p-10 text-center border border-dashed border-line rounded-lg bg-surface">
        <Activity className="w-7 h-7 text-faint mx-auto mb-2" />
        <p className="text-xs font-medium text-muted">No activity yet</p>
        <p className="text-2xs text-muted mt-1">
          Actions taken on tasks in this project will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="project-activity-feed">
      <div className="flex items-center justify-between pb-2 border-b border-line">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-accent" />
          <span>Audit Trail ({total})</span>
        </h3>
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-2xs text-muted">
            <span className="font-mono">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1 rounded hover:bg-subtle text-muted hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1 rounded hover:bg-subtle text-muted hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2.5">
        {activities.map((item) => (
          <ActivityRow key={item.id} activity={item} />
        ))}
      </div>
    </div>
  );
};

const ActivityRow: React.FC<{ activity: ActivityItem }> = ({ activity }) => {
  const actorName = activity.actor?.name || activity.actor?.email?.split('@')[0] || 'User';
  const timeFormatted = formatTimeAgo(activity.created_at);

  return (
    <div
      className="p-3 bg-surface border border-line rounded-md flex items-start gap-2.5 shadow-2xs"
      data-testid={`activity-item-${activity.id}`}
    >
      <div className="mt-0.5">{getActivityIcon(activity.action)}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-ink-2 leading-relaxed">
          <span className="font-semibold text-ink">{actorName}</span>{' '}
          {renderActionContent(activity)}
        </div>
        <div className="flex items-center gap-2 mt-1 text-2xs text-muted">
          <span className="font-mono">{timeFormatted}</span>
          {activity.task_identifier && (
            <>
              <span>•</span>
              <span className="px-1.5 py-0.2 rounded bg-subtle border border-line font-mono text-2xs text-ink-2">
                {activity.task_identifier}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

function getActivityIcon(action: string) {
  switch (action) {
    case 'task_created':
      return <PlusCircle className="w-3.5 h-3.5 text-success" />;
    case 'task_status_changed':
      return <ArrowRightCircle className="w-3.5 h-3.5 text-info" />;
    case 'task_assigned':
      return <UserPlus className="w-3.5 h-3.5 text-accent" />;
    case 'task_unassigned':
      return <UserMinus className="w-3.5 h-3.5 text-muted" />;
    case 'task_priority_changed':
      return <Flag className="w-3.5 h-3.5 text-warning" />;
    case 'task_due_date_changed':
      return <Calendar className="w-3.5 h-3.5 text-review" />;
    case 'comment_added':
      return <MessageSquare className="w-3.5 h-3.5 text-accent" />;
    case 'task_deleted':
      return <Trash2 className="w-3.5 h-3.5 text-danger" />;
    default:
      return <Activity className="w-3.5 h-3.5 text-muted" />;
  }
}

function renderActionContent(activity: ActivityItem) {
  const meta = activity.metadata || {};
  const taskLabel = activity.task_identifier ? (
    <span className="font-semibold text-ink">{activity.task_identifier}</span>
  ) : (
    <span>a task</span>
  );

  switch (activity.action) {
    case 'task_created':
      return (
        <span>
          created task {taskLabel}
          {activity.task_title ? ` "${activity.task_title}"` : ''}
        </span>
      );
    case 'task_status_changed':
      return (
        <span>
          changed status of {taskLabel} from{' '}
          <span className="text-warning font-medium capitalize">
            {String(meta.old_status || '').replace('_', ' ')}
          </span>{' '}
          to{' '}
          <span className="text-success font-medium capitalize">
            {String(meta.new_status || '').replace('_', ' ')}
          </span>
        </span>
      );
    case 'task_priority_changed':
      return (
        <span>
          changed priority of {taskLabel} from{' '}
          <span className="text-muted font-medium capitalize">{String(meta.old_priority || '')}</span>{' '}
          to{' '}
          <span className="text-accent font-medium capitalize">{String(meta.new_priority || '')}</span>
        </span>
      );
    case 'task_assigned':
      return (
        <span>
          assigned {taskLabel} to{' '}
          <span className="text-ink font-semibold">{meta.assignee_name || 'a member'}</span>
        </span>
      );
    case 'task_unassigned':
      return <span>unassigned {taskLabel}</span>;
    case 'comment_added':
      return <span>commented on {taskLabel}</span>;
    case 'task_deleted':
      return <span>deleted task {taskLabel}</span>;
    case 'task_due_date_changed':
      return <span>updated due date for {taskLabel}</span>;
    default:
      return <span>performed {activity.action.replace(/_/g, ' ')}</span>;
  }
}

function formatTimeAgo(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return 'recently';
  }
}
